import { type BrowserWindow, dialog } from 'electron'
import { handle } from '@/lib/main/shared'

export const registerDialogHandlers = (mainWindow: BrowserWindow) => {
  handle('dialog-open-folder', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory'],
    })
    if (result.canceled) {
      return null
    }
    return result.filePaths[0] ?? null
  })
}
