import { randomUUID } from 'crypto'
import { getAdapter } from '@/lib/main/fingerprint'
import type { AppSettings } from '@/lib/conveyor/schemas/settings-schema'
import type { FpWindow } from '@/lib/conveyor/schemas/fingerprint-schema'
import type { ScriptEvent } from '@/lib/conveyor/schemas/script-schema'
import { publish } from '@/lib/main/playwright/publisher'

type EventEmitter = (event: ScriptEvent) => void

interface RunContext {
  runId: string
  settings: AppSettings
  emit: EventEmitter
  abortController: AbortController
}

const runs = new Map<string, RunContext>()
const pauseFlags = new Map<string, { paused: boolean; resolve: (() => void) | null }>()

// ---------------------------------------------------------------------------
// 窗口序列解析
// ---------------------------------------------------------------------------

const parseWindowSeq = (seq: string, total: number): number[] => {
  if (!seq.trim()) {
    return Array.from({ length: total }, (_, i) => i)
  }
  const result: number[] = []
  for (const part of seq.split(',')) {
    const trimmed = part.trim()
    if (!trimmed) continue
    const rangeMatch = trimmed.match(/^(\d+)-(\d+)$/)
    if (rangeMatch) {
      const start = Math.max(1, parseInt(rangeMatch[1], 10))
      const end = Math.min(total, parseInt(rangeMatch[2], 10))
      for (let i = start; i <= end; i++) result.push(i - 1)
    } else {
      const idx = parseInt(trimmed, 10)
      if (!Number.isNaN(idx) && idx >= 1 && idx <= total) {
        result.push(idx - 1)
      }
    }
  }
  return result
}

// ---------------------------------------------------------------------------
// 执行单个线程
// ---------------------------------------------------------------------------

const runThread = async (
  ctx: RunContext,
  threadId: string,
  window: FpWindow,
  totalTasks: number
): Promise<boolean> => {
  const { settings, emit } = ctx
  const conn = { apiHost: settings.publish.apiHost, apiPort: settings.publish.apiPort, apiKey: settings.publish.apiKey, fingerprintType: settings.publish.fingerprintType, appId: settings.publish.appId, appSecret: settings.publish.appSecret, groupCode: settings.publish.groupCode }
  const adapter = getAdapter(conn)

  // 通过指纹浏览器打开窗口获取 CDP 调试端口
  // 注意：如果窗口已在运行（status === 'running'），HubStudio/ixBrowser 的 openWindow
  // 实现会复用已有窗口（不会重复打开），因此这里始终保持调用 openWindow 获取正确端口。
  let debugPort = 9333
  try {
    const result = await adapter.openWindow(conn, window.id)
    debugPort = result.debugPort
  } catch (err) {
    emit({
      type: 'log',
      runId: ctx.runId,
      threadId,
      level: 'warn',
      message: `打开窗口失败，使用默认调试端口: ${err instanceof Error ? err.message : String(err)}`,
      ts: Date.now(),
    })
  }

  const perAccount = parseInt(settings.publish.perAccount, 10) || 1
  const rounds = parseInt(settings.publish.rounds, 10) || 1
  const uploadWait = parseInt(settings.publish.uploadWait, 10) || 30
  const detectWait = parseInt(settings.publish.detectWait, 10) || 30
  const closeAfterPublish = settings.publish.closeAfterPublish ?? false
  const closeWait = parseInt(settings.publish.closeWait, 10) || 15

  emit({
    type: 'log',
    runId: ctx.runId,
    threadId,
    level: 'info',
    message: `窗口 ${window.name} 开始发布任务，发布策略: perAccount=${perAccount}, rounds=${rounds}, totalTasks=${perAccount * rounds}, uploadWait=${uploadWait}s, detectWait=${detectWait}s, closeAfterPublish=${closeAfterPublish}, closeWait=${closeWait}s`,
    ts: Date.now(),
  })

  // 合并该窗口的覆盖设置（窗口设置弹窗里配置的独立素材/作品/资料）
  const override = settings.windowOverrides?.[window.id]
  const material = { ...settings.material, ...(override?.material ?? {}) }
  const works = { ...settings.works, ...(override?.works ?? {}) }

  emit({
    type: 'log',
    runId: ctx.runId,
    threadId,
    level: 'info',
    message: `发布素材: videoFolder=${material.videoFolder}, videoMode=${material.videoMode}, sentFileAction=${material.sentFileAction}, title=${works.title || '(空)'}, hashtags=${works.hashtags || '(空)'}`,
    ts: Date.now(),
  })

  const result = await publish(
    {
      runId: ctx.runId,
      threadId,
      profileId: window.id,
      profileName: window.name,
      debugPort,
      videoFolder: material.videoFolder,
      videoMode: material.videoMode,
      sentFileAction: material.sentFileAction,
      title: works.title,
      hashtags: works.hashtags,
      perAccount,
      rounds,
      uploadWait,
      detectWait,
      totalTasks,
      signal: ctx.abortController.signal,
    },
    emit
  )

  // 发布完成后关闭窗口环境
  if (closeAfterPublish) {
    emit({
      type: 'log',
      runId: ctx.runId,
      threadId,
      level: 'info',
      message: `发布任务完成，${closeWait} 秒后关闭窗口环境: ${window.name}`,
      ts: Date.now(),
    })
    // 发布完成后等待一段时间再关闭窗口，确保 TikTok 完成发布收尾
    if (closeWait > 0) {
      await sleep(closeWait * 1000)
    }
    try {
      const closed = await adapter.closeWindow(conn, window.id)
      if (closed) {
        emit({
          type: 'log',
          runId: ctx.runId,
          threadId,
          level: 'info',
          message: `窗口已关闭: ${window.name}`,
          ts: Date.now(),
        })
      } else {
        emit({
          type: 'log',
          runId: ctx.runId,
          threadId,
          level: 'warn',
          message: `关闭窗口失败: ${window.name}`,
          ts: Date.now(),
        })
      }
    } catch (err) {
      emit({
        type: 'log',
        runId: ctx.runId,
        threadId,
        level: 'warn',
        message: `关闭窗口异常: ${err instanceof Error ? err.message : String(err)}`,
        ts: Date.now(),
      })
    }
  } else {
    emit({
      type: 'log',
      runId: ctx.runId,
      threadId,
      level: 'info',
      message: `发布任务完成，closeAfterPublish=${closeAfterPublish}，不关闭窗口`,
      ts: Date.now(),
    })
  }

  return result
}

