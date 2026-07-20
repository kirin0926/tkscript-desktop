import { ConveyorApi } from '@/lib/preload/shared'
import type { AppSettings } from '@/lib/conveyor/schemas/settings-schema'

export class SettingsApi extends ConveyorApi {
  load = () => this.invoke('settings-load')
  save = (settings: AppSettings) => this.invoke('settings-save', settings)
}
