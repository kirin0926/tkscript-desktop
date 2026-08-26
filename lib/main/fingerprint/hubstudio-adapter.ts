import { net } from 'electron'
import type { FingerprintAdapter, FpConn, FpGroup, FpOpenWindowReturn, FpWindow } from './types'

const TRAILING_SLASHES = /\/+$/

const buildBaseUrl = (conn: FpConn) => {
  const host = (conn.apiHost || 'http://127.0.0.1').replace(TRAILING_SLASHES, '')
  const port = conn.apiPort || '6873'
  return `${host}:${port}`
}

const buildHeaders = (conn: FpConn): Record<string, string> => {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Accept-Language': 'zh-CN',
  }
  if (conn.apiKey) {
    headers['Authorization'] = conn.apiKey
  }
  return headers
}

// ---------------------------------------------------------------------------
// 客户端登录
// ---------------------------------------------------------------------------

/**
 * HubStudio 客户端登录。调用后客户端会验证身份并重启。
 * 登录成功后后续 API 调用无需额外认证。
 * 文档：POST /login，body: { appId, appSecret, groupCode }
 */
const loginClient = async (conn: FpConn): Promise<boolean> => {
  const appId = conn.appId
  const appSecret = conn.appSecret
  if (!appId || !appSecret) {
    // 没有凭证则跳过登录（客户端可能已通过 CLI 参数登录）
    return true
  }
  try {
    const url = `${buildBaseUrl(conn)}/login`
    const response = await net.fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        appId,
        appSecret,
        groupCode: conn.groupCode ?? '',
      }),
    } as RequestInit)
    if (!response.ok) {
      console.warn(`[HubStudio] 登录请求失败：HTTP ${response.status}`)
      return false
    }
    const payload = (await response.json()) as Record<string, unknown>
    const code = payload.code as number
    if (code !== 0) {
      console.warn(`[HubStudio] 登录失败：${String(payload.msg ?? '未知错误')} (code=${code})`)
      return false
    }
    console.log('[HubStudio] 客户端登录成功')
    return true
  } catch (err) {
    console.warn('[HubStudio] 登录异常:', err instanceof Error ? err.message : String(err))
    return false
  }
}

// 登录缓存：同一连接信息只登录一次
let loggedInConnKey = ''

const ensureLoggedIn = async (conn: FpConn): Promise<void> => {
  const key = `${conn.apiHost}:${conn.apiPort}:${conn.appId ?? ''}`
  if (loggedInConnKey === key) return
  await loginClient(conn)
  loggedInConnKey = key
}

// ---------------------------------------------------------------------------
// 通用 API 请求
// ---------------------------------------------------------------------------

/**
 * 通用 HubStudio API 请求。
 * 所有 HubStudio 接口均为 POST，响应格式：{ code: 0, msg: "Success", data: T }
 */
const apiRequest = async <T>(conn: FpConn, path: string, body?: Record<string, unknown>): Promise<T> => {
  const url = `${buildBaseUrl(conn)}${path}`
  const response = await net.fetch(url, {
    method: 'POST',
    headers: buildHeaders(conn),
    body: body ? JSON.stringify(body) : '{}',
  } as RequestInit)
  if (!response.ok) {
    throw new Error(`HubStudio 请求失败：HTTP ${response.status} (${path})`)
  }
  const payload = (await response.json()) as Record<string, unknown>

  // 调试日志
  console.log(`[HubStudio] ${path} 响应:`, JSON.stringify(payload).slice(0, 600))

  // HubStudio 响应格式：{ code: 0, msg: "Success", data: T }
  const code = payload.code as number
  if (code !== 0) {
    throw new Error(`HubStudio ${path} 返回错误：${String(payload.msg ?? '未知错误')} (code=${code})`)
  }
  return payload.data as T
}

// ---------------------------------------------------------------------------
// HubStudio 环境列表条目结构
// ---------------------------------------------------------------------------
interface HubEnvItem {
  containerCode?: number | string
  containerName?: string
  tagName?: string
  tagCode?: number | null
  serialNumber?: number
  [key: string]: unknown
}

// HubStudio 浏览器状态条目结构
interface HubContainerStatus {
  containerCode: string | number
  status: number
  pid?: string
}

// HubStudio 打开浏览器返回结构
interface HubStartResult {
  debuggingPort?: string
  statusCode?: string
  err?: string
  [key: string]: unknown
}

// HubStudio 分组条目结构
interface HubGroupItem {
  tagName?: string
  tagCode?: number | null
}

// ---------------------------------------------------------------------------
// 状态映射
// HubStudio 状态码：0=已开启(running), 1=开启中(starting), 2=关闭中(closing), 3=已关闭(closed)
// ---------------------------------------------------------------------------
const toFpStatus = (status: number): 'online' | 'running' | 'offline' => {
  if (status === 0) return 'running'
  if (status === 1) return 'online'
  return 'offline'
}

/**
 * 获取所有环境及其状态（处理分页，最多 200 条/页）
 */
const fetchAllEnvs = async (conn: FpConn): Promise<HubEnvItem[]> => {
  const allItems: HubEnvItem[] = []
  let current = 1
  const pageSize = 200
  let total = 0

  do {
    const data = await apiRequest<{ list?: HubEnvItem[]; total?: number }>(
      conn,
      '/api/v1/env/list',
      { current, size: pageSize }
    )
    const items = data?.list ?? []
    allItems.push(...items)
    total = data?.total ?? items.length
    current++
  } while (allItems.length < total)

  return allItems
}

/**
 * 获取所有浏览器的运行状态
 */
const fetchAllStatus = async (conn: FpConn): Promise<HubContainerStatus[]> => {
  try {
    const data = await apiRequest<{ containers?: HubContainerStatus[] }>(
      conn,
      '/api/v1/browser/all-browser-status',
      {}
    )
    return data?.containers ?? []
  } catch {
    return []
  }
}

