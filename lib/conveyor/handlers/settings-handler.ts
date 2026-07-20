import { handle } from '@/lib/main/shared'
import { loadSettings, saveSettings } from '@/lib/main/settings-store'

export const registerSettingsHandlers = () => {
  handle('settings-load', () => loadSettings())
  handle('settings-save', (settings) => saveSettings(settings))
}
