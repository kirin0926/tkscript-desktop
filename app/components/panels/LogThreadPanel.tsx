import { useEffect, useMemo } from 'react'
import { Inbox } from 'lucide-react'
import { useConveyor } from '@/app/hooks/use-conveyor'
import { useScriptRunStore, type ThreadState, type LogItem } from '@/app/stores/script-run-store'
import { Badge } from '@/app/components/ui/badge'
import { ScrollArea } from '@/app/components/ui/scroll-area'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/app/components/ui/table'
import { cn } from '@/lib/utils'
import { PanelShell } from './panel-kit'

const STATUS_LABEL: Record<ThreadState['status'], string> = {
  idle: '待启动',
  running: '运行中',
  success: '已完成',
  failed: '失败',
  aborted: '已中止',
}

const STATUS_VARIANT: Record<ThreadState['status'], 'default' | 'secondary' | 'outline' | 'destructive'> = {
  idle: 'outline',
  running: 'secondary',
  success: 'default',
  failed: 'destructive',
  aborted: 'outline',
}

const LEVEL_COLOR: Record<LogItem['level'], string> = {
  debug: 'text-muted-foreground',
  info: 'text-foreground',
  warn: 'text-yellow-600',
  error: 'text-destructive',
}

const formatTs = (ts: number): string => {
  const d = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

export const LogThreadPanel = () => {
  const scriptApi = useConveyor('script')
  const threads = useScriptRunStore((s) => s.threads)
  const logs = useScriptRunStore((s) => s.logs)
  const selectedThreadId = useScriptRunStore((s) => s.selectedThreadId)
  const setSelection = useScriptRunStore((s) => s.setSelection)

  // 订阅主进程 script-event 流
  useEffect(() => {
    const unsubscribe = scriptApi.onEvent((event) => {
      useScriptRunStore.getState().ingest(event)
    })
    return unsubscribe
  }, [scriptApi])

  const threadList = useMemo(() => Array.from(threads.values()).sort((a, b) => a.threadId.localeCompare(b.threadId)), [threads])

  const selectedLogs = useMemo(() => (selectedThreadId ? logs.get(selectedThreadId) ?? [] : []), [logs, selectedThreadId])

  const description = threadList.length === 0 ? '尚未启动任何发布任务' : `共 ${threadList.length} 个线程`

  return (
    <PanelShell title="日志线程" description={description}>
      <div className="flex h-full flex-col gap-4 overflow-hidden">
        <div className="max-h-1/2 overflow-hidden rounded-md border border-border">
          <ScrollArea className="h-full max-h-[320px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-20">序号</TableHead>
                  <TableHead>窗口</TableHead>
                  <TableHead className="w-24">状态</TableHead>
                  <TableHead className="w-40">进度</TableHead>
                  <TableHead>当前步骤</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {threadList.map((thread, idx) => {
                  const isSel = thread.threadId === selectedThreadId
                  return (
                    <TableRow
                      key={thread.threadId}
                      data-state={isSel ? 'selected' : undefined}
                      onClick={() => setSelection(thread.threadId)}
                      className="cursor-pointer"
                    >
                      <TableCell className="text-muted-foreground">{idx + 1}</TableCell>
                      <TableCell className="font-medium">{thread.profileName}</TableCell>
                      <TableCell>
                        <Badge variant={STATUS_VARIANT[thread.status]}>{STATUS_LABEL[thread.status]}</Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {thread.total > 0 ? `${thread.current}/${thread.total}` : '-'}
                      </TableCell>
                      <TableCell className="truncate text-xs">{thread.step || '-'}</TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </ScrollArea>
        </div>

        <div className="flex-1 overflow-hidden rounded-md border border-border">
          <ScrollArea className="h-full">
            {selectedLogs.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
                <Inbox className="size-6" />
                <span>{selectedThreadId ? '该线程暂无日志' : '请在上方表格中选择一个线程查看详情'}</span>
              </div>
            ) : (
              <div className="space-y-1 p-3 font-mono text-xs">
                {selectedLogs.map((log, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <span className="shrink-0 text-muted-foreground">{formatTs(log.ts)}</span>
                    <span className={cn('shrink-0 w-12 uppercase', LEVEL_COLOR[log.level])}>{log.level}</span>
                    <span className="whitespace-pre-wrap break-all">{log.message}</span>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </div>
      </div>
    </PanelShell>
  )
}
