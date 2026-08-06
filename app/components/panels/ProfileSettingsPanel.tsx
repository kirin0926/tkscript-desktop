import { useEffect, useState } from 'react'
import { ExternalLink, FolderOpen, Image } from 'lucide-react'
import { useSettings } from '@/app/components/settings/SettingsContext'
import { useConveyor } from '@/app/hooks/use-conveyor'
import { Button } from '@/app/components/ui/button'
import { Input } from '@/app/components/ui/input'
import { Textarea } from '@/app/components/ui/textarea'
import { ScrollArea } from '@/app/components/ui/scroll-area'
import { Field, FormSection, PanelShell } from './panel-kit'

export const ProfileSettingsPanel = () => {
  const { settings, update } = useSettings()
  const { openFolder: pickFolder } = useConveyor('dialog')
  const { openFolder: openInExplorer, listFiles } = useConveyor('app')
  const profile = settings.profile

  const [avatarFiles, setAvatarFiles] = useState<string[]>([])

  // 当头像文件夹路径变化时，尝试读取文件列表
  useEffect(() => {
    if (!profile.avatarFolder) {
      setAvatarFiles([])
      return
    }
    listFiles(profile.avatarFolder)
      .then((files) => {
        const images = files.filter((f) =>
          /\.(png|jpg|jpeg|gif|webp|bmp)$/i.test(f)
        )
        setAvatarFiles(images)
      })
      .catch(() => {
        setAvatarFiles([])
      })
  }, [profile.avatarFolder, listFiles])

  const handlePickFolder = () => {
    pickFolder()
      .then((folder) => {
        if (folder) {
          update('profile', { avatarFolder: folder })
        }
      })
      .catch((error) => {
        console.error('选择文件夹失败:', error)
      })
  }

  const handleOpenInExplorer = () => {
    if (profile.avatarFolder) {
      openInExplorer(profile.avatarFolder).catch((error) => {
        console.error('打开文件夹失败:', error)
      })
    }
  }

  return (
    <PanelShell title="资料设置" description="配置账号头像与通用签名">
      <div className="space-y-8">
        <FormSection title="修改资料">
          <Field label="头像文件夹" htmlFor="profile-avatar-folder" className="sm:col-span-2">
            <div className="flex gap-2">
              <Input
                id="profile-avatar-folder"
                value={profile.avatarFolder}
                onChange={(e) => update('profile', { avatarFolder: e.target.value })}
                placeholder="选择或输入头像文件夹路径"
              />
              <Button type="button" variant="outline" className="shrink-0" onClick={handlePickFolder}>
                <FolderOpen />
                选择文件夹
              </Button>
              {profile.avatarFolder && (
                <Button type="button" variant="ghost" size="icon" className="shrink-0" onClick={handleOpenInExplorer} title="在文件管理器中打开">
                  <ExternalLink className="size-4" />
                </Button>
              )}
            </div>
            {avatarFiles.length > 0 && (
              <div className="mt-2 rounded-md border border-border">
                <ScrollArea className="h-24">
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
          </Field>
          <Field label="通用签名" htmlFor="profile-signature" className="sm:col-span-2">
            <Textarea
              id="profile-signature"
              value={profile.signature}
              onChange={(e) => update('profile', { signature: e.target.value })}
              placeholder="请输入账号通用签名"
              rows={4}
            />
          </Field>
        </FormSection>
      </div>
    </PanelShell>
  )
}