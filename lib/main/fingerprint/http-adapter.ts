import { net } from 'electron'
import type { FingerprintAdapter, FpConn } from './types'

const TRAILING_SLASHES = /\/+$/

const buildBaseUrl = (conn: FpConn) => {
  const host = conn.apiHost.replace(TRAILING_SLASHES, '')
  return `${host}:${conn.apiPort}`
}

/**
 * 真实指纹浏览器 HTTP 适配器骨架。
 * 连接地址由发布设置的 apiHost:apiPort 组成；具体接口路径与响应字段映射
 * 依赖所选厂商（AdsPower / BitBrowser 等），此处以 TODO 标注，尚未接入具体厂商。
 */
export const httpAdapter: FingerprintAdapter = {
  listWindows: async (conn) => {
    const response = await net.fetch(`${buildBaseUrl(conn)}/TODO-windows-endpoint`)
    if (!response.ok) {
      throw new Error(`指纹浏览器窗口请求失败：${response.status}`)
    }
    // TODO: 依据具体指纹浏览器响应结构将结果映射为 FpWindow[]
    throw new Error('HTTP 指纹浏览器适配器的窗口映射尚未实现')
  },
  listGroups: async (conn) => {
    const response = await net.fetch(`${buildBaseUrl(conn)}/TODO-groups-endpoint`)
    if (!response.ok) {
      throw new Error(`指纹浏览器分组请求失败：${response.status}`)
    }
    // TODO: 依据具体指纹浏览器响应结构将结果映射为 FpGroup[]
    throw new Error('HTTP 指纹浏览器适配器的分组映射尚未实现')
  },
}
