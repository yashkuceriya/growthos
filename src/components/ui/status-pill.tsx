import { cn } from '@/lib/utils'

export type StatusTone = 'success' | 'warn' | 'error' | 'neutral' | 'info' | 'accent'

const toneClass: Record<StatusTone, string> = {
  success: 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/30',
  warn: 'bg-amber-500/15 text-amber-300 ring-amber-500/30',
  error: 'bg-rose-500/15 text-rose-300 ring-rose-500/30',
  neutral: 'bg-slate-700/50 text-slate-300 ring-slate-600/50',
  info: 'bg-cyan-500/15 text-cyan-300 ring-cyan-500/30',
  accent: 'bg-emerald-500 text-slate-950 ring-emerald-400',
}

// Map common status strings to tone. Extend as needed.
export function toneForStatus(status?: string | null): StatusTone {
  if (!status) return 'neutral'
  const s = status.toLowerCase()
  if (['active', 'approved', 'published', 'delivered', 'converted', 'qualified', 'passed', 'success', 'sent', 'completed'].includes(s)) return 'success'
  if (['pending', 'nurturing', 'contacted', 'scheduled', 'draft', 'paused', 'processing', 'warning'].includes(s)) return 'warn'
  if (['lost', 'failed', 'bounced', 'error', 'rejected'].includes(s)) return 'error'
  if (['new', 'ai', 'ai_enhanced'].includes(s)) return 'info'
  return 'neutral'
}

export function StatusPill({
  children,
  tone,
  status,
  className,
}: {
  children: React.ReactNode
  tone?: StatusTone
  status?: string
  className?: string
}) {
  const resolved = tone ?? toneForStatus(status)
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ring-1 ring-inset',
        toneClass[resolved],
        className
      )}
    >
      {children}
    </span>
  )
}
