import type { FpConn, FpGroup, FpWindow } from '@/lib/conveyor/schemas/fingerprint-schema'

export type { FpConn, FpGroup, FpWindow }

/**
 * 指纹浏览器客户端适配器接口。
 * 通过实现该接口对接不同厂商（AdsPower / BitBrowser 等）。
 */
export interface FingerprintAdapter {
  listWindows: (conn: FpConn) => Promise<FpWindow[]>
  listGroups: (conn: FpConn) => Promise<FpGroup[]>
}
