import { useCallback, useEffect, useState } from 'react'
import { ExternalLink, Film, FolderOpen, Image, Settings2, Trash2 } from 'lucide-react'
import { useSettings } from '@/app/components/settings/SettingsContext'
import { useConveyor } from '@/app/hooks/use-conveyor'
import { Button } from '@/app/components/ui/button'
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/app/components/ui/dialog'
import { Input } from '@/app/components/ui/input'
import { Label } from '@/app/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/app/components/ui/select'
import { Switch } from '@/app/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/app/components/ui/tabs'
import { Textarea } from '@/app/components/ui/textarea'
import { ScrollArea } from '@/app/components/ui/scroll-area'
import type { FpWindow } from '@/lib/conveyor/schemas/fingerprint-schema'
import type { MaterialSettings, OverridableSection } from '@/lib/conveyor/schemas/settings-schema'

interface PerWindowSettingsDialogProps {
  window: FpWindow
}

/**
 * 每个窗口独立的资料／素材／作品设置弹窗。
 * 覆盖值会与全局设置合并，使用全局值作为 fallback。
 */
export const PerWindowSettingsDialog = ({ window: win }: PerWindowSettingsDialogProps) => {
  const { settings, updateWindowOverride, clearWindowOverride } = useSettings()
  const { openFolder: pickFolder } = useConveyor('dialog')
  const { openFolder: openInExplorer, listFiles } = useConveyor('app')

  const overrides = settings.windowOverrides?.[win.id]
  const global = settings

  // 头像文件列表
  const [avatarFiles, setAvatarFiles] = useState<string[]>([])
  // 视频文件列表
  const [videoFiles, setVideoFiles] = useState<string[]>([])
  const [folderError, setFolderError] = useState<string | null>(null)

  const avatarFolder = overrides?.profile?.avatarFolder ?? global.profile.avatarFolder
  const videoFolder = overrides?.material?.videoFolder ?? global.material.videoFolder

  // 当头像文件夹变化时读取文件列表
  useEffect(() => {
    if (!avatarFolder) {
      setAvatarFiles([])
      return
    }
    listFiles(avatarFolder)
      .then((files) => {
        setAvatarFiles(files.filter((f) => /\.(png|jpg|jpeg|gif|webp|bmp)$/i.test(f)))
      })
      .catch(() => setAvatarFiles([]))
  }, [avatarFolder, listFiles])

  // 当视频文件夹变化时读取文件列表
  useEffect(() => {
    if (!videoFolder) {
      setVideoFiles([])
      setFolderError(null)
      return
    }
    listFiles(videoFolder)
      .then((files) => {
        const videos = files.filter((f) => /\.(mp4|mov|avi|mkv|webm|flv)$/i.test(f))
        setVideoFiles(videos)
        setFolderError(videos.length === 0 ? '该文件夹中没有找到视频文件' : null)
      })
      .catch(() => {
        setVideoFiles([])
        setFolderError('无法读取文件夹，请检查路径是否有效')
      })
  }, [videoFolder, listFiles])

  const handlePickAvatarFolder = useCallback(() => {
    pickFolder()
      .then((folder) => {
        if (folder) {
          updateWindowOverride(win.id, 'profile', { avatarFolder: folder })
        }
      })
      .catch((error) => {
        console.error('选择头像文件夹失败:', error)
      })
  }, [pickFolder, updateWindowOverride, win.id])

  const handlePickVideoFolder = useCallback(() => {
    pickFolder()
      .then((folder) => {
        if (folder) {
          updateWindowOverride(win.id, 'material', { videoFolder: folder })
        }
      })
      .catch((error) => {
        console.error('选择视频文件夹失败:', error)
      })
  }, [pickFolder, updateWindowOverride, win.id])

  const handleOpenInExplorer = useCallback(
    (path: string) => {
      openInExplorer(path).catch((error) => {
        console.error('打开文件夹失败:', error)
      })
    },
    [openInExplorer]
  )

  const hasOverrides = overrides && Object.keys(overrides).length > 0

  const hasSectionOverride = (section: OverridableSection): boolean => {
    const sectionOverrides = overrides?.[section]
    return sectionOverrides != null && Object.keys(sectionOverrides).length > 0
  }

  /** 更新该窗口某个分类的覆盖值 */
  const updateOverride = useCallback(
    (section: OverridableSection, patch: Record<string, unknown>) => {
      updateWindowOverride(win.id, section, patch)
    },
    [updateWindowOverride, win.id]
  )

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button type="button" variant="ghost" size="sm" title="窗口设置">
          <Settings2 className="size-3" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>窗口设置 — {win.name}</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="profile" className="mt-2">
          <TabsList>
            <TabsTrigger value="profile" className="gap-1.5">
              资料设置
              {hasSectionOverride('profile') && <span className="size-1.5 rounded-full bg-blue-500" />}
            </TabsTrigger>
            <TabsTrigger value="material" className="gap-1.5">
              素材设置
              {hasSectionOverride('material') && <span className="size-1.5 rounded-full bg-blue-500" />}
            </TabsTrigger>
            <TabsTrigger value="works" className="gap-1.5">
              作品设置
              {hasSectionOverride('works') && <span className="size-1.5 rounded-full bg-blue-500" />}
            </TabsTrigger>
          </TabsList>

          {/* ── 资料设置 ── */}
          <TabsContent value="profile" className="mt-4 space-y-4">
            <div>
              <Label htmlFor="win-avatar-folder">头像文件夹</Label>
              <div className="mt-1.5 flex gap-2">
                <Input
                  id="win-avatar-folder"
                  value={overrides?.profile?.avatarFolder ?? ''}
                  onChange={(e) => updateOverride('profile', { avatarFolder: e.target.value })}
                  placeholder={global.profile.avatarFolder || '选择或输入头像文件夹路径'}
                />
                <Button type="button" variant="outline" size="icon" onClick={handlePickAvatarFolder}>
                  <FolderOpen className="size-4" />
                </Button>
                {avatarFolder && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => handleOpenInExplorer(avatarFolder)}
                    title="在文件管理器中打开"
                  >
                    <ExternalLink className="size-4" />
                  </Button>
                )}
              </div>
              {!overrides?.profile?.avatarFolder && global.profile.avatarFolder && (
                <p className="mt-1 text-xs text-muted-foreground">使用全局设置：{global.profile.avatarFolder}</p>
              )}
              {avatarFiles.length > 0 && (
                <div className="mt-2 rounded-md border border-border">
                  <ScrollArea className="h-20">
                    <div className="space-y-1 p-2">
                      {avatarFiles.map((file) => (
                        <div key={file} className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Image className="size-3 shrink-0" />
                          <span className="truncate">{file}</span>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                  <div className="border-t border-border px-2 py-1 text-xs text-muted-foreground">
                    共 {avatarFiles.length} 个头像文件
                  </div>
                </div>
              )}
            </div>

            <div>
              <Label htmlFor="win-signature">通用签名</Label>
              <Textarea
                id="win-signature"
                value={overrides?.profile?.signature ?? ''}
                onChange={(e) => updateOverride('profile', { signature: e.target.value })}
                placeholder={global.profile.signature || '请输入账号通用签名'}
                rows={3}
                className="mt-1.5"
              />
              {!overrides?.profile?.signature && global.profile.signature && (
                <p className="mt-1 text-xs text-muted-foreground">使用全局设置：{global.profile.signature}</p>
              )}
            </div>

            {hasSectionOverride('profile') && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => clearWindowOverride(win.id, 'profile')}
                className="text-destructive"
              >
                <Trash2 className="size-3" />
                清除资料覆盖
              </Button>
            )}
          </TabsContent>

          {/* ── 素材设置 ── */}
          <TabsContent value="material" className="mt-4 space-y-4">
            <div>
              <Label htmlFor="win-video-folder">视频文件夹</Label>
              <div className="mt-1.5 flex gap-2">
                <Input
                  id="win-video-folder"
                  value={overrides?.material?.videoFolder ?? ''}
                  onChange={(e) => updateOverride('material', { videoFolder: e.target.value })}
                  placeholder={global.material.videoFolder || '选择或输入视频文件夹路径'}
                />
                <Button type="button" variant="outline" size="icon" onClick={handlePickVideoFolder}>
                  <FolderOpen className="size-4" />
                </Button>
                {videoFolder && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => handleOpenInExplorer(videoFolder)}
                    title="在文件管理器中打开"
                  >
                    <ExternalLink className="size-4" />
                  </Button>
                )}
              </div>
              {!overrides?.material?.videoFolder && global.material.videoFolder && (
                <p className="mt-1 text-xs text-muted-foreground">使用全局设置：{global.material.videoFolder}</p>
              )}
            </div>

            <div>
              <Label>视频文件列表</Label>
              <div className="mt-1.5 rounded-md border border-border">
                {videoFiles.length > 0 ? (
                  <ScrollArea className="h-24">
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
                  <div className="flex h-12 items-center justify-center text-xs text-muted-foreground">
                    {folderError || '请先选择视频文件夹'}
                  </div>
                )}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">共 {videoFiles.length} 个视频文件</p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="win-video-mode">视频模式</Label>
                <Select
                  value={overrides?.material?.videoMode ?? 'sequential'}
                  onValueChange={(value) => updateOverride('material', { videoMode: value as MaterialSettings['videoMode'] })}
                >
                  <SelectTrigger id="win-video-mode" className="mt-1.5">
                    <SelectValue placeholder="选择视频模式" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sequential">顺序选取</SelectItem>
                    <SelectItem value="random">随机选取</SelectItem>
                  </SelectContent>
                </Select>
                {!overrides?.material?.videoMode && (
                  <p className="mt-1 text-xs text-muted-foreground">使用全局设置</p>
                )}
              </div>
              <div>
                <Label htmlFor="win-run-mode">运行模式</Label>
                <Select
                  value={overrides?.material?.runMode ?? 'single'}
                  onValueChange={(value) => updateOverride('material', { runMode: value as MaterialSettings['runMode'] })}
                >
                  <SelectTrigger id="win-run-mode" className="mt-1.5">
                    <SelectValue placeholder="选择运行模式" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="single">单次运行</SelectItem>
                    <SelectItem value="loop">循环运行</SelectItem>
                  </SelectContent>
                </Select>
                {!overrides?.material?.runMode && (
                  <p className="mt-1 text-xs text-muted-foreground">使用全局设置</p>
                )}
              </div>
            </div>

            {hasSectionOverride('material') && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => clearWindowOverride(win.id, 'material')}
                className="text-destructive"
              >
                <Trash2 className="size-3" />
                清除素材覆盖
              </Button>
            )}
          </TabsContent>

          {/* ── 作品设置 ── */}
          <TabsContent value="works" className="mt-4 space-y-4">
            <div>
              <Label htmlFor="win-title">视频标题</Label>
              <Input
                id="win-title"
                value={overrides?.works?.title ?? ''}
                onChange={(e) => updateOverride('works', { title: e.target.value })}
                placeholder={global.works.title || '请输入视频标题'}
                className="mt-1.5"
              />
              {!overrides?.works?.title && global.works.title && (
                <p className="mt-1 text-xs text-muted-foreground">使用全局设置：{global.works.title}</p>
              )}
            </div>

            <div>
              <Label htmlFor="win-hashtags">话题标签</Label>
              <Input
                id="win-hashtags"
                value={overrides?.works?.hashtags ?? ''}
                onChange={(e) => updateOverride('works', { hashtags: e.target.value })}
                placeholder={global.works.hashtags || '#fyp #viral #trending'}
                className="mt-1.5"
              />
              {!overrides?.works?.hashtags && global.works.hashtags && (
                <p className="mt-1 text-xs text-muted-foreground">使用全局设置：{global.works.hashtags}</p>
              )}
            </div>

            <div className="flex items-center justify-between rounded-md border border-border p-3">
              <div className="space-y-0.5">
                <Label htmlFor="win-scheduled">启用定时发布</Label>
                <p className="text-xs text-muted-foreground">按设定的时间间隔分批发布视频</p>
              </div>
              <Switch
                id="win-scheduled"
                checked={overrides?.works?.scheduled ?? global.works.scheduled}
                onCheckedChange={(checked) => updateOverride('works', { scheduled: checked })}
              />
            </div>

            <div>
              <Label htmlFor="win-schedule-count">定时时间条数</Label>
              <Input
                id="win-schedule-count"
                type="number"
                min={1}
                value={overrides?.works?.scheduleCount ?? global.works.scheduleCount}
                onChange={(e) => updateOverride('works', { scheduleCount: e.target.value })}
                disabled={!(overrides?.works?.scheduled ?? global.works.scheduled)}
                className="mt-1.5"
              />
            </div>

            {hasSectionOverride('works') && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => clearWindowOverride(win.id, 'works')}
                className="text-destructive"
              >
                <Trash2 className="size-3" />
                清除作品覆盖
              </Button>
            )}
          </TabsContent>
        </Tabs>

        <DialogFooter className="mt-6 flex items-center sm:justify-between">
          <div>
            {hasOverrides && (
              <Button type="button" variant="destructive" size="sm" onClick={() => clearWindowOverride(win.id)}>
                <Trash2 className="size-3" />
                清除所有覆盖
              </Button>
            )}
          </div>
          <DialogClose asChild>
            <Button type="button" variant="outline">关闭</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}