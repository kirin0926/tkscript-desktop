import { useEffect } from 'react'
import type { ComponentType } from 'react'
import { useState } from 'react'
import { toast } from 'sonner'
import { LogThreadPanel } from '@/app/components/panels/LogThreadPanel'
import { MaterialSettingsPanel } from '@/app/components/panels/MaterialSettingsPanel'
import { ProfileSettingsPanel } from '@/app/components/panels/ProfileSettingsPanel'
import { PublishSettingsPanel } from '@/app/components/panels/PublishSettingsPanel'
import { WindowListPanel } from '@/app/components/panels/WindowListPanel'
import { WorksSettingsPanel } from '@/app/components/panels/WorksSettingsPanel'
import { useConveyor } from '@/app/hooks/use-conveyor'
import { useScriptRunStore } from '@/app/stores/script-run-store'
import { Sidebar } from './Sidebar'
import type { PanelKey } from './nav-items'

const panelMap: Record<PanelKey, ComponentType> = {
  publish: PublishSettingsPanel,
  works: WorksSettingsPanel,
  material: MaterialSettingsPanel,
  windows: WindowListPanel,
  profile: ProfileSettingsPanel,
  logs: LogThreadPanel,
}

export const AdminLayout = () => {
  const [activeKey, setActiveKey] = useState<PanelKey>('publish')
  const ActivePanel = panelMap[activeKey]
  const scriptApi = useConveyor('script')

  // 全局订阅脚本事件，确保所有面板都能收到日志，并以 toast 提示任务级别的成败
  useEffect(() => {
    const unsubscribe = scriptApi.onEvent((event) => {
      useScriptRunStore.getState().ingest(event)
      if (event.type === 'run-started') {
        toast.success(`已开始发布任务（共 ${event.totalThreads} 个窗口）`)
      } else if (event.type === 'run-aborted') {
        toast.error(`发布任务中止：${event.reason}`)
      } else if (event.type === 'run-finished') {
        if (event.success) {
          toast.success('发布任务全部完成')
        } else {
          toast.error(`发布任务完成，${event.failedThreads} 个线程失败，详情见日志线程`)
        }
      }
    })
    return unsubscribe
  }, [scriptApi])

  return (
    <div className="flex h-full overflow-hidden bg-background text-foreground">
      <Sidebar activeKey={activeKey} onSelect={setActiveKey} />
      <main className="flex-1 overflow-hidden">
        <ActivePanel />
      </main>
    </div>
  )
}
