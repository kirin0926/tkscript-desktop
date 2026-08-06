import type { FpConn } from '@/lib/conveyor/schemas/fingerprint-schema'
import type { FingerprintAdapter } from './types'
import { mockAdapter } from './mock-adapter'
import { httpAdapter } from './http-adapter'
import { hubstudioAdapter } from './hubstudio-adapter'

/**
 * 根据连接参数选择对应的指纹浏览器适配器。
 * - `ixbrowser` → 使用 HTTP 适配器对接 ixBrowser（默认）
 * - `hubstudio` → 使用 HubStudio 适配器
 * - 设置环境变量 `TKS_FINGERPRINT_ADAPTER=mock` 可回退到 mock 适配器
 */
export const getAdapter = (conn: FpConn): FingerprintAdapter => {
  if (process.env.TKS_FINGERPRINT_ADAPTER === 'mock') {
    return mockAdapter
  }
  const type = conn.fingerprintType ?? 'ixbrowser'
  switch (type) {
    case 'hubstudio':
      return hubstudioAdapter
    case 'ixbrowser':
    default:
      return httpAdapter
  }
}

/**
 * @deprecated 使用 `getAdapter(conn)` 替代，根据连接参数动态选择适配器。
 */
export const selectAdapter = getAdapter