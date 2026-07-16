import { useState } from 'react'
import { Input } from '@/app/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/app/components/ui/select'
import { Field, FormSection, PanelShell } from './panel-kit'

export const PublishSettingsPanel = () => {
  const [apiHost, setApiHost] = useState('http://127.0.0.1')
  const [apiPort, setApiPort] = useState('50325')
  const [group, setGroup] = useState('all')
  const [windowSeq, setWindowSeq] = useState('')
  const [threads, setThreads] = useState('1')
  const [perAccount, setPerAccount] = useState('1')
  const [rounds, setRounds] = useState('1')
  const [uploadWait, setUploadWait] = useState('30')

  return (
    <PanelShell title="发布设置" description="配置指纹浏览器连接与发布并发策略">
      <div className="space-y-8">
        <FormSection title="指纹浏览器">
          <Field label="API 地址" htmlFor="publish-api-host" className="sm:col-span-2">
            <Input
              id="publish-api-host"
              value={apiHost}
              onChange={(e) => setApiHost(e.target.value)}
              placeholder="http://127.0.0.1"
            />
          </Field>
          <Field label="端口" htmlFor="publish-api-port">
            <Input
              id="publish-api-port"
              type="number"
              min={0}
              value={apiPort}
              onChange={(e) => setApiPort(e.target.value)}
              placeholder="50325"
            />
          </Field>
        </FormSection>

        <FormSection title="窗口与并发">
          <Field label="分组" htmlFor="publish-group">
            <Select value={group} onValueChange={setGroup}>
              <SelectTrigger id="publish-group" className="w-full">
                <SelectValue placeholder="选择分组" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部分组</SelectItem>
                <SelectItem value="group-a">分组 A</SelectItem>
                <SelectItem value="group-b">分组 B</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="窗口序列" htmlFor="publish-window-seq" hint="支持区间或逗号分隔，如 1-10 或 1,3,5">
            <Input
              id="publish-window-seq"
              value={windowSeq}
              onChange={(e) => setWindowSeq(e.target.value)}
              placeholder="1-10"
            />
          </Field>
          <Field label="同时运行线程" htmlFor="publish-threads">
            <Input
              id="publish-threads"
              type="number"
              min={1}
              value={threads}
              onChange={(e) => setThreads(e.target.value)}
            />
          </Field>
        </FormSection>

        <FormSection title="发布策略">
          <Field label="每个账号发布数量" htmlFor="publish-per-account">
            <Input
              id="publish-per-account"
              type="number"
              min={1}
              value={perAccount}
              onChange={(e) => setPerAccount(e.target.value)}
            />
          </Field>
          <Field label="发布轮数" htmlFor="publish-rounds">
            <Input
              id="publish-rounds"
              type="number"
              min={1}
              value={rounds}
              onChange={(e) => setRounds(e.target.value)}
            />
          </Field>
          <Field label="上传等待时间（秒）" htmlFor="publish-upload-wait">
            <Input
              id="publish-upload-wait"
              type="number"
              min={0}
              value={uploadWait}
              onChange={(e) => setUploadWait(e.target.value)}
            />
          </Field>
        </FormSection>
      </div>
    </PanelShell>
  )
}
