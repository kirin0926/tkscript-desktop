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
// 等待上传
// ---------------------------------------------------------------------------

const waitForUpload = async (page: Page, timeoutSec: number): Promise<boolean> => {
  try {
    await page.waitForFunction(
      () => {
        const btn = document.querySelector('button:has-text("发布")')
        return btn !== null && !(btn as HTMLButtonElement).disabled
      },
      { timeout: timeoutSec * 1000 }
    )
    return true
  } catch {
    return false
  }
}

// ---------------------------------------------------------------------------
// 发布主逻辑
// ---------------------------------------------------------------------------

export const publish = async (params: PublishParams, emit: EventEmitter): Promise<boolean> => {
  const { runId, threadId, profileId, profileName, debugPort, videoFolder, videoMode, title, totalTasks, uploadWait, signal } = params

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
      step('打开抖音创作者中心', i, totalTasks)
      log('info', `第 ${i}/${totalTasks} 个作品 - 打开创作者中心`)
      await page.goto('https://creator.douyin.com/', { waitUntil: 'domcontentloaded' })
      await sleep(2000)

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

      try {
        const fileInput = page.locator('input[type="file"]')
        if (await fileInput.count() === 0) {
          // 点击上传按钮触发文件选择器
          await page.locator('text=上传视频').or(page.locator('text=选择文件')).first().click()
          await sleep(1500)
        }
        await fileInput.setInputFiles(videoPath)
        log('info', '视频已选择，等待上传处理')
      } catch (err) {
        log('error', `上传视频失败: ${err instanceof Error ? err.message : String(err)}`)
        success = false
        break
      }

      // ---- 步骤 3 ----
      step('等待视频处理', i, totalTasks)
      const uploaded = await waitForUpload(page, uploadWait)
      if (!uploaded) log('warn', '视频处理可能未完成，继续下一步')

      // ---- 步骤 4 ----
      step('填写标题', i, totalTasks)
      if (title) {
        try {
          const titleInput = page.locator(
            'input[placeholder*="标题"], input[placeholder*="title"], div[contenteditable="true"][placeholder*="标题"]'
          ).first()
          if ((await titleInput.count()) > 0) {
            await titleInput.click()
            await titleInput.fill(title)
            log('info', `已填写标题: ${title}`)
          } else {
            log('warn', '未找到标题输入框')
          }
        } catch (err) {
          log('error', `填写标题失败: ${err instanceof Error ? err.message : String(err)}`)
        }
      }

      // ---- 步骤 5 ----
      step('点击发布', i, totalTasks)
      try {
        const publishBtn = page.locator('button:has-text("发布")')
        if ((await publishBtn.count()) > 0) {
          await publishBtn.click()
          log('info', '已点击发布按钮')
          await sleep(2000)
        } else {
          log('warn', '未找到发布按钮')
        }
      } catch (err) {
        log('error', `点击发布失败: ${err instanceof Error ? err.message : String(err)}`)
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