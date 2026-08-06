import { useCallback, useEffect, useState } from 'react'
import { Play, Pause, Square, RotateCcw, RefreshCw, Loader2, CheckCheck } from 'lucide-react'
import { useSettings } from '@/app/components/settings/SettingsContext'
import { useConveyor } from '@/app/hooks/use-conveyor'
import { useScriptRunStore } from '@/app/stores/script-run-store'
import { toast } from 'sonner'
import { Badge } from '@/app/components/ui/badge'
import { Button } from '@/app/components/ui/button'
import { Checkbox } from '@/app/components/ui/checkbox'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/app/components/ui/table'
import type { FpWindow } from '@/lib/conveyor/schemas/fingerprint-schema'
import { PanelShell } from './panel-kit'
import { PerWindowSettingsDialog } from './PerWindowSettingsDialog'

const STATUS_TEXT: Record<FpWindow['status'], string> = {
  online: '在线',
  running: '运行中',
  offline: '离线',
}

const STATUS_VARIANT: Record<FpWindow['status'], 'default' | 'secondary' | 'outline'> = {
  online: 'default',
  running: 'secondary',
  offline: 'outline',
}

export const WindowListPanel = () => {
  const { settings } = useSettings()
  const { listWindows, openWindow, closeWindow, getOpenedWindows } = useConveyor('fingerprint')
  const scriptApi = useConveyor('script')
  const { apiHost, apiPort } = settings.publish
  const running = useScriptRunStore((s) => s.running)
  const paused = useScriptRunStore((s) => s.paused)
  const runId = useScriptRunStore((s) => s.runId)

  const [rows, setRows] = useState<FpWindow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [actionLoading, setActionLoading] = useState<Set<string>>(new Set())
  const [publishing, setPublishing] = useState(false)

  const conn = { apiHost, apiPort }

  const load = useCallback(() => {
    setLoading(true)
    setError(null)
    listWindows(conn)
      .then((windows) => {
        setRows(windows)
        setSelectedIds(new Set())
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : '获取窗口列表失败')
        setRows([])
      })
      .finally(() => {
        setLoading(false)
      })
  }, [listWindows, apiHost, apiPort])

  useEffect(() => {
    load()
  }, [load])

  const handleOpen = async (profileId: string) => {
    setActionLoading((prev) => new Set(prev).add(profileId))
    try {
      await openWindow(conn, profileId)
      // 刷新列表以更新状态
      await load()
    } catch (err) {
      console.error('打开窗口失败:', err)
    } finally {
      setActionLoading((prev) => {
        const next = new Set(prev)
        next.delete(profileId)
        return next
      })
    }
  }

  const handleClose = async (profileId: string) => {
    setActionLoading((prev) => new Set(prev).add(profileId))
    try {
      await closeWindow(conn, profileId)
      await load()
    } catch (err) {
      console.error('关闭窗口失败:', err)
    } finally {
      setActionLoading((prev) => {
        const next = new Set(prev)
        next.delete(profileId)
        return next
      })
    }
  }

  const handleStart = async () => {
    setPublishing(true)
    try {
      const result = await scriptApi.start(settings)
      if (!result.runId) {
        toast.error('启动发布失败：未返回 runId')
      }
      toast.success('已开始发布任务')
    } catch (err) {
      console.error('启动发布失败:', err)
      toast.error('启动发布失败', { description: err instanceof Error ? err.message : String(err) })
    } finally {
      setPublishing(false)
    }
  }

  const handlePause = async () => {
    if (!runId) return
    try {
      await scriptApi.pause(runId)
      toast.message('已暂停发布任务')
    } catch (err) {
      console.error('暂停发布失败:', err)
      toast.error('暂停发布失败')
    }
  }

  const handleResume = async () => {
    if (!runId) return
    try {
      await scriptApi.resume(runId)
      toast.success('已恢复发布任务')
    } catch (err) {
      console.error('恢复发布失败:', err)
      toast.error('恢复发布失败')
    }
  }

  const handleStop = async () => {
    if (!runId) return
    try {
      await scriptApi.stop(runId)
      toast.message('已请求停止发布')
    } catch (err) {
      console.error('停止发布失败:', err)
      toast.error('停止发布失败')
    }
  }

  const handleSelectAll = () => {
    toggleAll(selectedIds.size !== rows.length)
  }

  const handleRefreshOpened = async () => {
    setLoading(true)
    setError(null)
    try {
      const windows = await getOpenedWindows(conn)
      setRows(windows)
      setSelectedIds(new Set())
    } catch (err) {
      setError(err instanceof Error ? err.message : '获取已打开窗口失败')
      setRows([])
    } finally {
      setLoading(false)
    }
  }

  const allSelected = rows.length > 0 && selectedIds.size === rows.length
  const someSelected = selectedIds.size > 0 && !allSelected
  const headerState = allSelected ? true : someSelected ? 'indeterminate' : false

  const toggleAll = (checked: boolean) => {
    setSelectedIds(checked ? new Set(rows.map((row) => row.id)) : new Set())
  }

  const toggleOne = (id: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (checked) {
        next.add(id)
      } else {
        next.delete(id)
      }
      return next
    })
  }

  const description = loading
    ? '正在加载窗口…'
    : error
      ? '加载失败'
      : `共 ${rows.length} 个窗口，已选 ${selectedIds.size} 个`

  return (
    <PanelShell
      title="窗口列表"
      description={description}
      actions={
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            {!running ? (
              <Button type="button" size="sm" onClick={handleStart} disabled={publishing}>
                {publishing ? <Loader2 className="size-3 animate-spin" /> : null}
                开始发布
              </Button>
            ) : (
              <>
                {paused ? (
                  <Button type="button" variant="outline" size="sm" onClick={handleResume}>
                    <RotateCcw className="size-3" />
                    恢复
                  </Button>
                ) : (
                  <Button type="button" variant="outline" size="sm" onClick={handlePause}>
                    <Pause className="size-3" />
                    暂停
                  </Button>
                )}
                <Button type="button" variant="destructive" size="sm" onClick={handleStop}>
                  <Square className="size-3" />
                  停止
                </Button>
              </>
            )}
            <Button type="button" variant="outline" size="sm" onClick={handleSelectAll}>
              <CheckCheck className="size-3" />
              一键勾选
            </Button>
            <div className="ml-auto flex items-center gap-2">
              <Button type="button" variant="outline" size="sm" onClick={handleRefreshOpened} disabled={loading}>
                <Play className="size-3" />
                已打开
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={load} disabled={loading}>
                <RefreshCw className={`size-3 ${loading ? 'animate-spin' : ''}`} />
                刷新
              </Button>
            </div>
          </div>
        </div>
      }
    >
      {loading ? (
        <div className="flex h-full items-center justify-center text-sm text-muted-foreground">加载中…</div>
      ) : error ? (
        <div className="flex h-full flex-col items-center justify-center gap-3 text-sm">
          <p className="text-destructive">{error}</p>
          <Button type="button" variant="outline" size="sm" onClick={load}>
            <RefreshCw />
            重试
          </Button>
        </div>
      ) : rows.length === 0 ? (
        <div className="flex h-full items-center justify-center text-sm text-muted-foreground">暂无窗口</div>
      ) : (
        <div className="overflow-hidden rounded-md border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox
                    checked={headerState}
                    onCheckedChange={(value) => toggleAll(value === true)}
                    aria-label="一键勾选"
                  />
                </TableHead>
                <TableHead className="w-16">序列号</TableHead>
                <TableHead>名称</TableHead>
                <TableHead className="w-24">状态</TableHead>
                <TableHead>ID</TableHead>
                <TableHead className="w-32">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => {
                const checked = selectedIds.has(row.id)
                const isLoading = actionLoading.has(row.id)
                const isRunning = row.status === 'running' || row.status === 'online'
                return (
                  <TableRow key={row.id} data-state={checked ? 'selected' : undefined}>
                    <TableCell>
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(value) => toggleOne(row.id, value === true)}
                        aria-label={`选择 ${row.name}`}
                      />
                    </TableCell>
                    <TableCell className="text-muted-foreground">{row.seq}</TableCell>
                    <TableCell className="font-medium">{row.name}</TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANT[row.status]}>{STATUS_TEXT[row.status]}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground font-mono text-xs">{row.id}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        {isRunning ? (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => handleClose(row.id)}
                            disabled={isLoading}
                          >
                            {isLoading ? <Loader2 className="size-3 animate-spin" /> : <Square className="size-3" />}
                            关闭
                          </Button>
                        ) : (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => handleOpen(row.id)}
                            disabled={isLoading}
                          >
                            {isLoading ? <Loader2 className="size-3 animate-spin" /> : <Play className="size-3" />}
                            打开
                          </Button>
                        )}
                        <PerWindowSettingsDialog window={row} />
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </PanelShell>
  )
}