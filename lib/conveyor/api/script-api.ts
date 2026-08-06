import { ConveyorApi } from '@/lib/preload/shared'
import type { AppSettings } from '@/lib/conveyor/schemas/settings-schema'
import type { ScriptEvent } from '@/lib/conveyor/schemas/script-schema'

type EventListener = (event: ScriptEvent) => void

export class ScriptApi extends ConveyorApi {
  start = (settings: AppSettings): Promise<{ runId: string }> => this.invoke('script-start', settings)

  stop = (runId: string): Promise<boolean> => this.invoke('script-stop', { runId })

  pause = (runId: string): Promise<boolean> => this.invoke('script-pause', { runId })

  resume = (runId: string): Promise<boolean> => this.invoke('script-resume', { runId })

  onEvent = (listener: EventListener): (() => void) => {
    const handler = (_event: unknown, payload: ScriptEvent): void => {
      listener(payload)
    }
    this.renderer.on('script-event', handler)
    return () => {
      this.renderer.removeListener('script-event', handler)
    }
  }
}
