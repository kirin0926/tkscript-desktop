import { randomUUID } from 'crypto'
import { selectAdapter } from '@/lib/main/fingerprint'
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
  const adapter = selectAdapter()
  const conn = { apiHost: settings.publish.apiHost, apiPort: settings.publish.apiPort }

  // 通过指纹浏览器打开窗口获取 CDP 调试端口
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

  return publish(
    {
      runId: ctx.runId,
      threadId,
      profileId: window.id,
      profileName: window.name,
      debugPort,
      videoFolder: settings.material.videoFolder,
      videoMode: settings.material.videoMode,
      title: settings.works.title,
      perAccount,
      rounds,
      uploadWait,
      totalTasks,
      signal: ctx.abortController.signal,
    },
    emit
  )
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

  const adapter = selectAdapter()
  const conn = { apiHost: settings.publish.apiHost, apiPort: settings.publish.apiPort }

  // 1. 拉取窗口列表
  let windows: FpWindow[] = []
  try {
    windows = await adapter.listWindows(conn)
  } catch (err) {
    emit({
      type: 'run-aborted',
      runId,
      reason: err instanceof Error ? err.message : '拉取窗口失败',
    })
    runs.delete(runId)
    return { runId }
  }

  // 2. 过滤分组
  if (settings.publish.group && settings.publish.group !== 'all') {
    windows = windows.filter((w) => w.id === settings.publish.group)
  }

  // 3. 解析序列下标
  const indices = parseWindowSeq(settings.publish.windowSeq, windows.length)
  const chosen = indices.map((i) => windows[i]).filter(Boolean)

  if (chosen.length === 0) {
    emit({ type: 'run-aborted', runId, reason: '没有匹配的窗口' })
    runs.delete(runId)
    return { runId }
  }

  // 4. 并发调度
  const threads = parseInt(settings.publish.threads, 10) || 1
  const perAccount = parseInt(settings.publish.perAccount, 10) || 1
  const rounds = parseInt(settings.publish.rounds, 10) || 1
  const totalTasks = perAccount * rounds

  emit({ type: 'run-started', runId, totalThreads: chosen.length })

  const queue = [...chosen]
  let failedCount = 0
  let active = 0

  await new Promise<void>((resolveRun) => {
    const next = async () => {
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
      const ok = await runThread(ctx, threadId, window, totalTasks)
      if (!ok) failedCount++
      active--
      next()
    }
    const slotCount = Math.min(threads, chosen.length)
    for (let i = 0; i < slotCount; i++) {
      next()
    }
  })

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
  runs.delete(runId)
  return { runId }
}

// ---------------------------------------------------------------------------
// 停止发布
// ---------------------------------------------------------------------------

export const stopScript = async (runId: string): Promise<boolean> => {
  const ctx = runs.get(runId)
  if (!ctx) return false
  ctx.abortController.abort()
  return true
}

// 应用退出时清理
export const cleanupAllRuns = (): void => {
  for (const ctx of runs.values()) {
    ctx.abortController.abort()
  }
  runs.clear()
}