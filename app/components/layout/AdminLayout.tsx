import type { ComponentType } from 'react'
import { useState } from 'react'
import { LogThreadPanel } from '@/app/components/panels/LogThreadPanel'
import { MaterialSettingsPanel } from '@/app/components/panels/MaterialSettingsPanel'
import { ProfileSettingsPanel } from '@/app/components/panels/ProfileSettingsPanel'
import { PublishSettingsPanel } from '@/app/components/panels/PublishSettingsPanel'
import { WindowListPanel } from '@/app/components/panels/WindowListPanel'
import { WorksSettingsPanel } from '@/app/components/panels/WorksSettingsPanel'
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

  return (
    <div className="flex h-full overflow-hidden bg-background text-foreground">
      <Sidebar activeKey={activeKey} onSelect={setActiveKey} />
      <main className="flex-1 overflow-y-auto">
        <ActivePanel />
      </main>
    </div>
  )
}
