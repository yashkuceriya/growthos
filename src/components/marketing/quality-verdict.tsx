'use client'

import { AlertTriangle, CheckCircle2, Gauge } from 'lucide-react'
import { StatusPill, type StatusTone } from '@/components/ui/status-pill'
import type { GeneratedQualityScore } from '@/lib/marketing/quality'
import { cn } from '@/lib/utils'

const DIMENSIONS: Array<keyof GeneratedQualityScore['dimensions']> = [
  'clarity',
  'audienceFit',
  'channelFit',
  'specificity',
  'conversionIntent',
  'personaFit',
]

export function QualityVerdict({ quality }: { quality?: GeneratedQualityScore | null }) {
  if (!quality) return null

  const tone = toneForScore(quality.overall)
  const Icon = quality.overall >= 7.8 ? CheckCircle2 : AlertTriangle

  return (
    <div className="rounded-md border border-slate-700 bg-slate-950/45 p-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Gauge className="h-4 w-4 text-emerald-300" />
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-200">Quality score</div>
            <div className="text-[11px] text-slate-500">Brand fit, channel fit, and conversion strength</div>
          </div>
        </div>
        <StatusPill tone={tone}>
          <Icon className="h-3 w-3" />
          {quality.overall}/10
        </StatusPill>
      </div>

      <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-slate-800">
        <div className={cn('h-full', barClass(tone))} style={{ width: `${Math.min(100, quality.overall * 10)}%` }} />
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {DIMENSIONS.map((key) => {
          const dimension = quality.dimensions[key]
          if (!dimension) return null
          return (
            <div key={key} className="min-w-0 rounded border border-slate-800 bg-slate-900/60 px-2 py-1.5">
              <div className="truncate text-[10px] font-semibold uppercase tracking-wider text-slate-500">{label(key)}</div>
              <div className={cn('text-sm font-semibold', scoreTextClass(dimension.score))}>{dimension.score}/10</div>
            </div>
          )
        })}
      </div>

      {quality.recommendations.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {quality.recommendations.map((item) => (
            <li key={item} className="flex gap-2 text-xs leading-5 text-slate-300">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-300" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function toneForScore(score: number): StatusTone {
  if (score >= 8) return 'success'
  if (score >= 7) return 'warn'
  return 'error'
}

function barClass(tone: StatusTone): string {
  if (tone === 'success') return 'bg-emerald-400'
  if (tone === 'warn') return 'bg-amber-400'
  return 'bg-rose-400'
}

function scoreTextClass(score: number): string {
  if (score >= 8) return 'text-emerald-300'
  if (score >= 7) return 'text-amber-300'
  return 'text-rose-300'
}

function label(value: string): string {
  return value.replace(/[A-Z]/g, (match) => ` ${match.toLowerCase()}`).replace(/^./, (match) => match.toUpperCase())
}
