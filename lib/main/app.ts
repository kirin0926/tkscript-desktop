import { BrowserWindow, shell, app } from 'electron'
import { join } from 'path'
import appIcon from '@/resources/build/icon.png?asset'
import { registerResourcesProtocol } from './protocols'
import { initDatabase } from '@/lib/main/db'
import { registerWindowHandlers } from '@/lib/conveyor/handlers/window-handler'
import { registerAppHandlers } from '@/lib/conveyor/handlers/app-handler'
import { registerSettingsHandlers } from '@/lib/conveyor/handlers/settings-handler'
import { registerDialogHandlers } from '@/lib/conveyor/handlers/dialog-handler'
import { registerFingerprintHandlers } from '@/lib/conveyor/handlers/fingerprint-handler'
import { registerScriptHandlers } from '@/lib/conveyor/handlers/script-handler'

export function createAppWindow(): void {
  // Register custom protocol for resources
  registerResourcesProtocol()

  // 初始化数据库（在注册任何 IPC handler 之前）
  initDatabase()

  // Create the main window.
  const mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    show: false,
    backgroundColor: '#1c1c1c',
    icon: appIcon,
    frame: false,
    titleBarStyle: 'hiddenInset',
    title: 'Electron React App',
    maximizable: false,
    resizable: false,
    webPreferences: {
      preload: join(__dirname, '../preload/preload.js'),
      sandbox: false,
    },
  })

  // Register IPC events for the main window.
  registerWindowHandlers(mainWindow)
  registerAppHandlers(app)
  registerSettingsHandlers()
  registerDialogHandlers(mainWindow)
  registerFingerprintHandlers()
  registerScriptHandlers(mainWindow)

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (!app.isPackaged && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}
