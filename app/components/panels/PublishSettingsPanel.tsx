import { useEffect, useRef, useState } from 'react'
import { useSettings } from '@/app/components/settings/SettingsContext'
import { useConveyor } from '@/app/hooks/use-conveyor'
import { Input } from '@/app/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/app/components/ui/select'
import type { FpGroup } from '@/lib/conveyor/schemas/fingerprint-schema'
import { Field, FormSection, PanelShell } from './panel-kit'

export const PublishSettingsPanel = () => {
  const { settings, update } = useSettings()
  const { listGroups } = useConveyor('fingerprint')
  const publish = settings.publish

  const [groups, setGroups] = useState<FpGroup[]>([])
  // 以 ref 持有最新连接参数，避免在编辑地址/端口时每次按键都重新拉取分组。
  const connRef = useRef({ apiHost: publish.apiHost, apiPort: publish.apiPort })
  connRef.current = { apiHost: publish.apiHost, apiPort: publish.apiPort }

  useEffect(() => {
    listGroups(connRef.current)
      .then(setGroups)
      .catch(() => setGroups([]))
  }, [listGroups])

  return (
    <PanelShell title="发布设置" description="配置指纹浏览器连接与发布并发策略">
      <div className="space-y-8">
        <FormSection title="指纹浏览器">
          <Field label="API 地址" htmlFor="publish-api-host" className="sm:col-span-2">
            <Input
              id="publish-api-host"
              value={publish.apiHost}
              onChange={(e) => update('publish', { apiHost: e.target.value })}
              placeholder="http://127.0.0.1"
            />
          </Field>
          <Field label="端口" htmlFor="publish-api-port">
            <Input
              id="publish-api-port"
              type="number"
              min={0}
              value={publish.apiPort}
              onChange={(e) => update('publish', { apiPort: e.target.value })}
              placeholder="50325"
            />
          </Field>
        </FormSection>

        <FormSection title="窗口与并发">
          <Field label="分组" htmlFor="publish-group">
            <Select value={publish.group} onValueChange={(value) => update('publish', { group: value })}>
              <SelectTrigger id="publish-group" className="w-full">
                <SelectValue placeholder="选择分组" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部分组</SelectItem>
                {groups
                  .filter((group) => group.id !== 'all')
                  .map((group) => (
                    <SelectItem key={group.id} value={group.id}>
                      {group.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="窗口序列" htmlFor="publish-window-seq" hint="支持区间或逗号分隔，如 1-10 或 1,3,5">
            <Input
              id="publish-window-seq"
              value={publish.windowSeq}
              onChange={(e) => update('publish', { windowSeq: e.target.value })}
              placeholder="1-10"
            />
          </Field>
          <Field label="同时运行线程" htmlFor="publish-threads">
            <Input
              id="publish-threads"
              type="number"
              min={1}
              value={publish.threads}
              onChange={(e) => update('publish', { threads: e.target.value })}
            />
          </Field>
        </FormSection>

        <FormSection title="发布策略">
          <Field label="每个账号发布数量" htmlFor="publish-per-account">
            <Input
              id="publish-per-account"
              type="number"
              min={1}
              value={publish.perAccount}
              onChange={(e) => update('publish', { perAccount: e.target.value })}
            />
          </Field>
          <Field label="发布轮数" htmlFor="publish-rounds">
            <Input
              id="publish-rounds"
              type="number"
              min={1}
              value={publish.rounds}
              onChange={(e) => update('publish', { rounds: e.target.value })}
            />
          </Field>
          <Field label="上传等待时间（秒）" htmlFor="publish-upload-wait">
            <Input
              id="publish-upload-wait"
              type="number"
              min={0}
              value={publish.uploadWait}
              onChange={(e) => update('publish', { uploadWait: e.target.value })}
            />
          </Field>
        </FormSection>
      </div>
    </PanelShell>
  )
}
