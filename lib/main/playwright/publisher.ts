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

/** 上传完成标签形状（如 "Uploaded（12.3MB）" / "已上传（1.2GB）"），带文件大小，避免误匹配页面其他位置的 "Uploaded" 字样 */
const UPLOADED_LABEL_PATTERN = /(?:Uploaded|已上传)\s*[（(]\s*\d+(?:\.\d+)?\s*(?:KB|MB|GB)/i

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
 *
 * 注意：必须匹配带文件大小的完整标签（如 "Uploaded（12.3MB）"），
 * 不能只匹配裸单词 "Uploaded"——实测上传面板其他位置（隐藏元素、
 * 辅助文本等）也可能出现该字样，裸匹配会导致上传尚未完成就误报成功。
 *
 * 轮询所有 frame（包括 iframe），因为 TikTok 的上传面板可能渲染在
 * iframe 中，主 frame 的 waitForFunction 无法访问 iframe 内容。
 */
const waitForUploaded = async (page: Page, timeoutSec: number): Promise<boolean> => {
  const deadline = Date.now() + timeoutSec * 1000
  while (Date.now() < deadline) {
    for (const frame of page.frames()) {
      try {
        const found = await frame.evaluate((patternSrc) => {
          const re = new RegExp(patternSrc, 'i')
          const body = document.body
          if (!body) return false
          const text = body.textContent ?? ''
          if (!re.test(text)) return false

          // 标签文本可能被拆成多个文本节点，先按文本节点精确匹配并确认可见；
          // 若整页文本已匹配到标签形状（带文件大小），则视为上传已完成。
          const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT)
          let node: Node | null = walker.nextNode()
          while (node) {
            const txt = node.textContent ?? ''
            if (re.test(txt)) {
              const parent = node.parentElement
              if (parent && parent.getClientRects().length > 0) return true
            }
            node = walker.nextNode()
          }
          return true
        }, UPLOADED_LABEL_PATTERN.source)
        if (found) return true
      } catch {
        // frame 可能正在导航或跨域，跳过
      }
    }
    await sleep(500)
  }
  return false
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
 * 等待上传开始，确认文件已被 TikTok 接受。
 * 检测信号（任一满足即视为上传已开始）：
 * 1. 选择视频卡片消失
 * 2. 进入编辑页（描述输入框 / 发布按钮出现）
 * 3. 出现 "Uploaded" 标签
 */
const waitForUploadStarted = async (page: Page): Promise<boolean> => {
  try {
    await page.waitForFunction(
      (patternSrc) => {
        // 1. 上传进度条出现（最可靠的信号，只在上传开始后才渲染）
        if (document.querySelector('[data-e2e="upload_status_container"]')) return true

        // 2. 选择视频卡片消失（或不存在）
        const card = document.querySelector('[data-e2e="select_video_container"]')
        const cardGone = !card || !(card as HTMLElement).offsetParent
        if (cardGone) return true

        // 3. 上传进行中文本
        const text = document.body?.textContent ?? ''
        if (/uploading|正在上传|上传中|处理中|processing/i.test(text)) return true

        // 4. 编辑页元素出现（描述输入框 / 发布按钮）
        const editEl = document.querySelector(
          '[data-e2e="caption_input"], button[data-e2e="post_video_button"], [data-e2e="post_video_button"], [data-e2e="upload_video_input"]'
        )
        if (editEl) return true

        // 5. "Uploaded" 上传完成标签出现（带文件大小，避免误匹配）
        const uploadedRe = new RegExp(patternSrc, 'i')
        if (uploadedRe.test(text)) return true

        return false
      },
      UPLOADED_LABEL_PATTERN.source,
      { timeout: 15000 }
    )
    return true
  } catch {
    return false
  }
}

/**
 * 检查 TikTok 上传是否已开始（或已完成）。
 * 检测信号（任一满足即视为上传已启动）：
 * 1. upload_status_container 上传进度条出现（上传进行中，最可靠的信号）
 * 2. "Uploaded" 标签出现（上传已完成，小文件可能很快跳过进度条阶段）
 * 3. 编辑页元素出现（描述输入框 / 发布按钮，上传完成后进入编辑页）
 *
 * 注意：TikTok 的上传面板可能渲染在 iframe 中，因此这里轮询所有 frame，
 * 而不是只用 page.waitForFunction（它只检查主 frame）。同时用硬截止时间
 * 控制超时，避免依赖 waitForFunction 的 timeout 选项（实测可能被默认
 * 30 秒超时覆盖，导致检测空等 30 秒）。
 */
const checkUploadStarted = async (page: Page, timeoutMs = 20000): Promise<boolean> => {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    for (const frame of page.frames()) {
      try {
        const started = await frame.evaluate((patternSrc) => {
          // 1. 上传进度条出现（上传进行中）
          if (document.querySelector('[data-e2e="upload_status_container"]')) return true
          // 2. 编辑页元素出现（上传完成进入编辑页）
          if (document.querySelector('[data-e2e="caption_input"], button[data-e2e="post_video_button"], [data-e2e="post_video_button"]')) return true
          // 3. "Uploaded" 上传完成标签出现（带文件大小，避免误匹配）
          const text = document.body?.textContent ?? ''
          const uploadedRe = new RegExp(patternSrc, 'i')
          if (uploadedRe.test(text)) return true
          // 4. 上传进行中文本信号（进度条渲染前或渲染中的文本提示，
          //    waitForUploadStarted 已包含此检查，这里同步补充）
          if (/uploading|正在上传|上传中|处理中|processing|上传进度/i.test(text)) return true
          return false
        }, UPLOADED_LABEL_PATTERN.source)
        if (started) return true
      } catch {
        // frame 可能正在导航或跨域，跳过继续轮询
      }
    }
    await sleep(500)
  }
  return false
}

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
const uploadVideo = async (page: Page, videoPath: string, log: (level: ScriptLogLevel, message: string) => void): Promise<boolean> => {
  // 0) 校验视频文件存在
  if (!existsSync(videoPath)) {
    log('warn', `视频文件不存在: ${videoPath}`)
    return false
  }
  log('info', `视频文件已确认: ${videoPath}`)

  // ------------------------------------------------------------------
  // 1) 点击可见按钮，捕获 filechooser 事件设置文件
  //    这是 React 隐藏 input 方案最可靠的方式：模拟真实用户点击触发
  //    inputRef.click() → 浏览器原生文件对话框 → Playwright 拦截
  // ------------------------------------------------------------------
  log('info', '策略1: 尝试点击按钮触发文件选择器')
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
      log('info', `策略1: 按钮 [${selector}] 触发了文件选择器，正在设置文件`)

      // 设置文件到浏览器。大文件通过 CDP 传输可能耗时较长（28MB 视频约 40 秒），
      // 且即使文件已部分传输到浏览器并启动了上传，CDP 响应也可能超时并抛出异常。
      // 因此单独捕获 setFiles 的错误，不因此放弃——后续通过检测上传进度条做最终判断。
      try {
        await chooser.setFiles(videoPath)
        log('info', `策略1: 文件传输完成 [${selector}]`)
      } catch (err) {
        log('warn', `策略1: setFiles 传输异常 (${err instanceof Error ? err.message : String(err)})，检查上传状态`)
      }

      // 检查上传是否实际开始：upload_status_container 是 TikTok 的上传进度条，
      // 只在浏览器成功接收到文件并开始上传后渲染。这是比 waitForUploadStarted
      // 更可靠的直接信号（检测上传进度条本身，而非间接推断页面切换）。
      // 即使 setFiles 抛出异常，文件也可能已传输到浏览器并启动了上传。
      if (await checkUploadStarted(page)) {
        log('info', `策略1: 上传已开始（进度条可见）[${selector}]`)
        return true
      }

      // 上传未开始，继续尝试下一个触发器
      log('warn', `策略1: 文件已设置但上传未开始 [${selector}]`)
    } catch {
      // 该触发器未弹出文件选择器，尝试下一个
    }
  }
  log('info', '策略1: 所有按钮尝试完毕，切换到策略2')

  // 进入策略2前，先检查页面是否已处于上传中状态。
  // 场景：setFiles 虽然 CDP 超时但文件已传输到浏览器并开始上传，
  // 此时页面已显示上传进度条，无需继续尝试后续策略以免重复设置文件。
  if (await checkUploadStarted(page, 5000)) {
    log('info', '策略1→策略2: 检测到页面已开始上传，跳过后续策略')
    return true
  }

  // ------------------------------------------------------------------
  // 2) 跨 frame 查找 file input，直接 setInputFiles（备用方案）
  // ------------------------------------------------------------------
  log('info', '策略2: 尝试直接查找文件输入控件并设置文件')
  let input = await findVideoInput(page)
  if (!input) {
    log('info', '策略2: 未找到文件输入控件，等待 10 秒后重试')
    try {
      await page.waitForSelector('input[type="file"]', { timeout: 10000, state: 'attached' })
    } catch {
      log('info', '策略2: 等待超时，文件输入控件未出现')
    }
    input = await findVideoInput(page)
  }

  if (input) {
    log('info', '策略2: 找到文件输入控件，正在设置文件')
    try {
      await input.setInputFiles(videoPath)
      log('info', '策略2: 文件已设置成功')

      // 验证页面是否切换状态，如果超时则乐观地继续（后面 waitForUploaded 会真正确认上传完成）
      if (await waitForUploadStarted(page)) {
        log('info', '策略2成功: 页面已切换到上传状态')
        return true
      }
      log('warn', '策略2: 页面未切换状态，但乐观继续（步骤3将确认上传完成）')
      return true
    } catch (err) {
      log('warn', `策略2: 直接设置文件失败: ${err instanceof Error ? err.message : String(err)}`)
    }
  } else {
    log('warn', '策略2: 未找到文件输入控件')
  }

  // 进入策略3前，再次检查页面是否已开始上传。
  if (await checkUploadStarted(page, 5000)) {
    log('info', '策略2→策略3: 检测到页面已开始上传，跳过策略3')
    return true
  }

  // ------------------------------------------------------------------
  // 3) 最后尝试点击拖拽区域后重试 setInputFiles
  // ------------------------------------------------------------------
  log('info', '策略3: 尝试点击拖拽区域后设置文件')
  const dropZoneSelectors = [
    '[data-e2e="select_video_container"]',
    '[data-e2e="upload_video_drop_zone"]',
    '.upload-card',
  ]
  for (const sel of dropZoneSelectors) {
    const zone = page.locator(sel).first()
    if ((await zone.count()) === 0) continue
    try {
      log('info', `策略3: 点击拖拽区域 [${sel}]`)
      await zone.click()
      await sleep(1000)
      input = await findVideoInput(page)
      if (input) {
        log('info', '策略3: 找到文件输入控件，正在设置文件')
        await input.setInputFiles(videoPath)
        if (await waitForUploadStarted(page)) {
          log('info', '策略3成功: 页面已切换到上传状态')
          return true
        }
        log('warn', '策略3: 页面未切换状态，但乐观继续')
        return true
      }
    } catch {
      // 继续尝试下一个
    }
  }

  log('warn', '所有上传方式均失败')
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
        await selector.first().click({ timeout: 5000 })
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
    // TikTok 通用弹窗关闭按钮（X）
    '.common-modal-close-icon',
    '.common-modal-close',
  ]

  for (const selector of closeSelectors) {
    try {
      const btn = page.locator(selector).first()
      if ((await btn.count()) > 0) {
        await btn.click({ timeout: 2000 })
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
const waitForPublishComplete = async (page: Page, timeoutSec: number, retryPost?: () => Promise<boolean>): Promise<boolean> => {
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

      // 5. 如果检测到"Content may be restricted"内容受限弹窗，关闭后重新点击发布
      if (retryPost && /content may be restricted/i.test(text)) {
        await sleep(1500)
        console.warn('[publisher] 检测到内容受限弹窗，关闭后重新尝试点击发布')
        await retryPost()
      }
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
 * 打开 TikTok 上传页面，并等待上传界面加载完成。
 * 兼容 connectOverCDP 接管已有页面时可能出现的导航中断（ERR_ABORTED）：
 * 页面可能正在被 SPA 路由跳转或扩展中断，简单重试一次即可。
 */
const openUploadPage = async (page: Page): Promise<boolean> => {
  const url = 'https://www.tiktok.com/tiktokstudio/upload?from=creator_center&tab=video'
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 })
      // 等待上传界面加载完成（"Select video to upload" 按钮出现）
      await page.waitForSelector(
        '[data-e2e="select_video_button"], .upload-stage-btn, .upload-stage-title',
        { timeout: 15000 }
      )
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

  log('info', `调试端口 ${debugPort}，视频目录=${videoFolder}，title=${title}，sentFileAction=${sentFileAction}`)

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

      const uploaded = await uploadVideo(page, videoPath, log)
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
        const confirmed = await waitForPublishComplete(page, uploadWait, () => clickPost(page))
        if (confirmed) {
          log('info', '发布已完成')
        } else {
          log('warn', '发布确认超时，但继续后续处理')
        }

        // 发布成功后处理已发送视频文件
        log('info', `发布成功，sentFileAction=${sentFileAction}，开始处理已发送文件`)
        if (sentFileAction === 'mark') {
          const filename = basename(videoPath)
          markFileAsSent(videoFolder, filename)
          sentFiles.push(filename)
          log('info', `已标记视频为已发送: ${filename}`)
        } else if (sentFileAction === 'delete') {
          try {
            unlinkSync(videoPath)
            log('info', `已删除已发送的视频文件: ${videoPath}`)
          } catch (err) {
            log('warn', `删除文件失败: ${videoPath} - ${err instanceof Error ? err.message : String(err)}`)
          }
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