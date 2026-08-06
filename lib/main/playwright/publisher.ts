import { chromium, type Browser, type Locator, type Page } from 'playwright'
import { existsSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'fs'
import { basename, extname, join } from 'path'
import type { ScriptEvent, ScriptLogLevel } from '@/lib/conveyor/schemas/script-schema'

// ---------------------------------------------------------------------------
// 类型
// ---------------------------------------------------------------------------

export interface PublishParams {
  runId: string
  threadId: string
  profileId: string
  profileName: string
  debugPort: number
  videoFolder: string
  videoMode: 'sequential' | 'random'
  title: string
  hashtags: string
  perAccount: number
  rounds: number
  uploadWait: number
  /** 上传完成后等待版权检测的时间（秒） */
  detectWait: number
  totalTasks: number
  signal: AbortSignal
  /** 发布后对视频文件的处理方式 */
  sentFileAction: 'keep' | 'mark' | 'delete'
}

type EventEmitter = (event: ScriptEvent) => void

// ---------------------------------------------------------------------------
// 视频选取
// ---------------------------------------------------------------------------

const VIDEO_EXTENSIONS = new Set(['.mp4', '.mov', '.avi', '.mkv', '.webm', '.flv'])

const SENT_FILES_NAME = '.sent-files.json'

const getSentFilesPath = (videoFolder: string): string => join(videoFolder, SENT_FILES_NAME)

const loadSentFiles = (videoFolder: string): string[] => {
  try {
    const data = JSON.parse(readFileSync(getSentFilesPath(videoFolder), 'utf-8'))
    return Array.isArray(data.files) ? data.files : []
  } catch {
    return []
  }
}

const markFileAsSent = (videoFolder: string, filename: string): void => {
  const path = getSentFilesPath(videoFolder)
  const files = loadSentFiles(videoFolder)
  if (!files.includes(filename)) {
    files.push(filename)
    writeFileSync(path, JSON.stringify({ files, updatedAt: Date.now() }, null, 2))
  }
}

const deleteFile = (fullPath: string): void => {
  try {
    unlinkSync(fullPath)
  } catch (err) {
    console.warn(`[publisher] 删除文件失败: ${fullPath}`, err)
  }
}

const pickVideo = (
  videoFolder: string,
  mode: 'sequential' | 'random',
  used: string[],
  sentFiles: string[] = [],
  sentFileAction: 'keep' | 'mark' | 'delete' = 'keep'
): string | null => {
  let files: string[]
  try {
    files = readdirSync(videoFolder)
  } catch {
    return null
  }

  const videos = files
    .filter((f) => VIDEO_EXTENSIONS.has(extname(f).toLowerCase()))
    .sort()

  if (videos.length === 0) return null

  // 排除已使用和已标记发送的文件
  const remaining = videos.filter((v) => !used.includes(v) && !sentFiles.includes(v))

  // mark 模式下所有视频都已发送 → 停止；其他模式重新从头循环
  const pool = remaining.length > 0 ? remaining : sentFileAction === 'mark' ? [] : videos
  if (pool.length === 0) return null

  const chosen = mode === 'random' ? pool[Math.floor(Math.random() * pool.length)] : pool[0]
  return join(videoFolder, chosen)
}

// ---------------------------------------------------------------------------
// TikTok 登录状态检查
// ---------------------------------------------------------------------------

/**
 * 检查 TikTok 登录状态，返回 true 表示已登录
 */
const checkLoginStatus = async (page: Page): Promise<boolean> => {
  try {
    // 1. 检查 URL 是否明显是登录页
    const url = page.url()
    if (url.includes('login') || url === 'https://www.tiktok.com/') {
      return false
    }

    // 2. 检查页面中是否存在已登录用户的元素（头像、用户名等）
    const loggedInIndicator = await page
      .locator(
        '[data-e2e="user-avatar"], [data-e2e="user-profile-icon"], [data-e2e="user-info"], [data-testid="userAvatar"]'
      )
      .first()
      .isVisible()
      .catch(() => false)

    // 如果在 upload 页面，检查是否有上传面板（新版页面 data-e2e 为 select_video_container / select_video_button）
    const uploadPanel = await page
      .locator(
        '[data-e2e="select_video_container"], [data-e2e="select_video_button"], [data-e2e="upload_video_input"], [data-e2e="upload_video_drop_zone"]'
      )
      .first()
      .isVisible()
      .catch(() => false)

    if (loggedInIndicator || uploadPanel) {
      return true
    }

    // 3. 兜底：检查 TikTok 的 session cookie（不上传页面的场景）
    const cookies = await page.context().cookies()
    const hasSession = cookies.some(
      (c) =>
        c.name.includes('sessionid') ||
        c.name.includes('sid') ||
        c.name === 'tt_webid' ||
        c.name === 'tt_csrf_token'
    )
    return hasSession
  } catch {
    return false
  }
}

// ---------------------------------------------------------------------------
// TikTok 上传辅助函数
// ---------------------------------------------------------------------------

/**
 * 等待上传完成标签出现。
 * TikTok 上传完成后会在视频名旁边显示 "Uploaded（xxxMB）" 标签，
 * 只有出现该标签才表示文件已真正上传到服务器。
 */
const waitForUploaded = async (page: Page, timeoutSec: number): Promise<boolean> => {
  try {
    await page.waitForFunction(
      () => {
        const text = document.body?.textContent ?? ''
        // 匹配 "Uploaded" 上传完成标签
        return /\bUploaded\b/i.test(text)
      },
      { timeout: timeoutSec * 1000 }
    )
    return true
  } catch {
    return false
  }
}

/**
 * 等待视频上传完成（Post 按钮变为可用）
 */
const waitForUpload = async (page: Page, timeoutSec: number): Promise<boolean> => {
  try {
    // TikTok 上传完成后 Post 按钮会变为可用
    await page.waitForFunction(
      () => {
        // 尝试多种选择器匹配 TikTok 的 Post 按钮
        const selectors = [
          'button[data-e2e="post_video_button"]:not([disabled])',
          'button:has-text("Post"):not([disabled])',
          'button:has-text("发布"):not([disabled])',
          'button:has-text("Publish"):not([disabled])',
          '[data-e2e="post_video_button"]:not([disabled])',
          '[data-e2e="publish_video_button"]:not([disabled])',
        ]
        for (const sel of selectors) {
          const el = document.querySelector(sel)
          if (el) return true
        }
        // 降级：检查是否有已启用的大按钮
        const buttons = document.querySelectorAll('button')
        for (const btn of buttons) {
          const text = btn.textContent?.toLowerCase().trim() || ''
          if ((text === 'post' || text === '发布' || text === 'publish') && !btn.disabled) return true
        }
        return false
      },
      { timeout: timeoutSec * 1000 }
    )
    return true
  } catch {
    return false
  }
}

// ---------------------------------------------------------------------------
// 跨 frame 查找文件输入控件
// ---------------------------------------------------------------------------

/**
 * 在所有 frame（主 frame + iframe）中查找第一个 input[type="file"]。
 * TikTok Studio 的上传面板可能渲染在 iframe 中，且页面里可能有多个隐藏的
 * file input（头像、封面等），因此统一取第一个匹配的。
 */
const findVideoInput = async (page: Page): Promise<Locator | null> => {
  const frames = [page.mainFrame(), ...page.frames()]
  for (const frame of frames) {
    const input = frame.locator('input[type="file"]').first()
    if ((await input.count()) > 0) return input
  }
  return null
}

/**
 * 等待上传卡片消失，确认上传已开始。
 * 返回 true 表示页面已从"选择视频"状态切换到"上传处理中"状态。
 */
const waitForUploadStarted = (page: Page): Promise<boolean> =>
  page
    .waitForSelector('[data-e2e="select_video_container"]', { state: 'hidden', timeout: 10000 })
    .then(() => true)
    .catch(() => false)

/**
 * 在 TikTok 上传页面选择视频文件
 *
 * 策略（降级）：
 * 1. 点击可见按钮，用 filechooser 事件设置文件（React 应用最可靠的方式）
 * 2. 跨 frame 查找 input[type="file"]，直接 setInputFiles（备用）
 * 3. 点击拖拽区域，再尝试 setInputFiles
 *
 * 每次设置文件后都验证页面是否切换到上传状态，否则继续降级。
 */
const uploadVideo = async (page: Page, videoPath: string): Promise<boolean> => {
  // 0) 校验视频文件存在
  if (!existsSync(videoPath)) {
    console.warn(`[publisher] 视频文件不存在: ${videoPath}`)
    return false
  }

  // ------------------------------------------------------------------
  // 1) 点击可见按钮，捕获 filechooser 事件设置文件
  //    这是 React 隐藏 input 方案最可靠的方式：模拟真实用户点击触发
  //    inputRef.click() → 浏览器原生文件对话框 → Playwright 拦截
  // ------------------------------------------------------------------
  const triggers = [
    '[data-e2e="select_video_button"]',
    '[data-e2e="select_video_container"]',
    'text=Select video to upload',
    'text=Select video',
    '.upload-stage-btn',
    '.upload-card',
    'text=Upload video',
    'text=Upload',
    'text=选择文件',
    '[data-e2e="upload_video_input"]',
    '[data-e2e="upload_video_button"]',
  ]

  for (const selector of triggers) {
    const trigger = page.locator(selector).first()
    if ((await trigger.count()) === 0) continue

    try {
      const [chooser] = await Promise.all([
        page.waitForEvent('filechooser', { timeout: 5000 }),
        trigger.click(),
      ])
      await chooser.setFiles(videoPath)

      // 验证页面是否切换到上传状态（上传卡片消失 → 视频处理中）
      if (await waitForUploadStarted(page)) {
        return true
      }
      console.warn(`[publisher] filechooser 设置了文件但页面未切换状态 (${selector})`)
    } catch {
      // 该触发器未弹出文件选择器，尝试下一个
    }
  }

  // ------------------------------------------------------------------
  // 2) 跨 frame 查找 file input，直接 setInputFiles（备用方案）
  // ------------------------------------------------------------------
  let input = await findVideoInput(page)
  if (!input) {
    try {
      await page.waitForSelector('input[type="file"]', { timeout: 10000, state: 'attached' })
    } catch {
      // 主 frame 没有，可能藏在 iframe 中
    }
    input = await findVideoInput(page)
  }

  if (input) {
    try {
      await input.setInputFiles(videoPath)

      // 验证页面是否切换状态
      if (await waitForUploadStarted(page)) {
        return true
      }
      console.warn('[publisher] setInputFiles 设置了文件但页面未切换状态')
    } catch (err) {
      console.warn('[publisher] setInputFiles 失败:', err)
    }
  }

  // ------------------------------------------------------------------
  // 3) 最后尝试点击拖拽区域后重试 setInputFiles
  // ------------------------------------------------------------------
  const dropZoneSelectors = [
    '[data-e2e="select_video_container"]',
    '[data-e2e="upload_video_drop_zone"]',
    '.upload-card',
  ]
  for (const sel of dropZoneSelectors) {
    const zone = page.locator(sel).first()
    if ((await zone.count()) === 0) continue
    try {
      await zone.click()
      await sleep(1000)
      input = await findVideoInput(page)
      if (input) {
        await input.setInputFiles(videoPath)
        if (await waitForUploadStarted(page)) {
          return true
        }
      }
    } catch {
      // 继续尝试下一个
    }
  }

  console.warn('[publisher] 所有上传方式均失败')
  return false
}

/**
 * 填写或清空标题/描述。
 * 先清空输入框，再填入内容（如果 title 不为空）。
 */
const fillCaption = async (page: Page, title: string): Promise<boolean> => {
  try {
    // TikTok 的标题输入框是 contenteditable div
    const captionSelectors = [
      page.locator('[data-e2e="caption_input"]'),
      page.locator('[data-e2e="caption_input"] div[contenteditable="true"]'),
      page.locator('div[contenteditable="true"][data-placeholder]'),
      page.locator('div[contenteditable="true"]'),
      page.locator('textarea[placeholder*="caption"]'),
      page.locator('textarea[placeholder*="Add"]'),
      page.locator('input[placeholder*="caption"]'),
    ]

    for (const selector of captionSelectors) {
      if ((await selector.count()) > 0) {
        const el = selector.first()
        await el.click()
        // 先清空，再填入内容（如果为空则相当于清空）
        await el.fill('')
        if (title) {
          await el.fill(title)
        }
        return true
      }
    }
    return false
  } catch {
    return false
  }
}

/**
 * 点击 Post/发布 按钮
 */
const clickPost = async (page: Page): Promise<boolean> => {
  try {
    const postSelectors = [
      page.locator('button[data-e2e="post_video_button"]'),
      page.locator('[data-e2e="post_video_button"]'),
      page.locator('[data-e2e="publish_video_button"]'),
      page.locator('button:has-text("Post")'),
      page.locator('button:has-text("Publish")'),
      page.locator('button:has-text("发布")'),
    ]

    for (const selector of postSelectors) {
      if ((await selector.count()) > 0) {
        await selector.first().click()
        return true
      }
    }
    return false
  } catch {
    return false
  }
}

// ---------------------------------------------------------------------------
// 发布完成确认 & 弹窗处理
// ---------------------------------------------------------------------------

/** 发布成功关键词（小写） */
const SUCCESS_KEYWORDS = ['posted', '发布成功', '已发布', '视频发布', '发布完成']

/**
 * 尝试关闭页面上出现的各类弹窗（发布确认、定时、错误提示等）。
 * 遍历常见关闭按钮选择器，点击可见的按钮。
 */
const dismissDialogs = async (page: Page): Promise<void> => {
  const closeSelectors = [
    'button:has-text("Close")',
    'button:has-text("关闭")',
    'button:has-text("OK")',
    'button:has-text("确定")',
    'button:has-text("Post now")',
    'button:has-text("立即发布")',
    'button:has-text("Post anyway")',
    'button:has-text("继续发布")',
    'button:has-text("Schedule")',
    'button:has-text("Don\'t schedule")',
    'button:has-text("不排期")',
    '[aria-label="Close"]',
    '[data-e2e="dialog-close"]',
  ]

  for (const selector of closeSelectors) {
    try {
      const btn = page.locator(selector).first()
      if ((await btn.count()) > 0) {
        await btn.click()
        await sleep(300)
      }
    } catch {
      // 忽略点击错误
    }
  }
}

/**
 * 等待发布完成确认。
 * 点击 Post 按钮后，TikTok 可能进入发布处理流程，期间可能显示
 * "Posting…" 加载状态、成功提示或各类弹窗。
 *
 * 返回 true 表示发布已确认完成，false 表示超时或无法确认。
 */
const waitForPublishComplete = async (page: Page, timeoutSec: number): Promise<boolean> => {
  const deadline = Date.now() + timeoutSec * 1000

  while (Date.now() < deadline) {
    try {
      // 1. 检查页面文本是否包含发布成功关键词
      const text = await page.evaluate(() => document.body.textContent?.toLowerCase() || '').catch(() => '')
      if (SUCCESS_KEYWORDS.some((kw) => text.includes(kw))) return true

      // 2. 检查是否已回到上传页面（上传卡片可见）
      const card = page.locator('[data-e2e="select_video_container"]').first()
      if ((await card.count()) > 0) {
        const visible = await card.isVisible().catch(() => false)
        if (visible) return true
      }

      // 3. 检查 Post 按钮是否消失（发布完成后页面切换）
      const postBtn = page.locator('button[data-e2e="post_video_button"], [data-e2e="post_video_button"]').first()
      if ((await postBtn.count()) === 0) return true

      // 4. 尝试关闭弹窗（定时发布、错误提示等）
      await dismissDialogs(page)
    } catch {
      // 页面可能正在导航，忽略
    }

    await sleep(800)
  }

  return false
}

// ---------------------------------------------------------------------------
// 发布主逻辑
// ---------------------------------------------------------------------------

/**
 * 打开 TikTok 上传页面。
 * 兼容 connectOverCDP 接管已有页面时可能出现的导航中断（ERR_ABORTED）：
 * 页面可能正在被 SPA 路由跳转或扩展中断，简单重试一次即可。
 */
const openUploadPage = async (page: Page): Promise<boolean> => {
  const url = 'https://www.tiktok.com/tiktokstudio/upload'
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 })
      // 等待页面完全加载（SPA 渲染 + 可能的登录重定向）
      await sleep(3000)
      return true
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      // 导航被中断（页面正在跳转/扩展拦截）— 重试一次
      if (msg.includes('ERR_ABORTED') && attempt === 1) {
        await sleep(1000)
        continue
      }
      console.warn('[publisher] 打开上传页面异常:', msg)
      return false
    }
  }
  return false
}

