import { FolderOpen } from 'lucide-react'
import { useSettings } from '@/app/components/settings/SettingsContext'
import { useConveyor } from '@/app/hooks/use-conveyor'
import { Button } from '@/app/components/ui/button'
import { Input } from '@/app/components/ui/input'
import { Textarea } from '@/app/components/ui/textarea'
import { Field, FormSection, PanelShell } from './panel-kit'

export const ProfileSettingsPanel = () => {
  const { settings, update } = useSettings()
  const { openFolder } = useConveyor('dialog')
  const profile = settings.profile

  const handlePickFolder = () => {
    openFolder()
      .then((folder) => {
        if (folder) {
          update('profile', { avatarFolder: folder })
        }
      })
      .catch((error) => {
        console.error('Failed to open folder dialog:', error)
      })
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
            </div>
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
