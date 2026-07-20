import { ipcMain, type IpcMainInvokeEvent } from 'electron'
import { ipcSchemas, validateArgs, validateReturn, type ChannelArgs, type ChannelReturn } from '@/lib/conveyor/schemas'

/**
 * 校验 IPC 调用来源是否为本应用自身页面：
 * - 开发环境：与 ELECTRON_RENDERER_URL 同源
 * - 生产环境：file:// 本地文件
 * 其它来源一律拒绝，防止非预期页面调用系统能力。
 */
const isTrustedSender = (event: IpcMainInvokeEvent): boolean => {
  const url = event.senderFrame?.url
  if (!url) {
    return false
  }
  try {
    const parsed = new URL(url)
    const devUrl = process.env['ELECTRON_RENDERER_URL']
    if (devUrl && parsed.origin === new URL(devUrl).origin) {
      return true
    }
    return parsed.protocol === 'file:'
  } catch {
    return false
  }
}

/**
 * Helper to register IPC handlers
 * @param channel - The IPC channel to register the handler for
 * @param handler - The handler function to register
 * @returns void
 */
export const handle = <T extends keyof typeof ipcSchemas>(
  channel: T,
  handler: (...args: ChannelArgs<T>) => ChannelReturn<T> | Promise<ChannelReturn<T>>
) => {
  // Remove any previously registered handler so re-registration (e.g. macOS
  // re-activate creating a new window) does not throw.
  ipcMain.removeHandler(channel)
  ipcMain.handle(channel, async (event, ...args) => {
    try {
      if (!isTrustedSender(event)) {
        throw new Error(`Rejected IPC from untrusted sender on channel: ${channel}`)
      }
      const validatedArgs = validateArgs(channel, args)
      const result = await handler(...validatedArgs)

      return validateReturn(channel, result)
    } catch (error) {
      console.error(`IPC Error in ${channel}:`, error)
      throw error
    }
  })
}
