import { useEffect, useRef, useState } from 'react'
import { useSettings } from '@/app/components/settings/SettingsContext'
import { useConveyor } from '@/app/hooks/use-conveyor'
import { useScriptRunStore } from '@/app/stores/script-run-store'
import { Input } from '@/app/components/ui/input'
import { Button } from '@/app/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/app/components/ui/select'
import { Badge } from '@/app/components/ui/badge'
import type { FpGroup } from '@/lib/conveyor/schemas/fingerprint-schema'
import { Field, FormSection, PanelShell } from './panel-kit'
import { Loader2, Play, Plug, PlugZap, Square } from 'lucide-react'

export const PublishSettingsPanel = () => {
  const { settings, update } = useSettings()
  const { testConnection, listGroups } = useConveyor('fingerprint')
  const script = useConveyor('script')
  const publish = settings.publish
  const runId = useScriptRunStore((s) => s.runId)
  const running = useScriptRunStore((s) => s.running)
  const totalThreads = useScriptRunStore((s) => s.totalThreads)
  const failedThreads = useScriptRunStore((s) => s.failedThreads)

  const [groups, setGroups] = useState<FpGroup[]>([])
  const [testing, setTesting] = useState(false)
  const [connStatus, setConnStatus] = useState<{ ok: boolean; message: string } | null>(null)
  const [publishing, setPublishing] = useState(false)
  // 以 ref 持有最新连接参数，避免在编辑地址/端口时每次按键都重新拉取分组。
  const connRef = useRef({ apiHost: publish.apiHost, apiPort: publish.apiPort })
  connRef.current = { apiHost: publish.apiHost, apiPort: publish.apiPort }

  useEffect(() => {
    listGroups(connRef.current)
      .then(setGroups)
      .catch(() => setGroups([]))
  }, [listGroups])

  const handleTestConnection = async () => {
    setTesting(true)
    setConnStatus(null)
    try {
      const result = await testConnection({ apiHost: publish.apiHost, apiPort: publish.apiPort })
      setConnStatus(result)
    } catch (err) {
      setConnStatus({
        ok: false,
        message: err instanceof Error ? err.message : '连接测试异常',
      })
    } finally {
      setTesting(false)
    }
  }

  const handleStartPublish = async () => {
    setPublishing(true)
    try {
      const result = await script.start(settings)
      if (!result.runId) {
        console.error('启动发布失败：未返回 runId')
      }
    } catch (err) {
      console.error('启动发布失败:', err)
    } finally {
      setPublishing(false)
    }
  }

  const handleStopPublish = async () => {
    if (!runId) return
    try {
      await script.stop(runId)
    } catch (err) {
      console.error('停止发布失败:', err)
    }
  }

  const runStatusText = running
    ? `运行中：${totalThreads} 个线程`
    : failedThreads > 0
      ? `已完成：${failedThreads} 个线程失败`
      : runId
        ? '已完成'
        : null

  const runStatusVariant = running ? 'secondary' : failedThreads > 0 ? 'destructive' : 'default'

  return (
    <PanelShell
      title="发布设置"
      description="配置指纹浏览器连接与发布并发策略"
      actions={
        <div className="flex items-center gap-2">
          {runStatusText && (
            <Badge variant={runStatusVariant}>{runStatusText}</Badge>
          )}
          {running ? (
            <Button type="button" variant="destructive" size="sm" onClick={handleStopPublish}>
              <Square className="size-3" />
              停止发布
            </Button>
          ) : (
            <Button
              type="button"
              size="sm"
              onClick={handleStartPublish}
              disabled={publishing || !settings.works.title || !settings.material.videoFolder}
            >
              {publishing ? <Loader2 className="size-3 animate-spin" /> : <Play className="size-3" />}
              {publishing ? '启动中…' : '开始发布'}
            </Button>
          )}
        </div>
      }
    >
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
              placeholder="53200"
            />
          </Field>
          <Field label="连接测试" className="sm:col-span-2">
            <div className="flex items-center gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={handleTestConnection}
                disabled={testing}
              >
                {testing ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : connStatus?.ok ? (
                  <PlugZap className="size-4 text-green-500" />
                ) : (
                  <Plug className="size-4" />
                )}
                {testing ? '测试中…' : '测试连接'}
              </Button>
              {connStatus && (
                <Badge variant={connStatus.ok ? 'default' : 'destructive'}>
                  {connStatus.message}
                </Badge>
              )}
            </div>
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