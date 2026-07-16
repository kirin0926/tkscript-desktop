import { useState } from 'react'
import { FolderOpen } from 'lucide-react'
import { Button } from '@/app/components/ui/button'
import { Input } from '@/app/components/ui/input'
import { Textarea } from '@/app/components/ui/textarea'
import { Field, FormSection, PanelShell } from './panel-kit'

export const ProfileSettingsPanel = () => {
  const [avatarFolder, setAvatarFolder] = useState('')
  const [signature, setSignature] = useState('')

  return (
    <PanelShell title="资料设置" description="配置账号头像与通用签名">
      <div className="space-y-8">
        <FormSection title="修改资料">
          <Field label="头像文件夹" htmlFor="profile-avatar-folder" className="sm:col-span-2">
            <div className="flex gap-2">
              <Input
                id="profile-avatar-folder"
                value={avatarFolder}
                onChange={(e) => setAvatarFolder(e.target.value)}
                placeholder="选择或输入头像文件夹路径"
              />
              <Button type="button" variant="outline" className="shrink-0">
                <FolderOpen />
                选择文件夹
              </Button>
            </div>
          </Field>
          <Field label="通用签名" htmlFor="profile-signature" className="sm:col-span-2">
            <Textarea
              id="profile-signature"
              value={signature}
              onChange={(e) => setSignature(e.target.value)}
              placeholder="请输入账号通用签名"
              rows={4}
            />
          </Field>
        </FormSection>
      </div>
    </PanelShell>
  )
}
