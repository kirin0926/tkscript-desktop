import { useState } from 'react'
import { FolderOpen } from 'lucide-react'
import { Button } from '@/app/components/ui/button'
import { Input } from '@/app/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/app/components/ui/select'
import { Field, FormSection, PanelShell } from './panel-kit'

export const MaterialSettingsPanel = () => {
  const [videoFolder, setVideoFolder] = useState('')
  const [videoMode, setVideoMode] = useState('sequential')
  const [runMode, setRunMode] = useState('single')

  return (
    <PanelShell title="素材设置" description="配置视频素材来源与运行方式">
      <div className="space-y-8">
        <FormSection title="视频素材">
          <Field label="视频文件夹" htmlFor="material-folder" className="sm:col-span-2">
            <div className="flex gap-2">
              <Input
                id="material-folder"
                value={videoFolder}
                onChange={(e) => setVideoFolder(e.target.value)}
                placeholder="选择或输入视频文件夹路径"
              />
              <Button type="button" variant="outline" className="shrink-0">
                <FolderOpen />
                选择文件夹
              </Button>
            </div>
          </Field>
          <Field label="视频模式" htmlFor="material-video-mode">
            <Select value={videoMode} onValueChange={setVideoMode}>
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
            <Select value={runMode} onValueChange={setRunMode}>
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
