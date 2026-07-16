import type { ReactNode } from 'react'
import { Label } from '@/app/components/ui/label'
import { cn } from '@/lib/utils'

interface PanelShellProps {
  title: string
  description?: string
  actions?: ReactNode
  children: ReactNode
}

/**
 * 内容面板通用外壳：固定顶部标题栏 + 可滚动内容区。
 */
export const PanelShell = ({ title, description, actions, children }: PanelShellProps) => {
  return (
    <section className="flex h-full flex-col">
      <header className="flex shrink-0 items-center justify-between gap-4 border-b border-border px-6 py-3">
        <div className="flex flex-col gap-0.5">
          <span className="text-sm font-medium">{title}</span>
          {description ? <span className="text-xs text-muted-foreground">{description}</span> : null}
        </div>
        {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
      </header>
      <div className="flex-1 overflow-y-auto p-6">{children}</div>
    </section>
  )
}

interface FormSectionProps {
  title: string
  description?: string
  children: ReactNode
}

/**
 * 表单分组：标题 + 两列自适应字段网格。
 */
export const FormSection = ({ title, description, children }: FormSectionProps) => {
  return (
    <section className="space-y-4">
      <div className="space-y-1">
        <h3 className="text-sm font-medium">{title}</h3>
        {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
      </div>
      <div className="grid max-w-3xl gap-x-6 gap-y-4 sm:grid-cols-2">{children}</div>
    </section>
  )
}

interface FieldProps {
  label: string
  htmlFor?: string
  hint?: string
  className?: string
  children: ReactNode
}

/**
 * 单个表单字段：标签 + 控件 + 可选提示。
 */
export const Field = ({ label, htmlFor, hint, className, children }: FieldProps) => {
  return (
    <div className={cn('grid content-start gap-2', className)}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  )
}
