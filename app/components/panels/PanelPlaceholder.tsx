interface PanelPlaceholderProps {
  title: string
}

/**
 * 右侧内容面板的空白占位。
 * 骨架阶段所有面板复用此组件，后续按业务逐个替换实现。
 */
export const PanelPlaceholder = ({ title }: PanelPlaceholderProps) => {
  return (
    <section className="flex h-full flex-col">
      <header className="flex h-12 shrink-0 items-center border-b border-border px-6 text-sm font-medium">
        {title}
      </header>
      <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">内容待开发</div>
    </section>
  )
}
