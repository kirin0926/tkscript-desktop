import { Moon, Play, Square, Sun } from 'lucide-react'
import { useTheme } from 'next-themes'
import { toast } from 'sonner'
import { useConveyor } from '@/app/hooks/use-conveyor'
import { useSettings } from '@/app/components/settings/SettingsContext'
import { useScriptRunStore } from '@/app/stores/script-run-store'
import { Button } from '@/app/components/ui/button'
import { cn } from '@/lib/utils'
import { navItems, type PanelKey } from './nav-items'

interface SidebarProps {
  activeKey: PanelKey
  onSelect: (key: PanelKey) => void
}

export const Sidebar = ({ activeKey, onSelect }: SidebarProps) => {
  const scriptApi = useConveyor('script')
  const { settings } = useSettings()
  const running = useScriptRunStore((s) => s.running)
  const { theme, setTheme } = useTheme()

  const toggleTheme = () => setTheme(theme === 'dark' ? 'light' : 'dark')

  const handleStart = () => {
    scriptApi
      .start(settings)
      .then(() => {
        toast.success('已开始发布任务')
      })
      .catch((err) => {
        console.error('启动发布失败:', err)
        toast.error('启动发布失败', { description: err instanceof Error ? err.message : String(err) })
      })
    onSelect('logs')
  }

  const handleStop = () => {
    const runId = useScriptRunStore.getState().runId
    if (runId) {
      scriptApi
        .stop(runId)
        .then(() => toast.message('已请求停止'))
        .catch((err) => {
          console.error('停止发布失败:', err)
          toast.error('停止发布失败', { description: err instanceof Error ? err.message : String(err) })
        })
    }
  }

  return (
    <aside className="flex h-full w-56 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
      <div className="flex h-12 shrink-0 items-center px-4 text-sm font-semibold">TKscript</div>
      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-2">
        {navItems.map((item) => {
          const Icon = item.icon
          const active = item.key === activeKey
          return (
            <button
              key={item.key}
              type="button"
              aria-current={active ? 'page' : undefined}
              onClick={() => onSelect(item.key)}
              className={cn(
                'flex items-center gap-3 rounded-md px-3 py-2 text-left text-sm transition-colors',
                'hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring',
                active ? 'bg-sidebar-accent font-medium text-sidebar-accent-foreground' : 'text-sidebar-foreground/80'
              )}
            >
              <Icon className="size-4 shrink-0" aria-hidden="true" />
              <span className="truncate">{item.label}</span>
            </button>
          )
        })}
      </nav>
      <div className="shrink-0 space-y-2 border-t border-sidebar-border p-3">
        <button
          type="button"
          onClick={toggleTheme}
          className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-xs text-sidebar-foreground/60 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          aria-label="切换主题"
        >
          {theme === 'dark' ? <Sun className="size-3.5" /> : <Moon className="size-3.5" />}
          <span>{theme === 'dark' ? '亮色模式' : '暗色模式'}</span>
        </button>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span
            className={cn(
              'inline-block size-2 rounded-full',
              running ? 'bg-green-500 animate-pulse' : 'bg-muted-foreground/30'
            )}
          />
          <span>{running ? '发布中' : '空闲'}</span>
        </div>
        <Button
          type="button"
          variant={running ? 'destructive' : 'default'}
          size="sm"
          className="w-full"
          onClick={running ? handleStop : handleStart}
        >
          {running ? <Square /> : <Play />}
          {running ? '停止发布' : '开始发布'}
        </Button>
      </div>
    </aside>
  )
}
