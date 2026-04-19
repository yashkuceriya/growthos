import { cn } from '@/lib/utils'

export function SectionPanel({
  title,
  action,
  children,
  className,
  contentClassName,
}: {
  title?: React.ReactNode
  action?: React.ReactNode
  children: React.ReactNode
  className?: string
  contentClassName?: string
}) {
  return (
    <section
      className={cn(
        'rounded-md border border-slate-800 bg-slate-900/60 overflow-hidden',
        className
      )}
    >
      {(title || action) && (
        <header className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
          {title && (
            <h2 className="text-[11px] font-semibold uppercase tracking-wider text-slate-300">
              {title}
            </h2>
          )}
          {action && <div className="flex items-center gap-2">{action}</div>}
        </header>
      )}
      <div className={cn('p-4', contentClassName)}>{children}</div>
    </section>
  )
}
