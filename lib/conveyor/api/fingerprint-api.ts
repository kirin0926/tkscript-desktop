import { ConveyorApi } from '@/lib/preload/shared'
import type { FpConn } from '@/lib/conveyor/schemas/fingerprint-schema'

export class FingerprintApi extends ConveyorApi {
  listWindows = (conn: FpConn) => this.invoke('fingerprint-list-windows', conn)
  listGroups = (conn: FpConn) => this.invoke('fingerprint-list-groups', conn)
}
