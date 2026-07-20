import { electronAPI } from '@electron-toolkit/preload'
import { AppApi } from './app-api'
import { WindowApi } from './window-api'
import { SettingsApi } from './settings-api'
import { DialogApi } from './dialog-api'
import { FingerprintApi } from './fingerprint-api'

export const conveyor = {
  app: new AppApi(electronAPI),
  window: new WindowApi(electronAPI),
  settings: new SettingsApi(electronAPI),
  dialog: new DialogApi(electronAPI),
  fingerprint: new FingerprintApi(electronAPI),
}

export type ConveyorApi = typeof conveyor
