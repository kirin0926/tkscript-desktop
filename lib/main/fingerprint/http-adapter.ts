import { net } from 'electron'
import type { FingerprintAdapter, FpConn, FpGroup, FpOpenWindowReturn, FpWindow } from './types'

const TRAILING_SLASHES = /\/+$/

const buildBaseUrl = (conn: FpConn) => {
  const host = (conn.apiHost || 'http://127.0.0.1').replace(TRAILING_SLASHES, '')
  const port = conn.apiPort || '53200'
  return `${host}:${port}`
}

/**
 * 从 ixBrowser 响应中提取数组数据。
 * 兼容多种格式：data 本身是数组、data 是包含 list/rows/profiles 等字段的对象、或 data 为 null。
 * 会返回最大的数组（应对分页响应中 list 只含当前页，而 profiles 含全部的情况）。
 */
const extractArray = <T>(data: unknown): T[] => {
  if (Array.isArray(data)) return data as T[]
  if (data && typeof data === 'object') {
    // 常见列表字段名，按优先级排序
    const candidates: T[][] = []
    for (const key of ['profiles', 'list', 'rows', 'data', 'items', 'records', 'profile']) {
      const val = (data as Record<string, unknown>)[key]
      if (Array.isArray(val)) candidates.push(val as T[])
    }
    if (candidates.length > 0) {
      // 返回最大的数组（profiles 通常包含全部，list 可能只含当前页）
      return candidates.reduce((a, b) => (a.length >= b.length ? a : b))
    }
  }
  return []
}

/**
 * 判断是否为可重试的临时性错误
 */
const isRetryableError = (err: unknown): boolean => {
  const msg = err instanceof Error ? err.message : String(err)
  return (
    msg.includes('Server busy') ||
    msg.includes('server busy') ||
    msg.includes('too many requests') ||
    msg.includes('try again later') ||
    msg.includes('rate limit') ||
    msg.includes('HTTP 429') ||
    msg.includes('HTTP 502') ||
    msg.includes('HTTP 503')
  )
}

/**
 * 带指数退避重试的异步包装
 */
const retryOnBusy = async <T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> => {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn()
    } catch (err) {
      if (attempt < maxRetries && isRetryableError(err)) {
        const delay = Math.min(1000 * 2 ** attempt, 4000) // 1s, 2s, 4s
        console.warn(`[ixBrowser] 请求失败，${delay}ms 后重试 (${attempt + 1}/${maxRetries}):`, err)
        await new Promise((resolve) => setTimeout(resolve, delay))
        continue
      }
      throw err
    }
  }
}

/**
 * 通用请求函数，支持 POST 和 GET
 */
const apiRequest = async <T>(conn: FpConn, method: string, httpMethod: 'POST' | 'GET' = 'POST', body?: Record<string, unknown>, queryParams?: Record<string, string | number>): Promise<T> => {
  let url = `${buildBaseUrl(conn)}/api/v2/${method}`
  if (queryParams) {
    const qs = Object.entries(queryParams)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
      .join('&')
    url += `?${qs}`
  }
  const options: Record<string, unknown> = { method: httpMethod }
  if (httpMethod === 'POST') {
    options.headers = { 'Content-Type': 'application/json' }
    if (body) {
      options.body = JSON.stringify(body)
    } else {
      options.body = '{}'
    }
  }
  const response = await net.fetch(url, options as RequestInit)
  if (!response.ok) {
    throw new Error(`ixBrowser 请求失败：HTTP ${response.status} (${method})`)
  }
  const payload = (await response.json()) as Record<string, unknown>

  // 调试日志：输出实际响应结构（打包后移除）
  console.log(`[ixBrowser] ${method} 响应:`, JSON.stringify(payload).slice(0, 600))

  // ixBrowser v2 API 响应格式：{ error: { code: 0, message: "success" }, data: T }
  // error.code 为 0 时表示成功，非 0 时表示错误
  const errObj = payload.error as { code?: number; message?: string } | undefined
  if (errObj && typeof errObj === 'object') {
    if (errObj.code !== 0) {
      throw new Error(`ixBrowser ${method} 返回错误：${errObj.message ?? '未知错误'}`)
    }
  } else {
    // 兼容没有 error 字段的响应格式
    const code = payload.code
    const codeNum = typeof code === 'string' ? parseInt(code, 10) : (code as number)
    if (code !== undefined && codeNum !== 0 && code !== 'success' && code !== 200) {
      throw new Error(`ixBrowser ${method} 返回错误：${String(payload.msg ?? payload.message ?? `code=${code}`)}`)
    }
  }

  return (payload.data ?? payload) as T
}