// ---------------------------------------------------------------------------
// 启动发布
// ---------------------------------------------------------------------------

export const startScript = async (
  settings: AppSettings,
  emit: EventEmitter
): Promise<{ runId: string }> => {
  const runId = randomUUID()
  const abortController = new AbortController()
  const ctx: RunContext = {
    runId,
    settings,
    emit,
    abortController,
  }
  runs.set(runId, ctx)

  const conn = { apiHost: settings.publish.apiHost, apiPort: settings.publish.apiPort, apiKey: settings.publish.apiKey, fingerprintType: settings.publish.fingerprintType, appId: settings.publish.appId, appSecret: settings.publish.appSecret, groupCode: settings.publish.groupCode }
  const adapter = getAdapter(conn)

  // 1. 拉取窗口列表
  let windows: FpWindow[] = []
  try {
    windows = await adapter.listWindows(conn)
  } catch (err) {
    emit({
      type: 'run-aborted',
      runId,
      reason: `拉取窗口失败：${err instanceof Error ? err.message : '未知错误'}`,
    })
    runs.delete(runId)
    return { runId }
  }

  // 2. 解析目标窗口：优先按勾选的窗口 ID 精确匹配；否则按分组 + 序列号
  const windowIds = settings.publish.windowIds ?? []
  let chosen: FpWindow[]
  if (windowIds.length > 0) {
    const idSet = new Set(windowIds)
    chosen = windows.filter((w) => idSet.has(w.id))
  } else {
    let candidates = windows
    if (settings.publish.group && settings.publish.group !== 'all') {
      candidates = candidates.filter((w) => w.groupId === settings.publish.group)
    }
    const indices = parseWindowSeq(settings.publish.windowSeq, candidates.length)
    chosen = indices.map((i) => candidates[i]).filter(Boolean)
  }

  if (chosen.length === 0) {
    emit({
      type: 'run-aborted',
      runId,
      reason: windowIds.length > 0 ? '勾选的窗口不在最新窗口列表中，请刷新窗口列表后重试' : '没有匹配的窗口',
    })
    runs.delete(runId)
    return { runId }
  }

  // 3. 并发调度（后台执行，立即返回 runId，避免 IPC 一直等到任务结束）
  const threads = parseInt(settings.publish.threads, 10) || 1
  const perAccount = parseInt(settings.publish.perAccount, 10) || 1
  const rounds = parseInt(settings.publish.rounds, 10) || 1
  const totalTasks = perAccount * rounds

  emit({ type: 'run-started', runId, totalThreads: chosen.length })
  void scheduleRun(ctx, chosen, totalTasks)
  return { runId }
}

