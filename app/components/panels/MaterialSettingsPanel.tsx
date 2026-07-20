import { FolderOpen } from 'lucide-react'
import { useSettings } from '@/app/components/settings/SettingsContext'
import { useConveyor } from '@/app/hooks/use-conveyor'
import { Button } from '@/app/components/ui/button'
import { Input } from '@/app/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/app/components/ui/select'
import type { MaterialSettings } from '@/lib/conveyor/schemas/settings-schema'
import { Field, FormSection, PanelShell } from './panel-kit'

export const MaterialSettingsPanel = () => {
  const { settings, update } = useSettings()
  const { openFolder } = useConveyor('dialog')
  const material = settings.material

  const handlePickFolder = () => {
    openFolder()
      .then((folder) => {
        if (folder) {
          update('material', { videoFolder: folder })
        }
      })
      .catch((error) => {
        console.error('Failed to open folder dialog:', error)
      })
  }

  return (
    <PanelShell title="素材设置" description="配置视频素材来源与运行方式">
      <div className="space-y-8">
        <FormSection title="视频素材">
          <Field label="视频文件夹" htmlFor="material-folder" className="sm:col-span-2">
            <div className="flex gap-2">
              <Input
                id="material-folder"
                value={material.videoFolder}
                onChange={(e) => update('material', { videoFolder: e.target.value })}
                placeholder="选择或输入视频文件夹路径"
              />
              <Button type="button" variant="outline" className="shrink-0" onClick={handlePickFolder}>
                <FolderOpen />
                选择文件夹
              </Button>
            </div>
          </Field>
          <Field label="视频模式" htmlFor="material-video-mode">
            <Select
              value={material.videoMode}
              onValueChange={(value) => update('material', { videoMode: value as MaterialSettings['videoMode'] })}
            >
              <SelectTrigger id="material-video-mode" className="w-full">
                <SelectValue placeholder="选择视频模式" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="sequential">顺序选取</SelectItem>
                <SelectItem value="random">随机选取</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="运行模式" htmlFor="material-run-mode">
            <Select
              value={material.runMode}
              onValueChange={(value) => update('material', { runMode: value as MaterialSettings['runMode'] })}
            >
              <SelectTrigger id="material-run-mode" className="w-full">
                <SelectValue placeholder="选择运行模式" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="single">单次运行</SelectItem>
                <SelectItem value="loop">循环运行</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </FormSection>
      </div>
    </PanelShell>
  )
}
