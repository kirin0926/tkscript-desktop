import { type BrowserWindow } from 'electron'
import { handle } from '@/lib/main/shared'
import { startScript, stopScript } from '@/lib/main/runtime/script-runner'

export const registerScriptHandlers = (mainWindow: BrowserWindow) => {
  handle('script-start', (settings) => startScript(settings, (event) => mainWindow.webContents.send('script-event', event)))
  handle('script-stop', ({ runId }) => stopScript(runId))
}
