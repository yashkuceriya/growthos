'use client'

import { CREATIVE_MODES } from '@/lib/ai/creative/modes'
import { cn } from '@/lib/utils'

interface Props {
  value: string | null
  onChange: (id: string | null) => void
  className?: string
  /** When true, allow clicking the active chip again to deselect (no mode). */
  allowClear?: boolean
}

export function CreativeModePicker({ value, onChange, className, allowClear = true }: Props) {
  return (
    <div>
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
        Creative Mode
      </div>
      <div className={cn('flex flex-wrap gap-1.5', className)}>
        {CREATIVE_MODES.map((mode) => {
          const active = value === mode.id
          return (
            <button
              key={mode.id}
              type="button"
              onClick={() => onChange(active && allowClear ? null : mode.id)}
              title={mode.description}
              className={cn(
                'flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-semibold transition-colors',
                active
                  ? 'border-emerald-500/60 bg-emerald-500/15 text-emerald-200'
                  : 'border-slate-700 bg-slate-800/40 text-slate-300 hover:bg-slate-800',
              )}
            >
              <span aria-hidden>{mode.emoji}</span>
              <span>{mode.label}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