const postJson = async <T>(conn: FpConn, method: string, body?: Record<string, unknown>, queryParams?: Record<string, string | number>): Promise<T> => {
  return apiRequest<T>(conn, method, 'POST', body, queryParams)
}

// ---------------------------------------------------------------------------
// ixBrowser /api/v2/profile-list 返回数据条目结构
// 实测后请根据实际返回字段调整
// ---------------------------------------------------------------------------
interface IxProfileRow {
  profile_id?: string
  id?: string
  name?: string
  group_id?: string
  status?: number
}

// ixBrowser /api/v2/group-list 返回数据条目结构
interface IxGroupRow {
  group_id?: string
  id?: string
  group_name?: string
  name?: string
}

// ixBrowser /api/v2/profile-open 返回数据结构
// 实测后请根据实际返回字段调整
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
  testConnection: async (conn) => {
    try {
      await postJson<unknown>(conn, 'profile-list')
      return { ok: true, message: '连接成功' }
    } catch (err) {
      return {
        ok: false,
        message: err instanceof Error ? err.message : '连接失败',
      }
    }
  },

  listWindows: async (conn) => {
    // ixBrowser 默认分页 10 条，尝试用 page/pageSize 获取全部
    // 分页参数同时在 body 和 query string 中发送，确保 API 能正确读取
    let data = await retryOnBusy(() =>
      postJson<unknown>(conn, 'profile-list', { pageNum: 1, pageSize: 9999 }, { page: 1, pageSize: 9999 })
    )
    let rows = extractArray<IxProfileRow>(data)

    // 如果 total 大于返回数组长度，说明分页了，需要遍历所有页面
    const total = (data as Record<string, unknown>)?.total as number | undefined
    if (total && total > rows.length) {
      const allRows = [...rows]
      // 尝试不同的 page 参数名（优先尝试 page，与 getOpenedWindows 一致）
      const pageParamNames = ['page', 'pageNum', 'pageNo', 'page_number']
      for (const pageParam of pageParamNames) {
        let page = 2
        let staleCount = 0
        while (allRows.length < total && staleCount < 3) {
          try {
            const pageData = await retryOnBusy(() =>
              postJson<unknown>(
                conn,
                'profile-list',
                { [pageParam]: page, pageSize: 9999 },
                { [pageParam]: page, pageSize: 9999 }
              )
            )
            const pageRows = extractArray<IxProfileRow>(pageData)
            if (pageRows.length === 0) break
            // 检测是否返回了重复数据（说明该 page 参数名无效）
            const before = allRows.length
            for (const row of pageRows) {
              const rowId = String(row.profile_id ?? row.id ?? '')
              if (!allRows.some((r) => String(r.profile_id ?? r.id ?? '') === rowId)) {
                allRows.push(row)
              }
            }
            if (allRows.length === before) {
              staleCount++ // 连续无新数据，可能参数名不对
            } else {
              staleCount = 0
            }
            page++
          } catch {
            page++
            if (page > 20) break
          }
        }
        if (allRows.length >= total) {
          rows = allRows
          break
        }
      }
    }

    return rows.map((row, idx): FpWindow => {
      const isRunning = Number(row.status) === 2
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
    let data: unknown = null
    try {
      data = await retryOnBusy(() => apiRequest<unknown>(conn, 'group-list', 'POST'))
    } catch {
      try {
        data = await retryOnBusy(() => apiRequest<unknown>(conn, 'group-list', 'GET'))
      } catch {
        console.warn('[ixBrowser] group-list 不可用，仅返回默认分组')
      }
    }
    const rows = extractArray<IxGroupRow>(data)
    return [
      { id: 'all', name: '全部分组' },
      ...rows.map((row): FpGroup => ({
        id: String(row.group_id ?? row.id ?? ''),
        name: row.group_name ?? row.name ?? '未命名分组',
      })),
    ]
  },

  openWindow: async (conn, profileId) => {
    const data = await retryOnBusy(() => postJson<IxOpenProfileResult>(conn, 'profile-open', { profile_id: Number(profileId) }))
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
      await postJson(conn, 'profile-close', { profile_id: Number(profileId) })
      return true
    } catch {
      return false
    }
  },

  getOpenedWindows: async (conn) => {
    const data = await retryOnBusy(() => postJson<unknown>(conn, 'profile-opened-list', {}, { pageSize: 9999, page: 1 }))
    const rows = extractArray<IxProfileRow>(data)
    return rows.map((row, idx): FpWindow => ({
      seq: idx + 1,
      name: row.name ?? `窗口 ${String(idx + 1).padStart(2, '0')}`,
      status: 'running',
      id: String(row.profile_id ?? row.id ?? ''),
    }))
  },
}