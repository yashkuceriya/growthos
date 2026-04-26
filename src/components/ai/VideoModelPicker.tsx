'use client'

import { VIDEO_MODELS } from '@/lib/video/models'
import { cn } from '@/lib/utils'

interface Props {
  value: string
  onChange: (id: string) => void
  className?: string
}

export function VideoModelPicker({ value, onChange, className }: Props) {
  return (
    <div>
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
        Video Model
      </div>
      <div className={cn('grid grid-cols-2 gap-1.5', className)}>
        {VIDEO_MODELS.map((m) => {
          const active = value === m.id
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => onChange(m.id)}
              className={cn(
                'flex flex-col rounded-md border px-3 py-2 text-left transition-colors',
                active
                  ? 'border-emerald-500/60 bg-emerald-500/10'
                  : 'border-slate-700 bg-slate-800/40 hover:bg-slate-800',
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className={cn('text-xs font-semibold', active ? 'text-emerald-200' : 'text-slate-100')}>
                  {m.label}
                </span>
                <span className="font-mono-data text-[10px] text-slate-500">
                  ~${m.cost_usd_per_clip.toFixed(2)}
                </span>
              </div>
              <span className="mt-0.5 text-[10px] text-slate-400">{m.description}</span>
              <span className="mt-1 font-mono-data text-[9px] uppercase tracking-wider text-slate-500">
                {m.provider} · max {m.max_seconds}s
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
