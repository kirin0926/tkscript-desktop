import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Play, Pause, Square, RotateCcw, RefreshCw, Loader2, CheckCheck, Layers } from 'lucide-react'
import { useSettings } from '@/app/components/settings/SettingsContext'
import { useConveyor } from '@/app/hooks/use-conveyor'
import { useScriptRunStore } from '@/app/stores/script-run-store'
import { useWindowListStore } from '@/app/stores/window-list-store'
import { toast } from 'sonner'
import { Badge } from '@/app/components/ui/badge'
import { Button } from '@/app/components/ui/button'
import { Checkbox } from '@/app/components/ui/checkbox'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/app/components/ui/table'
import type { FpWindow } from '@/lib/conveyor/schemas/fingerprint-schema'
import type { OverridableSection } from '@/lib/conveyor/schemas/settings-schema'
import { PanelShell } from './panel-kit'
import { PerWindowSettingsDialog } from './PerWindowSettingsDialog'
import { BatchMaterialDialog } from './BatchMaterialDialog'

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

const VIDEO_MODE_TEXT: Record<string, string> = { sequential: '顺序', random: '随机' }
const RUN_MODE_TEXT: Record<string, string> = { single: '单次', loop: '循环' }

/** 设置单元格中的一行 标签:值 展示，带截断与覆盖标记 */
const SettingRow = ({ label, value, overridden }: { label: string; value: string; overridden?: boolean }) => (
  <div className="flex min-w-0 items-center gap-1.5">
    <span className="shrink-0 text-xs text-muted-foreground">{label}</span>
    {overridden && <span className="size-1.5 shrink-0 rounded-full bg-blue-500" title="该窗口有独立覆盖设置" />}
    <span className="truncate text-xs" title={value || label}>
      {value || '未设置'}
    </span>
  </div>
)

