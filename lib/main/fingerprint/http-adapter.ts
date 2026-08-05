import { net } from 'electron'
import type { FingerprintAdapter, FpConn, FpGroup, FpOpenWindowReturn, FpWindow } from './types'

const TRAILING_SLASHES = /\/+$/

const buildBaseUrl = (conn: FpConn) => {
  const host = (conn.apiHost || 'http://127.0.0.1').replace(TRAILING_SLASHES, '')
  const port = conn.apiPort || '53200'
  return `${host}:${port}`
}

interface IxBrowserResponse<T> {
  error?: { code?: number; message?: string }
  data?: T
}

const postJson = async <T>(conn: FpConn, method: string, body: Record<string, unknown> = {}): Promise<T> => {
  const url = `${buildBaseUrl(conn)}/api/${method}`
  const response = await net.fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!response.ok) {
    throw new Error(`ixBrowser ${method} 请求失败：HTTP ${response.status}`)
  }
  const payload = (await response.json()) as IxBrowserResponse<T>
  if (payload.error) {
    throw new Error(`ixBrowser ${method} 返回错误：${payload.error.message ?? '未知错误'}`)
  }
  return (payload.data ?? payload) as T
}

// ixBrowser /api/getProfileList 返回数据条目结构
// 阶段 2 回填位置：实测后请将 profile_id / name / status / group_id 的字段名
// 替换为真实字段；当前以官方 Node 示例代码字段为假设。
interface IxProfileRow {
  // 字段名以 ixBrowser 官方文档为准；如不一致，可在实测后调整
  profile_id?: string
  id?: string
  name?: string
  group_id?: string
  status?: number
}

// ixBrowser /api/getGroup 返回数据条目结构
// 阶段 2 回填位置：实测后请将 group_id / group_name 替换为真实字段
interface IxGroupRow {
  group_id?: string
  id?: string
  group_name?: string
  name?: string
}

// ixBrowser /api/openProfile 返回数据结构
// 阶段 2 回填位置：在第一次实测后，请用真实返回字段替换下面接口的字段，
// 同时删除 takeMockDebugPort 的 fallback 分支（让 openProfile 在字段缺失时报错而非 mock）。
// 常见可能字段（待验证）：
//   - data.debug_port        （整数端口）
//   - data.port              （整数端口）
//   - data.debugging_port    （整数端口）
//   - data.ws / data.webSocketDebuggerUrl  （WebSocket 调试地址）
//   - data.webdriver         （Selenium 地址）
interface IxOpenProfileResult {
  debug_port?: number
  port?: number
  debugging_port?: number
  ws?: string
  webdriver?: string
}

// 已打开窗口时是否处于 running
let nextMockDebugPort = 9333

const takeMockDebugPort = (): number => nextMockDebugPort++

export const httpAdapter: FingerprintAdapter = {
  listWindows: async (conn) => {
    const rows = await postJson<IxProfileRow[]>(conn, 'getProfileList')
    return (rows ?? []).map((row, idx): FpWindow => {
      const isRunning = Number(row.status) === 2 // 0/1 离线，2 在线运行中（具体语义以实测为准）
      const status = isRunning ? 'running' : 'offline'
      return {
        seq: idx + 1,
        name: row.name ?? `窗口 ${String(idx + 1).padStart(2, '0')}`,
        status,
        id: String(row.profile_id ?? row.id ?? ''),
      }
    })
  },

  listGroups: async (conn) => {
    const rows = await postJson<IxGroupRow[]>(conn, 'getGroup')
    return [
      { id: 'all', name: '全部分组' },
      ...(rows ?? []).map((row): FpGroup => ({
        id: String(row.group_id ?? row.id ?? ''),
        name: row.group_name ?? row.name ?? '未命名分组',
      })),
    ]
  },

  openWindow: async (conn, profileId) => {
    const data = await postJson<IxOpenProfileResult>(conn, 'openProfile', { profile_id: profileId })
    let debugPort = data.debug_port ?? data.port ?? data.debugging_port
    if (!debugPort && data.ws) {
      const m = data.ws.match(/:(\d+)/)
      if (m) debugPort = parseInt(m[1], 10)
    }
    // TODO: 阶段 1 真实字段未确定时返回 mock 调试端口
    if (!debugPort) debugPort = takeMockDebugPort()
    const result: FpOpenWindowReturn = { profileId, debugPort }
    return result
  },

  closeWindow: async (conn, profileId) => {
    try {
      await postJson(conn, 'closeProfile', { profile_id: profileId })
      return true
    } catch {
      return false
    }
  },
}
