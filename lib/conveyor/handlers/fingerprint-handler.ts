import { handle } from '@/lib/main/shared'
import { getAdapter } from '@/lib/main/fingerprint'

export const registerFingerprintHandlers = () => {
  handle('fingerprint-test-connection', (conn) => getAdapter(conn).testConnection(conn))
  handle('fingerprint-list-windows', (conn) => getAdapter(conn).listWindows(conn))
  handle('fingerprint-list-groups', (conn) => getAdapter(conn).listGroups(conn))
  handle('fingerprint-open-window', (conn, profileId) => getAdapter(conn).openWindow(conn, profileId))
  handle('fingerprint-close-window', (conn, profileId) => getAdapter(conn).closeWindow(conn, profileId))
  handle('fingerprint-get-opened-windows', (conn) => getAdapter(conn).getOpenedWindows(conn))
}