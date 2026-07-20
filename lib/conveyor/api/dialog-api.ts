import { ConveyorApi } from '@/lib/preload/shared'

export class DialogApi extends ConveyorApi {
  openFolder = () => this.invoke('dialog-open-folder')
}
