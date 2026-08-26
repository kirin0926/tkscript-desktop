import { create } from 'zustand'
import type { ScriptEvent, ScriptLogLevel, ScriptThreadStatus } from '@/lib/conveyor/schemas/script-schema'

export interface ThreadState {
  threadId: string
  profileId: string
  profileName: string
  status: ScriptThreadStatus
  current: number
  total: number
  step: string
  /** 线程启动时间，用于按打开顺序排序 */
  startedAt: number
  updatedAt: number
}

export interface LogItem {
  ts: number
  level: ScriptLogLevel
  message: string
  threadId: string
}

interface ScriptRunState {
  runId: string | null
  running: boolean
  paused: boolean
  totalThreads: number
  failedThreads: number
  threads: Map<string, ThreadState>
  logs: Map<string, LogItem[]>
  selectedThreadId: string | null
  setSelection: (threadId: string | null) => void
  ingest: (event: ScriptEvent) => void
  reset: () => void
}

const DEFAULTS = {
  runId: null,
  running: false,
  paused: false,
  totalThreads: 0,
  failedThreads: 0,
  threads: new Map<string, ThreadState>(),
  logs: new Map<string, LogItem[]>(),
  selectedThreadId: null,
}

export const useScriptRunStore = create<ScriptRunState>((set) => ({
  ...DEFAULTS,
  setSelection: (threadId) => set({ selectedThreadId: threadId }),
  ingest: (event) =>
    set((state) => {
      if (event.type === 'run-started') {
        return {
          ...state,
          running: true,
          totalThreads: event.totalThreads,
          failedThreads: 0,
        }
      }
      if (event.type === 'run-finished' || event.type === 'run-aborted') {
        return {
          ...state,
          running: false,
          paused: false,
          failedThreads: event.type === 'run-finished' ? event.failedThreads : state.failedThreads,
        }
      }
      if (event.type === 'run-paused') {
        return { ...state, paused: true }
      }
      if (event.type === 'run-resumed') {
        return { ...state, paused: false }
      }
      if (event.type === 'thread-started') {
        const next = new Map(state.threads)
        next.set(event.threadId, {
          threadId: event.threadId,
          profileId: event.profileId,
          profileName: event.profileName,
          status: 'running',
          current: 0,
          total: 0,
          step: '启动中',
          startedAt: Date.now(),
          updatedAt: Date.now(),
        })
        return { ...state, threads: next, selectedThreadId: state.selectedThreadId ?? event.threadId }
      }
      if (event.type === 'thread-finished') {
        const next = new Map(state.threads)
        const prev = next.get(event.threadId)
        if (prev) {
          next.set(event.threadId, {
            ...prev,
            status: event.success ? 'success' : 'failed',
            updatedAt: Date.now(),
          })
        }
        return { ...state, threads: next }
      }
      if (event.type === 'step') {
        const next = new Map(state.threads)
        const prev = next.get(event.threadId)
        if (prev) {
          next.set(event.threadId, {
            ...prev,
            current: event.current,
            total: event.total,
            step: event.step,
            updatedAt: Date.now(),
          })
        }
        return { ...state, threads: next }
      }
      if (event.type === 'log') {
        const nextLogs = new Map(state.logs)
        const arr = nextLogs.get(event.threadId) ?? []
        const trimmed = arr.length > 500 ? arr.slice(-400) : arr
        trimmed.push({ ts: event.ts, level: event.level, message: event.message, threadId: event.threadId })
        nextLogs.set(event.threadId, trimmed)
        return { ...state, logs: nextLogs }
      }
      return state
    }),
  reset: () => set({ ...DEFAULTS, threads: new Map(), logs: new Map() }),
}))