/**
 * 后台并发调度：从队列中取窗口交给空闲线程执行，
 * 全部结束后清理运行状态并发出 run-finished / run-aborted 事件。
 */
const scheduleRun = async (ctx: RunContext, chosen: FpWindow[], totalTasks: number): Promise<void> => {
  const { runId, settings, emit, abortController } = ctx
  const threads = parseInt(settings.publish.threads, 10) || 1

  const queue = [...chosen]
  let failedCount = 0
  let active = 0

  await new Promise<void>((resolveRun) => {
    const waitIfPaused = async (): Promise<void> => {
      const flag = pauseFlags.get(runId)
      if (flag?.paused) {
        return new Promise<void>((resolve) => {
          flag.resolve = resolve
        })
      }
    }

    const next = async () => {
      if (abortController.signal.aborted) {
        if (active === 0) resolveRun()
        return
      }
      // 等待暂停恢复
      await waitIfPaused()
      if (abortController.signal.aborted) {
        if (active === 0) resolveRun()
        return
      }
      const window = queue.shift()
      if (!window) {
        if (active === 0) resolveRun()
        return
      }
      active++
      const threadId = `${runId}-${chosen.length - queue.length}`
      // 单线程异常不能拖垮整个调度（否则 run 永远不会结束）
      let ok = false
      try {
        ok = await runThread(ctx, threadId, window, totalTasks)
      } catch (err) {
        emit({
          type: 'log',
          runId,
          threadId,
          level: 'error',
          message: `线程异常终止: ${err instanceof Error ? err.message : String(err)}`,
          ts: Date.now(),
        })
      }
      if (!ok) failedCount++
      active--
      next()
    }
    const slotCount = Math.min(threads, chosen.length)
    for (let i = 0; i < slotCount; i++) {
      next()
    }
  })

  // 清理
  pauseFlags.delete(runId)
  runs.delete(runId)

  if (abortController.signal.aborted) {
    emit({ type: 'run-aborted', runId, reason: '用户停止' })
  } else {
    emit({
      type: 'run-finished',
      runId,
      success: failedCount === 0,
      failedThreads: failedCount,
    })
  }
}

// ---------------------------------------------------------------------------
// 停止发布
// ---------------------------------------------------------------------------

export const stopScript = async (runId: string): Promise<boolean> => {
  const ctx = runs.get(runId)
  if (!ctx) return false
  const flag = pauseFlags.get(runId)
  if (flag?.resolve) {
    flag.resolve()
    flag.resolve = null
  }
  ctx.abortController.abort()
  return true
}

// ---------------------------------------------------------------------------
// 暂停 / 恢复
// ---------------------------------------------------------------------------

export const pauseScript = (runId: string): boolean => {
  if (!runs.has(runId)) return false
  const flag = pauseFlags.get(runId)
  if (flag) {
    flag.paused = true
  } else {
    pauseFlags.set(runId, { paused: true, resolve: null })
  }
  const ctx = runs.get(runId)
  if (ctx) {
    ctx.emit({ type: 'run-paused', runId })
  }
  return true
}

export const resumeScript = (runId: string): boolean => {
  const flag = pauseFlags.get(runId)
  if (!flag || !flag.paused) return false
  flag.paused = false
  if (flag.resolve) {
    flag.resolve()
    flag.resolve = null
  }
  const ctx = runs.get(runId)
  if (ctx) {
    ctx.emit({ type: 'run-resumed', runId })
  }
  return true
}

// 应用退出时清理
export const cleanupAllRuns = (): void => {
  for (const ctx of runs.values()) {
    ctx.abortController.abort()
  }
  runs.clear()
  pauseFlags.clear()
}

// ---------------------------------------------------------------------------
// 工具
// ---------------------------------------------------------------------------

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))