import { useState } from 'react'
import { Badge } from '@/app/components/ui/badge'
import { Checkbox } from '@/app/components/ui/checkbox'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/app/components/ui/table'
import { PanelShell } from './panel-kit'

type WindowStatus = 'online' | 'running' | 'offline'

interface WindowRow {
  seq: number
  name: string
  status: WindowStatus
  id: string
}

const WINDOW_ROWS: WindowRow[] = [
  { seq: 1, name: '窗口 01', status: 'online', id: 'win-0001' },
  { seq: 2, name: '窗口 02', status: 'running', id: 'win-0002' },
  { seq: 3, name: '窗口 03', status: 'offline', id: 'win-0003' },
]

const STATUS_TEXT: Record<WindowStatus, string> = {
  online: '在线',
  running: '运行中',
  offline: '离线',
}

const STATUS_VARIANT: Record<WindowStatus, 'default' | 'secondary' | 'outline'> = {
  online: 'default',
  running: 'secondary',
  offline: 'outline',
}

export const WindowListPanel = () => {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  const allSelected = selectedIds.size === WINDOW_ROWS.length
  const someSelected = selectedIds.size > 0 && !allSelected
  const headerState = allSelected ? true : someSelected ? 'indeterminate' : false

  const toggleAll = (checked: boolean) => {
    setSelectedIds(checked ? new Set(WINDOW_ROWS.map((row) => row.id)) : new Set())
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

  return (
    <PanelShell title="窗口列表" description={`共 ${WINDOW_ROWS.length} 个窗口，已选 ${selectedIds.size} 个`}>
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
            {WINDOW_ROWS.map((row) => {
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
    </PanelShell>
  )
}
