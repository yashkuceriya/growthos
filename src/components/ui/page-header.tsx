import { cn } from '@/lib/utils'

export function PageHeader({
  title,
  subtitle,
  breadcrumb,
  actions,
  className,
}: {
  title: string
  subtitle?: React.ReactNode
  breadcrumb?: React.ReactNode
  actions?: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex flex-col gap-2 pb-6', className)}>
      {breadcrumb && (
        <div className="text-[10px] font-mono-data uppercase tracking-wider text-slate-500">
          {breadcrumb}
        </div>
      )}
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold text-slate-100 tracking-tight">{title}</h1>
          {subtitle && <div className="text-sm text-slate-400">{subtitle}</div>}
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
    </div>
  )
}
