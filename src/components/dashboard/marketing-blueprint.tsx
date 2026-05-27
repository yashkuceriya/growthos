'use client'

import Link from 'next/link'
import { ArrowRight, CheckCircle2, CircleDashed, Target, TrendingUp } from 'lucide-react'
import { SectionPanel } from '@/components/ui/section-panel'
import { StatusPill } from '@/components/ui/status-pill'
import { buildMarketingBlueprint, type BlueprintProject } from '@/lib/marketing/blueprint'

export function MarketingBlueprintPanel({ project }: { project: BlueprintProject }) {
  const blueprint = buildMarketingBlueprint(project)

  return (
    <SectionPanel
      title="Marketing Blueprint"
      action={
        <Link href="/launch" className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-emerald-400 hover:text-emerald-300">
          Run Launch <ArrowRight className="h-3 w-3" />
        </Link>
      }
    >
      <div className="grid gap-4 lg:grid-cols-12">
        <div className="lg:col-span-4">
          <div className="flex items-center gap-2">
            <StatusPill tone="accent">{humanize(blueprint.vertical)}</StatusPill>
            {blueprint.confidence != null && (
              <span className="font-mono-data text-[10px] text-slate-500">
                {Math.round(blueprint.confidence * 100)}% confidence
              </span>
            )}
          </div>
          <p className="mt-3 text-sm font-medium text-slate-100">
            {blueprint.icp ?? 'Sync the website to classify ICP and choose sharper channels.'}
          </p>
          <div className="mt-3 flex items-center gap-2 text-xs text-slate-400">
            <Target className="h-3.5 w-3.5 text-emerald-400" />
            Goal: <span className="text-slate-200">{humanize(blueprint.primaryGoal ?? 'signups')}</span>
          </div>
          <div className="mt-2 flex items-center gap-2 text-xs text-slate-400">
            <TrendingUp className="h-3.5 w-3.5 text-cyan-400" />
            KPI: <span className="text-slate-200">{blueprint.primaryKpi}</span>
          </div>
        </div>

        <div className="lg:col-span-4">
          <h3 className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Best channels</h3>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {blueprint.primaryChannels.map((ch) => (
              <StatusPill key={ch} tone="success">{humanize(ch)}</StatusPill>
            ))}
          </div>
          <h3 className="mt-4 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Content mix</h3>
          <div className="mt-2 space-y-2">
            {blueprint.contentMix.map((item) => (
              <div key={item.label}>
                <div className="mb-1 flex justify-between text-[10px] text-slate-400">
                  <span>{item.label}</span>
                  <span>{item.pct}%</span>
                </div>
                <div className="h-1.5 rounded-full bg-slate-800">
                  <div className="h-full rounded-full bg-emerald-400" style={{ width: `${item.pct}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="lg:col-span-4">
          <h3 className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Next moves</h3>
          <ul className="mt-2 space-y-2">
            {blueprint.launchTactics.slice(0, 3).map((tactic) => (
              <li key={tactic} className="rounded-md border border-slate-800 bg-slate-950/40 px-3 py-2 text-xs text-slate-300">
                {tactic}
              </li>
            ))}
          </ul>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {blueprint.readiness.map((item) => (
              <div key={item.label} className="flex items-center gap-1.5 text-[10px] text-slate-400" title={item.hint}>
                {item.ready ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" /> : <CircleDashed className="h-3.5 w-3.5 text-slate-600" />}
                <span className={item.ready ? 'text-slate-300' : ''}>{item.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </SectionPanel>
  )
}

function humanize(value: string): string {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}
