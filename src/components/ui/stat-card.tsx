import { cn } from '@/lib/utils'
import { ArrowUpRight, ArrowDownRight } from 'lucide-react'

type Trend = 'up' | 'down' | 'flat'

export function StatCard({
  label,
  value,
  delta,
  trend,
  sparkline,
  className,
  hint,
}: {
  label: string
  value: string | number
  delta?: string
  trend?: Trend
  sparkline?: React.ReactNode
  hint?: string
  className?: string
}) {
  const trendColor =
    trend === 'up' ? 'text-emerald-400' : trend === 'down' ? 'text-rose-400' : 'text-slate-400'

  return (
    <div
      className={cn(
        'rounded-md border border-slate-800 bg-slate-900/60 p-4 flex flex-col gap-2',
        className
      )}
    >
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
          {label}
        </span>
        {hint && (
          <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            {hint}
          </span>
        )}
      </div>
      <div className="flex items-end justify-between gap-3">
        <span className="font-mono-data text-2xl font-semibold text-slate-100 leading-none">
          {value}
        </span>
        {sparkline && <div className="h-8 w-20 shrink-0">{sparkline}</div>}
      </div>
      {delta && (
        <div className={cn('flex items-center gap-1 text-xs font-mono-data', trendColor)}>
          {trend === 'up' && <ArrowUpRight className="h-3 w-3" />}
          {trend === 'down' && <ArrowDownRight className="h-3 w-3" />}
          <span>{delta}</span>
        </div>
      )}
    </div>
  )
}
