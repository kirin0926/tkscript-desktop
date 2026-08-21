import { useCallback, useState } from 'react'
import { FolderOpen, Layers, Trash2 } from 'lucide-react'
import { useSettings } from '@/app/components/settings/SettingsContext'
import { useConveyor } from '@/app/hooks/use-conveyor'
import { toast } from 'sonner'
import { Button } from '@/app/components/ui/button'
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/app/components/ui/dialog'
import { Input } from '@/app/components/ui/input'
import { Label } from '@/app/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/app/components/ui/select'
import type { FpWindow } from '@/lib/conveyor/schemas/fingerprint-schema'
import type { MaterialSettings, OverridableSection } from '@/lib/conveyor/schemas/settings-schema'

interface BatchMaterialDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** 已选中的窗口 */
  windows: FpWindow[]
}

/**
 * 批量设置素材：对已选中的窗口批量写入素材覆盖设置。
 * 留空的字段不覆盖，沿用全局或窗口原有设置。
 */
export const BatchMaterialDialog = ({ open, onOpenChange, windows }: BatchMaterialDialogProps) => {
  const { updateWindowOverride, clearWindowOverride } = useSettings()
  const { openFolder: pickFolder } = useConveyor('dialog')

  const [videoFolder, setVideoFolder] = useState('')
  const [videoMode, setVideoMode] = useState<'' | MaterialSettings['videoMode']>('')
  const [runMode, setRunMode] = useState<'' | MaterialSettings['runMode']>('')
  const [sentFileAction, setSentFileAction] = useState<'' | MaterialSettings['sentFileAction']>('')

  const reset = () => {
    setVideoFolder('')
    setVideoMode('')
    setRunMode('')
    setSentFileAction('')
  }

  const handlePickVideoFolder = useCallback(() => {
    pickFolder()
      .then((folder) => {
        if (folder) {
          setVideoFolder(folder)
        }
      })
      .catch((error) => {
        console.error('选择视频文件夹失败:', error)
      })
  }, [pickFolder])

  const apply = () => {
    const patch: Record<string, unknown> = {}
    if (videoFolder.trim()) {
      patch.videoFolder = videoFolder.trim()
    }
    if (videoMode) {
      patch.videoMode = videoMode
    }
    if (runMode) {
      patch.runMode = runMode
    }
    if (sentFileAction) {
      patch.sentFileAction = sentFileAction
    }
    if (Object.keys(patch).length === 0) {
      toast.error('请至少填写一项要设置的素材内容')
      return
    }
    windows.forEach((win) => updateWindowOverride(win.id, 'material' satisfies OverridableSection, patch))
    toast.success(`已为 ${windows.length} 个窗口批量设置素材`)
    reset()
    onOpenChange(false)
  }

  const clear = () => {
    windows.forEach((win) => clearWindowOverride(win.id, 'material' satisfies OverridableSection))
    toast.success(`已清除 ${windows.length} 个窗口的素材覆盖`)
    reset()
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Layers className="size-4" />
            批量设置素材
          </DialogTitle>
          <p className="text-sm text-muted-foreground">
            将应用到已选的 <span className="font-medium text-foreground">{windows.length}</span> 个窗口，留空的字段不修改
          </p>
        </DialogHeader>

        <div className="mt-2 space-y-4">
          <div>
            <Label htmlFor="batch-video-folder">视频文件夹</Label>
            <div className="mt-1.5 flex gap-2">
              <Input
                id="batch-video-folder"
                value={videoFolder}
                onChange={(e) => setVideoFolder(e.target.value)}
                placeholder="留空则使用各窗口原有视频文件夹"
              />
              <Button type="button" variant="outline" size="icon" onClick={handlePickVideoFolder}>
                <FolderOpen className="size-4" />
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label htmlFor="batch-video-mode">视频模式</Label>
              <Select value={videoMode || undefined} onValueChange={(value) => setVideoMode(value as MaterialSettings['videoMode'])}>
                <SelectTrigger id="batch-video-mode" className="mt-1.5">
                  <SelectValue placeholder="不修改" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sequential">顺序选取</SelectItem>
                  <SelectItem value="random">随机选取</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="batch-run-mode">运行模式</Label>
              <Select value={runMode || undefined} onValueChange={(value) => setRunMode(value as MaterialSettings['runMode'])}>
                <SelectTrigger id="batch-run-mode" className="mt-1.5">
                  <SelectValue placeholder="不修改" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="single">单次运行</SelectItem>
                  <SelectItem value="loop">循环运行</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="batch-sent-action">发送后处理</Label>
              <Select
                value={sentFileAction || undefined}
                onValueChange={(value) => setSentFileAction(value as MaterialSettings['sentFileAction'])}
              >
                <SelectTrigger id="batch-sent-action" className="mt-1.5">
                  <SelectValue placeholder="不修改" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="keep">保留循环使用</SelectItem>
                  <SelectItem value="mark">标记已发送</SelectItem>
                  <SelectItem value="delete">发布后删除</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <DialogFooter className="mt-6 flex items-center sm:justify-between">
          <Button type="button" variant="destructive" size="sm" onClick={clear}>
            <Trash2 className="size-3" />
            清除所选窗口素材覆盖
          </Button>
          <div className="flex items-center gap-2">
            <DialogClose asChild>
              <Button type="button" variant="outline">取消</Button>
            </DialogClose>
            <Button type="button" onClick={apply}>应用</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