export const WindowListPanel = () => {
  const { settings } = useSettings()
  const { listWindows, openWindow, closeWindow, getOpenedWindows } = useConveyor('fingerprint')
  const scriptApi = useConveyor('script')
  const { apiHost, apiPort, apiKey, fingerprintType, appId, appSecret, groupCode } = settings.publish
  const running = useScriptRunStore((s) => s.running)
  const paused = useScriptRunStore((s) => s.paused)
  const runId = useScriptRunStore((s) => s.runId)

  // ── 使用 zustand store 缓存窗口列表，切换标签页后数据不丢失 ──
  const store = useWindowListStore()
  const { windows, lastFetched, loading, error, selectedIds } = store

  const [actionLoading, setActionLoading] = useState<Set<string>>(new Set())
  const [publishing, setPublishing] = useState(false)
  const [batchOpen, setBatchOpen] = useState(false)
  const lastClickedId = useRef<string | null>(null)

  const conn = { apiHost, apiPort, apiKey, fingerprintType, appId, appSecret, groupCode }

  // ── 加载窗口列表（显示 loading 动画） ──
  const load = useCallback(() => {
    store.setLoading(true)
    store.setError(null)
    listWindows(conn)
      .then((windows) => {
        store.setWindows(windows)
        store.setSelectedIds([])
      })
      .catch((err) => {
        store.setError(err instanceof Error ? err.message : '获取窗口列表失败')
        store.setWindows([])
      })
      .finally(() => {
        store.setLoading(false)
      })
  }, [listWindows, apiHost, apiPort, apiKey, fingerprintType, appId, appSecret, groupCode])

  // ── 首次挂载：无缓存则加载，有缓存则直接展示 ──
  useEffect(() => {
    if (windows.length === 0) {
      load()
    }
    // 有缓存数据直接展示，不重新请求
  }, [load, windows.length])

  const handleOpen = async (profileId: string) => {
    setActionLoading((prev) => new Set(prev).add(profileId))
    try {
      await openWindow(conn, profileId)
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
    if (selectedIds.length === 0) {
      toast.error('请先选择要发布的窗口')
      return
    }
    setPublishing(true)
    try {
      // 将选中窗口的 seq 转换为 windowSeq 字符串（如 "1,3,5"）
      const seqs = windows
        .filter((row) => selectedIds.includes(row.id))
        .map((row) => row.seq)
        .sort((a, b) => a - b)
      const windowSeq = seqs.join(',')
      // 临时覆盖 windowSeq，只发布勾选的窗口
      const updatedSettings = { ...settings, publish: { ...settings.publish, windowSeq } }
      const result = await scriptApi.start(updatedSettings)
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
    const allIds = windows.map((row) => row.id)
    store.toggleAll(selectedIds.length !== windows.length, allIds)
  }

  const handleRefreshOpened = async () => {
    store.setLoading(true)
    store.setError(null)
    try {
      const windows = await getOpenedWindows(conn)
      store.setWindows(windows)
      store.setSelectedIds([])
    } catch (err) {
      store.setError(err instanceof Error ? err.message : '获取已打开窗口失败')
      store.setWindows([])
    } finally {
      store.setLoading(false)
    }
  }

  const allSelected = windows.length > 0 && selectedIds.length === windows.length
  const someSelected = selectedIds.length > 0 && !allSelected
  const headerState = allSelected ? true : someSelected ? 'indeterminate' : false

  const toggleAll = (checked: boolean) => {
    store.toggleAll(checked, windows.map((row) => row.id))
  }

  const toggleOne = (id: string, checked: boolean) => {
    store.toggleOne(id, checked)
    if (checked) lastClickedId.current = id
  }

  /** Shift 点击：从最近一次点击的行到当前行，整段全选（基于展示顺序的索引） */
  const handleShiftSelect = (id: string) => {
    const anchorId = lastClickedId.current ?? id
    const indexOfCurrent = windows.findIndex((row) => row.id === id)
    const indexOfAnchor = windows.findIndex((row) => row.id === anchorId)
    const [start, end] = [Math.min(indexOfCurrent, indexOfAnchor), Math.max(indexOfCurrent, indexOfAnchor)]
    const rangeIds = windows.slice(start, end + 1).map((row) => row.id)
    store.setSelectedIds([...new Set([...selectedIds, ...rangeIds])])
  }

  // 把 selectedIds 转成 Set 方便 O(1) 查找
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds])

  const description = loading && windows.length === 0
    ? '正在加载窗口…'
    : loading
      ? `共 ${windows.length} 个窗口，已选 ${selectedIds.length} 个（刷新中…）`
      : error && windows.length === 0
        ? '加载失败'
        : `共 ${windows.length} 个窗口，已选 ${selectedIds.length} 个`

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
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                if (selectedIds.length === 0) {
                  toast.error('请先选择要设置的窗口')
                  return
                }
                setBatchOpen(true)
              }}
            >
              <Layers className="size-3" />
              批量设置素材
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
      {loading && windows.length === 0 ? (
        <div className="flex h-full items-center justify-center text-sm text-muted-foreground">加载中…</div>
      ) : error && windows.length === 0 ? (
        <div className="flex h-full flex-col items-center justify-center gap-3 text-sm">
          <p className="text-destructive">{error}</p>
          <Button type="button" variant="outline" size="sm" onClick={load}>
            <RefreshCw />
            重试
          </Button>
        </div>
      ) : windows.length === 0 ? (
        <div className="flex h-full items-center justify-center text-sm text-muted-foreground">暂无窗口</div>
      ) : (
        <div className="overflow-x-auto rounded-md border border-border">
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
                <TableHead className="min-w-[120px]">名称</TableHead>
                <TableHead className="w-24">状态</TableHead>
                <TableHead className="min-w-[100px]">ID</TableHead>
                <TableHead className="min-w-[180px]">资料设置</TableHead>
                <TableHead className="min-w-[200px]">素材设置</TableHead>
                <TableHead className="min-w-[220px]">作品设置</TableHead>
                <TableHead className="w-32">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {windows.map((row) => {
                const checked = selectedSet.has(row.id)
                const isLoading = actionLoading.has(row.id)
                const isRunning = row.status === 'running' || row.status === 'online'
                // 该窗口的有效设置 = 全局设置 + 窗口覆盖设置合并
                const override = settings.windowOverrides?.[row.id]
                const effectiveProfile = { ...settings.profile, ...(override?.profile ?? {}) }
                const effectiveMaterial = { ...settings.material, ...(override?.material ?? {}) }
                const effectiveWorks = { ...settings.works, ...(override?.works ?? {}) }
                const isOverridden = (section: OverridableSection, field: string) =>
                  (override?.[section] as Record<string, unknown> | undefined)?.[field] !== undefined
                return (
                  <TableRow key={row.id} data-state={checked ? 'selected' : undefined}>
                    <TableCell>
                      <Checkbox
                        checked={checked}
                        onClick={(e) => {
                          e.stopPropagation()
                          if (e.shiftKey) {
                            // Shift+点击：无论当前行选否，都以它为终点做区段全选
                            handleShiftSelect(row.id)
                            e.preventDefault() // 阻止 radix 内部触发 toggle
                          }
                        }}
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
                      <div className="min-w-0 space-y-1 py-1">
                        <SettingRow
                          label="头像"
                          value={effectiveProfile.avatarFolder}
                          overridden={isOverridden('profile', 'avatarFolder')}
                        />
                        <SettingRow
                          label="签名"
                          value={effectiveProfile.signature}
                          overridden={isOverridden('profile', 'signature')}
                        />
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="min-w-0 space-y-1 py-1">
                        <SettingRow
                          label="视频"
                          value={effectiveMaterial.videoFolder}
                          overridden={isOverridden('material', 'videoFolder')}
                        />
                        <div className="flex items-center gap-1.5">
                          <span className="shrink-0 text-xs text-muted-foreground">模式</span>
                          <span className="truncate text-xs">
                            {VIDEO_MODE_TEXT[effectiveMaterial.videoMode] ?? effectiveMaterial.videoMode} ·{' '}
                            {RUN_MODE_TEXT[effectiveMaterial.runMode] ?? effectiveMaterial.runMode}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="shrink-0 text-xs text-muted-foreground">发送</span>
                          <span className="truncate text-xs">
                            {effectiveMaterial.sentFileAction === 'mark'
                              ? '标记已发送'
                              : effectiveMaterial.sentFileAction === 'delete'
                                ? '发布后删除'
                                : '保留循环'}
                          </span>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="min-w-0 space-y-1 py-1">
                        <SettingRow
                          label="标题"
                          value={effectiveWorks.title}
                          overridden={isOverridden('works', 'title')}
                        />
                        <SettingRow
                          label="标签"
                          value={effectiveWorks.hashtags}
                          overridden={isOverridden('works', 'hashtags')}
                        />
                        <div className="flex items-center gap-1.5">
                          <span className="shrink-0 text-xs text-muted-foreground">定时</span>
                          <span className="truncate text-xs">
                            {effectiveWorks.scheduled ? `是（${effectiveWorks.scheduleCount}条）` : '否'}
                          </span>
                        </div>
                      </div>
                    </TableCell>
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
      <BatchMaterialDialog
        open={batchOpen}
        onOpenChange={setBatchOpen}
        windows={windows.filter((row) => selectedIds.includes(row.id))}
      />
    </PanelShell>
  )
}