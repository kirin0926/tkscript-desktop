import type { FpConn, FpGroup, FpWindow, FpOpenWindowReturn } from '@/lib/conveyor/schemas/fingerprint-schema'

export type { FpConn, FpGroup, FpWindow, FpOpenWindowReturn }

/**
 * 指纹浏览器客户端适配器接口。
 * 通过实现该接口对接不同厂商（ixBrowser / AdsPower / BitBrowser 等）。
 */
export interface FingerprintAdapter {
  listWindows: (conn: FpConn) => Promise<FpWindow[]>
  listGroups: (conn: FpConn) => Promise<FpGroup[]>
  openWindow: (conn: FpConn, profileId: string) => Promise<FpOpenWindowReturn>
  closeWindow: (conn: FpConn, profileId: string) => Promise<boolean>
}
