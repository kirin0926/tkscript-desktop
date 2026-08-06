import { useEffect, useState } from 'react'
import { ExternalLink, Film, FolderOpen } from 'lucide-react'
import { useSettings } from '@/app/components/settings/SettingsContext'
import { useConveyor } from '@/app/hooks/use-conveyor'
import { Button } from '@/app/components/ui/button'
import { Input } from '@/app/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/app/components/ui/select'
import { ScrollArea } from '@/app/components/ui/scroll-area'
import type { MaterialSettings } from '@/lib/conveyor/schemas/settings-schema'
import { Field, FormSection, PanelShell } from './panel-kit'

export const MaterialSettingsPanel = () => {
  const { settings, update } = useSettings()
  const { openFolder: pickFolder } = useConveyor('dialog')
  const { openFolder: openInExplorer, listFiles } = useConveyor('app')
  const material = settings.material

  const [videoFiles, setVideoFiles] = useState<string[]>([])
  const [folderError, setFolderError] = useState<string | null>(null)

  // 当视频文件夹路径变化时，尝试读取文件列表
  useEffect(() => {
    if (!material.videoFolder) {
      setVideoFiles([])
      setFolderError(null)
      return
    }
    listFiles(material.videoFolder)
      .then((files) => {
        const videos = files.filter((f) =>
          /\.(mp4|mov|avi|mkv|webm|flv)$/i.test(f)
        )
        setVideoFiles(videos)
        setFolderError(videos.length === 0 ? '该文件夹中没有找到视频文件' : null)
      })
      .catch(() => {
        setVideoFiles([])
        setFolderError('无法读取文件夹，请检查路径是否有效')
      })
  }, [material.videoFolder, listFiles])

  const handlePickFolder = () => {
    pickFolder()
      .then((folder) => {
        if (folder) {
          update('material', { videoFolder: folder })
        }
      })
      .catch((error) => {
        console.error('选择文件夹失败:', error)
      })
  }

  const handleOpenInExplorer = () => {
    if (material.videoFolder) {
      openInExplorer(material.videoFolder).catch((error) => {
        console.error('打开文件夹失败:', error)
      })
    }
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
              {material.videoFolder && (
                <Button type="button" variant="ghost" size="icon" className="shrink-0" onClick={handleOpenInExplorer} title="在文件管理器中打开">
                  <ExternalLink className="size-4" />
                </Button>
              )}
            </div>
          </Field>
          <Field label="视频文件列表" className="sm:col-span-2">
            <div className="rounded-md border border-border">
              {videoFiles.length > 0 ? (
                <ScrollArea className="h-32">
                  <div className="space-y-1 p-2">
                    {videoFiles.map((file) => (
                      <div key={file} className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Film className="size-3 shrink-0" />
                        <span className="truncate">{file}</span>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              ) : (
                <div className="flex h-16 items-center justify-center text-xs text-muted-foreground">
                  {folderError || '请先选择视频文件夹'}
                </div>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              共 {videoFiles.length} 个视频文件
            </p>
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