/**
 * 构建环境 ID → 状态 的映射表
 */
const buildStatusMap = (statuses: HubContainerStatus[]): Map<string, number> => {
  const map = new Map<string, number>()
  for (const s of statuses) {
    map.set(String(s.containerCode), s.status)
  }
  return map
}

/**
 * 从进程命令行中提取远程调试端口。
 * HubStudio 启动 Chrome 时通常会传入 --remote-debugging-port=XXXX 参数。
 */
const getDebugPortFromPid = async (pid: string | undefined): Promise<number | null> => {
  if (!pid) return null
  try {
    const { execSync } = require('child_process')
    const command = process.platform === 'win32'
      ? `wmic process where processid=${pid} get commandline`
      : `ps -p ${pid} -o command=`
    const output = execSync(command, { timeout: 3000, encoding: 'utf-8' })
    // Chrome 调试端口参数格式: --remote-debugging-port=XXXX
    const match = output.match(/--remote-debugging-port=(\d+)/)
    if (match) {
      const port = parseInt(match[1], 10)
      if (!isNaN(port) && port > 0 && port < 65536) return port
    }
    return null
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// 适配器实现
// ---------------------------------------------------------------------------

export const hubstudioAdapter: FingerprintAdapter = {
  testConnection: async (conn) => {
    try {
      // 1. 如有凭证则先登录
      await ensureLoggedIn(conn)
      // 2. 尝试获取环境列表验证连接
      await apiRequest<unknown>(conn, '/api/v1/env/list', { current: 1, size: 1 })
      return { ok: true, message: 'HubStudio 连接成功' }
    } catch (err) {
      return {
        ok: false,
        message: err instanceof Error ? err.message : '连接失败',
      }
    }
  },

  listWindows: async (conn) => {
    await ensureLoggedIn(conn)
    const [envs, statuses] = await Promise.all([
      fetchAllEnvs(conn),
      fetchAllStatus(conn),
    ])
    const statusMap = buildStatusMap(statuses)

    return envs.map((item, idx): FpWindow => {
      const containerCode = String(item.containerCode ?? '')
      const status = statusMap.has(containerCode)
        ? toFpStatus(statusMap.get(containerCode)!)
        : 'offline'
      return {
        seq: idx + 1,
        name: item.containerName ?? `窗口 ${String(idx + 1).padStart(2, '0')}`,
        status,
        id: containerCode,
        groupId: item.tagCode != null ? String(item.tagCode) : 'ungrouped',
        groupName: item.tagName ?? undefined,
      }
    })
  },

  listGroups: async (conn) => {
    await ensureLoggedIn(conn)
    const items = await apiRequest<HubGroupItem[]>(conn, '/api/v1/group/list', {})
    return [
      { id: 'all', name: '全部分组' },
      ...items.map((item): FpGroup => ({
        id: item.tagCode != null ? String(item.tagCode) : 'ungrouped',
        name: item.tagName ?? '未命名分组',
      })),
    ]
  },

  openWindow: async (conn, profileId) => {
    await ensureLoggedIn(conn)

    // 先检查窗口是否已经在运行；如果是，则直接获取现有调试端口，不再打开新窗口
    const statuses = await fetchAllStatus(conn)
    const runningContainer = statuses.find(
      (s) => String(s.containerCode) === String(profileId) && s.status === 0
    )
    if (runningContainer) {
      console.log(`[HubStudio] 窗口 ${profileId} 已在运行，尝试获取现有调试端口`)
      const existingPort = await getDebugPortFromPid(runningContainer.pid)
      if (existingPort) {
        console.log(`[HubStudio] 复用已运行窗口 ${profileId} 的调试端口: ${existingPort}`)
        return { profileId, debugPort: existingPort }
      }
      // 如果无法从 PID 获取端口，尝试查找该端口是否已占用
      console.log(`[HubStudio] 无法从 PID 获取端口，仍尝试打开新窗口（可能重复）`)
    }

    const data = await apiRequest<HubStartResult>(conn, '/api/v1/browser/start', {
      containerCode: profileId,
    })
    const debugPort = data.debuggingPort ? parseInt(data.debuggingPort, 10) : 0
    if (!debugPort) {
      console.warn('[HubStudio] openWindow 未返回 debugPort，使用兜底端口 9333')
    }
    const result: FpOpenWindowReturn = {
      profileId,
      debugPort: debugPort || 9333,
    }
    return result
  },

  closeWindow: async (conn, profileId) => {
    await ensureLoggedIn(conn)
    try {
      await apiRequest<unknown>(conn, '/api/v1/browser/stop', {
        containerCode: profileId,
      })
      return true
    } catch {
      return false
    }
  },

  getOpenedWindows: async (conn) => {
    await ensureLoggedIn(conn)
    const [envs, statuses] = await Promise.all([
      fetchAllEnvs(conn),
      fetchAllStatus(conn),
    ])
    const statusMap = buildStatusMap(statuses)

    // 只返回正在运行的窗口（status === 0）
    const runningIds = new Set<string>()
    for (const [id, status] of statusMap) {
      if (status === 0) runningIds.add(id)
    }

    return envs
      .filter((item) => runningIds.has(String(item.containerCode ?? '')))
      .map((item, idx): FpWindow => ({
        seq: idx + 1,
        name: item.containerName ?? `窗口 ${String(idx + 1).padStart(2, '0')}`,
        status: 'running' as const,
        id: String(item.containerCode ?? ''),
        groupId: item.tagCode != null ? String(item.tagCode) : 'ungrouped',
        groupName: item.tagName ?? undefined,
      }))
  },
}