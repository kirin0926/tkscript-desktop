import { ConveyorApi } from '@/lib/preload/shared'

export class AppApi extends ConveyorApi {
  version = () => this.invoke('version')
  openFolder = (folderPath: string) => this.invoke('open-folder', folderPath)
  listFiles = (folderPath: string, extension?: string) => this.invoke('list-files', folderPath, extension)
}
