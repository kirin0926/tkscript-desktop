import { type App, shell } from 'electron'
import { readdirSync } from 'fs'
import { join } from 'path'
import { handle } from '@/lib/main/shared'

export const registerAppHandlers = (app: App) => {
  // App operations
  handle('version', () => app.getVersion())

  handle('open-folder', async (folderPath) => {
    if (!folderPath) return false
    try {
      await shell.openPath(folderPath)
      return true
    } catch {
      return false
    }
  })

  handle('list-files', (folderPath, extension) => {
    try {
      const files = readdirSync(folderPath)
      if (extension) {
        return files.filter((f) => f.toLowerCase().endsWith(extension.toLowerCase())).sort()
      }
      return files.sort()
    } catch {
      return []
    }
  })
}
