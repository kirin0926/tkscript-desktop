import { handle } from '@/lib/main/shared'
import { selectAdapter } from '@/lib/main/fingerprint'

export const registerFingerprintHandlers = () => {
  const adapter = selectAdapter()
  handle('fingerprint-test-connection', (conn) => adapter.testConnection(conn))
  handle('fingerprint-list-windows', (conn) => adapter.listWindows(conn))
  handle('fingerprint-list-groups', (conn) => adapter.listGroups(conn))
  handle('fingerprint-open-window', (conn, profileId) => adapter.openWindow(conn, profileId))
  handle('fingerprint-close-window', (conn, profileId) => adapter.closeWindow(conn, profileId))
  handle('fingerprint-get-opened-windows', (conn) => adapter.getOpenedWindows(conn))
}