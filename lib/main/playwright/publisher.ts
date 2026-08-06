import { chromium, type Browser, type Page } from 'playwright'
import { readdirSync } from 'fs'
import { extname, join } from 'path'
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
  totalTasks: number
  signal: AbortSignal
}

type EventEmitter = (event: ScriptEvent) => void

// ---------------------------------------------------------------------------
// 视频选取
// ---------------------------------------------------------------------------

const VIDEO_EXTENSIONS = new Set(['.mp4', '.mov', '.avi', '.mkv', '.webm', '.flv'])

const pickVideo = (videoFolder: string, mode: 'sequential' | 'random', used: string[]): string | null => {
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

  const remaining = videos.filter((v) => !used.includes(v))
  const pool = remaining.length > 0 ? remaining : videos

  const chosen = mode === 'random' ? pool[Math.floor(Math.random() * pool.length)] : pool[0]
  return join(videoFolder, chosen)
}

// ---------------------------------------------------------------------------
// TikTok 上传辅助函数
// ---------------------------------------------------------------------------

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
          '[data-e2e="post_video_button"]:not([disabled])',
        ]
        for (const sel of selectors) {
          const el = document.querySelector(sel)
          if (el) return true
        }
        // 降级：检查是否有已启用的大按钮
        const buttons = document.querySelectorAll('button')
        for (const btn of buttons) {
          const text = btn.textContent?.toLowerCase().trim() || ''
          if ((text === 'post' || text === '发布') && !btn.disabled) return true
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

/**
 * 在 TikTok 上传页面选择视频文件
 */
const uploadVideo = async (page: Page, videoPath: string): Promise<boolean> => {
  try {
    // 先尝试直接通过 file input 上传
    const fileInput = page.locator('input[type="file"]')
    if ((await fileInput.count()) > 0) {
      await fileInput.setInputFiles(videoPath)
      return true
    }

    // 如果找不到 file input，点击上传按钮触发文件选择器
    const uploadTriggers = [
      page.locator('[data-e2e="upload_video_input"]'),
      page.locator('text=Select file to upload'),
      page.locator('text=Upload video'),
      page.locator('text=Upload'),
      page.locator('text=选择文件'),
      page.locator('[data-e2e="upload_video_button"]'),
    ]

    for (const trigger of uploadTriggers) {
      if ((await trigger.count()) > 0) {
        await trigger.first().click()
        await sleep(1500)
        // 点击后尝试再次查找 file input
        if ((await fileInput.count()) > 0) {
          await fileInput.setInputFiles(videoPath)
          return true
        }
      }
    }

    // 最后的尝试：拖拽上传区域
    const dropZone = page.locator('[data-e2e="upload_video_drop_zone"]')
    if ((await dropZone.count()) > 0) {
      await fileInput.setInputFiles(videoPath)
      return true
    }

    return false
  } catch {
    return false
  }
}

/**
 * 填写标题/描述
 */
const fillCaption = async (page: Page, title: string): Promise<boolean> => {
  try {
    // TikTok 的标题输入框是 contenteditable div
    const captionSelectors = [
      page.locator('[data-e2e="caption_input"]'),
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
        await el.fill(title)
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
      page.locator('button:has-text("Post")'),
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
// 发布主逻辑
// ---------------------------------------------------------------------------

export const publish = async (params: PublishParams, emit: EventEmitter): Promise<boolean> => {
  const { runId, threadId, profileId, profileName, debugPort, videoFolder, videoMode, title, hashtags, totalTasks, uploadWait, signal } = params

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

  try {
    // 连接 ixBrowser 已打开的窗口
    log('info', `正在连接浏览器 CDP: http://127.0.0.1:${debugPort}`)
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${debugPort}`)
    const context = browser.contexts[0] ?? (await browser.newContext())
    const page = context.pages[0] ?? (await context.newPage())
    log('info', '已接管浏览器窗口')

    for (let i = 1; i <= totalTasks; i++) {
      if (signal.aborted) {
        log('warn', '收到停止信号，中断发布')
        success = false
        break
      }

      // ---- 步骤 1 ----
      step('打开 TikTok 上传页面', i, totalTasks)
      log('info', `第 ${i}/${totalTasks} 个作品 - 打开 TikTok 上传页面`)
      await page.goto('https://www.tiktok.com/tiktokstudio/upload', { waitUntil: 'domcontentloaded', timeout: 30000 })
      await sleep(3000)

      // 检查是否需要登录
      const pageUrl = page.url()
      if (pageUrl.includes('login') || pageUrl === 'https://www.tiktok.com/') {
        log('error', 'TikTok 未登录，请在浏览器中先登录 TikTok 账号')
        success = false
        break
      }

      // ---- 步骤 2 ----
      step('选择视频上传', i, totalTasks)
      const videoPath = pickVideo(videoFolder, videoMode, usedVideos)
      if (!videoPath) {
        log('error', '未找到可用的视频文件')
        success = false
        break
      }
      usedVideos.push(videoPath)
      log('info', `上传视频: ${videoPath}`)

      const uploaded = await uploadVideo(page, videoPath)
      if (!uploaded) {
        log('error', '上传视频失败：无法找到文件上传控件')
        success = false
        break
      }
      log('info', '视频已选择，等待上传处理')

      // ---- 步骤 3 ----
      step('等待视频处理', i, totalTasks)
      log('info', '等待视频处理完成…')
      const processed = await waitForUpload(page, uploadWait)
      if (!processed) {
        log('warn', '视频处理可能未完成，继续下一步')
      }

      // ---- 步骤 4 ----
      step('填写描述', i, totalTasks)
      const caption = [title, hashtags].filter(Boolean).join('\n')
      if (caption) {
        const filled = await fillCaption(page, caption)
        if (filled) {
          log('info', `已填写描述: ${caption}`)
        } else {
          log('warn', '未找到描述输入框，跳过填写描述')
        }
      }

      // ---- 步骤 5 ----
      step('点击发布', i, totalTasks)
      const posted = await clickPost(page)
      if (posted) {
        log('info', '已点击发布按钮')
        await sleep(3000)
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