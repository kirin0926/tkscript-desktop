import { ConveyorApi } from '@/lib/preload/shared'
import type { FpConn } from '@/lib/conveyor/schemas/fingerprint-schema'

export class FingerprintApi extends ConveyorApi {
  testConnection = (conn: FpConn) => this.invoke('fingerprint-test-connection', conn)
  listWindows = (conn: FpConn) => this.invoke('fingerprint-list-windows', conn)
  listGroups = (conn: FpConn) => this.invoke('fingerprint-list-groups', conn)
  openWindow = (conn: FpConn, profileId: string) =>
    this.invoke('fingerprint-open-window', conn, profileId)
  closeWindow = (conn: FpConn, profileId: string) =>
    this.invoke('fingerprint-close-window', conn, profileId)
  getOpenedWindows = (conn: FpConn) => this.invoke('fingerprint-get-opened-windows', conn)
}