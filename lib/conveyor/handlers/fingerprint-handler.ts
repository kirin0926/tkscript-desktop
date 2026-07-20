import { handle } from '@/lib/main/shared'
import { selectAdapter } from '@/lib/main/fingerprint'

export const registerFingerprintHandlers = () => {
  const adapter = selectAdapter()
  handle('fingerprint-list-windows', (conn) => adapter.listWindows(conn))
  handle('fingerprint-list-groups', (conn) => adapter.listGroups(conn))
}