export const publish = async (params: PublishParams, emit: EventEmitter): Promise<boolean> => {
  const { runId, threadId, profileId, profileName, debugPort, videoFolder, videoMode, title, hashtags, totalTasks, uploadWait, detectWait, signal, sentFileAction } = params

  const log = (level: ScriptLogLevel, message: string) => {
    emit({ type: 'log', runId, threadId, level, message, ts: Date.now() })
  }

  const step = (step: string, current: number, total: number) => {
    emit({ type: 'step', runId, threadId, step, current, total })
  }

  emit({
    type: 'thread-started',
    runId,
    threadId,
    profileId,
    profileName,
  })

  log('info', `调试端口 ${debugPort}，视频目录=${videoFolder}，标题=${title}`)

  let browser: Browser | null = null
  let success = true
  const usedVideos: string[] = []
  // mark 模式：加载已发送记录，后续发布成功后写入
  const sentFiles = sentFileAction === 'mark' ? loadSentFiles(videoFolder) : []

  try {
    // 连接浏览器已打开的窗口
    log('info', `正在连接浏览器 CDP: http://127.0.0.1:${debugPort}`)
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${debugPort}`)
    const allContexts = browser.contexts()
    const context = allContexts[0] ?? (await browser.newContext())

    // 优先使用已有页面（HubStudio 已打开的页面），避免重复创建标签页
    const allPages = context.pages()
    const existingPage = allPages.length > 0
      ? allPages.find((p) => !p.url().includes('about:blank'))
      : null
    const page = existingPage ?? (allPages[0] ?? (await context.newPage()))
    log('info', `已接管浏览器窗口，当前页面: ${page.url()}`)

    for (let i = 1; i <= totalTasks; i++) {
      if (signal.aborted) {
        log('warn', '收到停止信号，中断发布')
        success = false
        break
      }

      // ---- 步骤 1 ----
      step('打开 TikTok 上传页面', i, totalTasks)
      log('info', `第 ${i}/${totalTasks} 个作品 - 打开 TikTok 上传页面`)
      // 页面导航可能因 SPA 跳转/扩展中断（ERR_ABORTED），内部已做重试
      const opened = await openUploadPage(page)
      if (!opened) {
        log('error', '打开 TikTok 上传页面失败，请检查网络或重新打开浏览器窗口')
        success = false
        break
      }

      // 检查 TikTok 登录状态（综合 URL + Cookie + 页面元素判断）
      const isLoggedIn = await checkLoginStatus(page)
      if (!isLoggedIn) {
        log('error', 'TikTok 未登录，请在浏览器中先登录 TikTok 账号')
        success = false
        break
      }

      // ---- 步骤 2 ----
      step('选择视频上传', i, totalTasks)
      const videoPath = pickVideo(videoFolder, videoMode, usedVideos, sentFiles, sentFileAction)
      if (!videoPath) {
        log('error', '未找到可用的视频文件')
        success = false
        break
      }
      usedVideos.push(videoPath)
      log('info', `上传视频: ${videoPath}`)

      const uploaded = await uploadVideo(page, videoPath)
      if (!uploaded) {
        log('error', '上传视频失败：无法找到文件上传控件，请确认 TikTok 上传页面已完全打开（显示"Select video to upload"）且视频文件存在')
        success = false
        break
      }
      log('info', '视频已选择，等待上传处理')

      // ---- 步骤 3 ----
      step('等待上传完成', i, totalTasks)
      log('info', '等待上传完成标签（Uploaded）…')
      const uploadDone = await waitForUploaded(page, uploadWait)
      if (!uploadDone) {
        log('warn', '未检测到 Uploaded 上传完成标签，继续等待视频处理')
      } else {
        log('info', '检测到 Uploaded 上传完成标签，文件已上传完成')
      }

      // ---- 步骤 4 ----
      step('等待视频处理', i, totalTasks)
      log('info', '等待视频处理完成…')
      const processed = await waitForUpload(page, uploadWait)
      if (!processed) {
        log('warn', '视频处理可能未完成，继续下一步')
      }
      // 视频处理完成后可能有弹窗（版权提示、定时发布等），尝试关闭
      await dismissDialogs(page)

      // ---- 步骤 5 ----
      step('等待版权检测', i, totalTasks)
      log('info', `等待版权检测完成（${detectWait} 秒）…`)
      if (detectWait > 0) {
        await sleep(detectWait * 1000)
        // 等待期间可能有弹窗出现，再次尝试关闭
        await dismissDialogs(page)
      }
      log('info', '版权检测等待完成')

      // ---- 步骤 6 ----
      step('填写描述', i, totalTasks)
      const caption = [title, hashtags].filter(Boolean).join('\n')
      const filled = await fillCaption(page, caption)
      if (filled) {
        log('info', caption ? `已填写描述: ${caption}` : '已清空描述输入框')
      } else {
        log('warn', '未找到描述输入框，跳过填写描述')
      }

      // ---- 步骤 7 ----
      step('点击发布', i, totalTasks)

      // 发布前先关闭可能残留的弹窗
      await dismissDialogs(page)

      const posted = await clickPost(page)
      if (posted) {
        log('info', '已点击发布按钮，等待发布完成确认')

        // 等待发布完成（处理中 → 成功提示 / 弹窗 / 页面跳转）
        const confirmed = await waitForPublishComplete(page, uploadWait)
        if (confirmed) {
          log('info', '发布已完成')
        } else {
          log('warn', '发布确认超时，但继续后续处理')
        }

        // 发布成功后处理已发送视频文件
        if (sentFileAction === 'mark') {
          const filename = basename(videoPath)
          markFileAsSent(videoFolder, filename)
          sentFiles.push(filename)
          log('info', `已标记视频为已发送: ${filename}`)
        } else if (sentFileAction === 'delete') {
          deleteFile(videoPath)
          log('info', `已删除已发送的视频文件: ${videoPath}`)
        }
      } else {
        log('error', '未找到发布按钮')
        success = false
        break
      }

      log('info', `第 ${i}/${totalTasks} 个作品已发布`)
    }

    if (success) log('info', '全部任务完成')
  } catch (err) {
    log('error', `任务异常: ${err instanceof Error ? err.message : String(err)}`)
    success = false
  } finally {
    if (browser) {
      try {
        await browser.close()
      } catch {
        // 忽略关闭时的错误
      }
    }
    log('info', 'Playwright 已断开连接')
    emit({ type: 'thread-finished', runId, threadId, profileId, success })
  }

  return success
}

// ---------------------------------------------------------------------------
// 工具
// ---------------------------------------------------------------------------

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))