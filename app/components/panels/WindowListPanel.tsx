import { useCallback, useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { useSettings } from '@/app/components/settings/SettingsContext'
import { useConveyor } from '@/app/hooks/use-conveyor'
import { Badge } from '@/app/components/ui/badge'
import { Button } from '@/app/components/ui/button'
import { Checkbox } from '@/app/components/ui/checkbox'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/app/components/ui/table'
import type { FpWindow } from '@/lib/conveyor/schemas/fingerprint-schema'
import { PanelShell } from './panel-kit'

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
  const { listWindows } = useConveyor('fingerprint')
  const { apiHost, apiPort } = settings.publish

  const [rows, setRows] = useState<FpWindow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  const load = useCallback(() => {
    setLoading(true)
    setError(null)
    listWindows({ apiHost, apiPort })
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

  const description = loading ? '正在加载窗口…' : `共 ${rows.length} 个窗口，已选 ${selectedIds.size} 个`

  return (
    <PanelShell
      title="窗口列表"
      description={description}
      actions={
        <Button type="button" variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw />
          刷新
        </Button>
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
                <TableHead className="w-24">序列号</TableHead>
                <TableHead>名称</TableHead>
                <TableHead className="w-28">状态</TableHead>
                <TableHead>ID</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => {
                const checked = selectedIds.has(row.id)
                return (
                  <TableRow key={row.id} data-state={checked ? 'selected' : undefined}>
                    <TableCell>
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(value) => toggleOne(row.id, value === true)}
                        aria-label={`选择 ${row.name}`}
                      />
                    </TableCell>
                    <TableCell>{row.seq}</TableCell>
                    <TableCell>{row.name}</TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANT[row.status]}>{STATUS_TEXT[row.status]}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{row.id}</TableCell>
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
