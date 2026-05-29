'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useProject } from '@/hooks/use-project'
import { SectionPanel } from '@/components/ui/section-panel'
import { StatusPill } from '@/components/ui/status-pill'
import { BookOpen, Megaphone, Users, DollarSign, ArrowRight, Rocket } from 'lucide-react'
import { LOCAL_DEV_PROJECT_ID } from '@/lib/local-dev-auth'

interface ProjectSummary {
  id: string
  name: string
  slug: string
  vertical: string | null
  brand_book_ready: boolean
  intel_ready: boolean
  ads_mtd: number
  leads_7d: number
  spend_mtd: number
  budget: number | null
  latest_campaign: { id: string; name: string; status: string; created_at: string } | null
}

export function AllProjectsGrid() {
  const supabase = createClient()
  const { projects, setActiveProjectId } = useProject()
  const [summaries, setSummaries] = useState<ProjectSummary[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (projects.length === 0) { setLoading(false); setSummaries([]); return }
    if (projects.some((project) => project.id === LOCAL_DEV_PROJECT_ID)) {
      setSummaries(projects.map((project) => ({
        id: project.id,
        name: project.name,
        slug: project.slug,
        vertical: 'local_workspace',
        brand_book_ready: true,
        intel_ready: false,
        ads_mtd: 0,
        leads_7d: 0,
        spend_mtd: 0,
        budget: null,
        latest_campaign: null,
      })))
      setLoading(false)
      return
    }
    ;(async () => {
      setLoading(true)
      const ids = projects.map((p) => p.id)
      const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0)
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

      const [adsRes, leadsRes, costsRes, campRes, projRes] = await Promise.all([
        supabase.from('ad_copies').select('brief_id, ad_briefs!inner(project_id, created_at)').gte('ad_briefs.created_at', monthStart.toISOString()).in('ad_briefs.project_id', ids),
        supabase.from('leads').select('project_id, created_at').in('project_id', ids).gte('created_at', sevenDaysAgo.toISOString()),
        supabase.from('ai_cost_ledger').select('project_id, cost_usd').in('project_id', ids).gte('created_at', monthStart.toISOString()),
        supabase.from('campaigns').select('id, name, status, project_id, created_at').in('project_id', ids).order('created_at', { ascending: false }).limit(200),
        supabase.from('projects').select('id, brand_voice, monthly_ai_budget_usd').in('id', ids),
      ])

      const adsByProject: Record<string, number> = {}
      for (const row of (adsRes.data as Array<{ ad_briefs: { project_id: string } }> | null) ?? []) {
        const pid = row.ad_briefs.project_id
        adsByProject[pid] = (adsByProject[pid] ?? 0) + 1
      }

      const leadsByProject: Record<string, number> = {}
      for (const row of (leadsRes.data as Array<{ project_id: string }> | null) ?? []) {
        leadsByProject[row.project_id] = (leadsByProject[row.project_id] ?? 0) + 1
      }

      const spendByProject: Record<string, number> = {}
      for (const row of (costsRes.data as Array<{ project_id: string; cost_usd: number | null }> | null) ?? []) {
        spendByProject[row.project_id] = (spendByProject[row.project_id] ?? 0) + (row.cost_usd ?? 0)
      }

      const latestCampaignByProject: Record<string, { id: string; name: string; status: string; created_at: string }> = {}
      for (const row of (campRes.data as Array<{ id: string; name: string; status: string; project_id: string; created_at: string }> | null) ?? []) {
        if (!latestCampaignByProject[row.project_id]) {
          latestCampaignByProject[row.project_id] = { id: row.id, name: row.name, status: row.status, created_at: row.created_at }
        }
      }

      const projData = (projRes.data as Array<{ id: string; brand_voice: Record<string, unknown> | null; monthly_ai_budget_usd: number | null }> | null) ?? []
      const bvById = new Map(projData.map((p) => [p.id, p.brand_voice ?? {}] as const))
      const budgetById = new Map(projData.map((p) => [p.id, p.monthly_ai_budget_usd ?? null] as const))

      const mapped: ProjectSummary[] = projects.map((p) => {
        const bv = (bvById.get(p.id) ?? {}) as Record<string, unknown>
        const classification = bv.classification as { vertical?: string } | undefined
        return {
          id: p.id,
          name: p.name,
          slug: p.slug,
          vertical: classification?.vertical ?? null,
          brand_book_ready: !!bv.guidelines,
          intel_ready: !!bv.competitive_intel,
          ads_mtd: adsByProject[p.id] ?? 0,
          leads_7d: leadsByProject[p.id] ?? 0,
          spend_mtd: +(spendByProject[p.id] ?? 0).toFixed(2),
          budget: budgetById.get(p.id) ?? null,
          latest_campaign: latestCampaignByProject[p.id] ?? null,
        }
      })

      setSummaries(mapped)
      setLoading(false)
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projects.map((p) => p.id).join(',')])

  if (projects.length === 0) return null

  return (
    <SectionPanel
      title={`All Products (${projects.length})`}
      action={<Link href="/projects" className="text-[10px] font-semibold uppercase tracking-wider text-emerald-400 hover:text-emerald-300">Manage →</Link>}
    >
      {loading ? (
        <p className="text-xs text-slate-500">Loading product summaries…</p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {summaries.map((s) => {
            const budgetPct = s.budget ? Math.min(100, (s.spend_mtd / s.budget) * 100) : 0
            const overBudget = s.budget ? s.spend_mtd >= s.budget : false
            return (
              <div key={s.id} className="rounded-md border border-slate-800 bg-slate-900/60 p-4">
                <div className="mb-3 flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <h3 className="truncate text-sm font-semibold text-slate-100">{s.name}</h3>
                      {s.vertical && <StatusPill tone="accent">{s.vertical.replace(/_/g, ' ')}</StatusPill>}
                    </div>
                    <div className="flex flex-wrap gap-1">
                      <StatusPill tone={s.brand_book_ready ? 'success' : 'neutral'}>
                        <BookOpen className="h-3 w-3" />
                        {s.brand_book_ready ? 'Brand Book' : 'No Brand Book'}
                      </StatusPill>
                      <StatusPill tone={s.intel_ready ? 'success' : 'neutral'}>
                        {s.intel_ready ? 'Intel ready' : 'No Intel'}
                      </StatusPill>
                    </div>
                  </div>
                  <button
                    onClick={() => setActiveProjectId(s.id)}
                    className="inline-flex shrink-0 items-center gap-1 rounded-md border border-slate-700 bg-slate-800 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-300 hover:bg-slate-700"
                  >
                    Switch <ArrowRight className="h-3 w-3" />
                  </button>
                </div>

                <div className="grid grid-cols-3 gap-2 mb-3">
                  <MiniStat icon={<Megaphone className="h-3 w-3" />} label="Ads MTD" value={s.ads_mtd} />
                  <MiniStat icon={<Users className="h-3 w-3" />} label="Leads 7d" value={s.leads_7d} />
                  <MiniStat icon={<DollarSign className="h-3 w-3" />} label="AI MTD" value={`$${s.spend_mtd.toFixed(2)}`} tone={overBudget ? 'error' : undefined} />
                </div>

                {s.budget != null && (
                  <div className="mb-3">
                    <div className="flex items-center justify-between text-[9px] font-mono-data mb-0.5">
                      <span className="text-slate-500">Monthly cap</span>
                      <span className={overBudget ? 'text-rose-400' : budgetPct >= 80 ? 'text-amber-400' : 'text-slate-500'}>
                        ${s.spend_mtd.toFixed(2)} / ${s.budget.toFixed(2)}
                      </span>
                    </div>
                    <div className="h-1 rounded-full bg-slate-800 overflow-hidden">
                      <div
                        className={overBudget ? 'h-full bg-rose-500' : budgetPct >= 80 ? 'h-full bg-amber-500' : 'h-full bg-emerald-500'}
                        style={{ width: `${budgetPct}%` }}
                      />
                    </div>
                  </div>
                )}

                {s.latest_campaign ? (
                  <Link
                    href={`/campaigns/${s.latest_campaign.id}`}
                    className="flex items-center gap-2 rounded-md border border-slate-800 bg-slate-800/40 px-2 py-1.5 text-xs hover:border-emerald-500/30"
                    onClick={() => setActiveProjectId(s.id)}
                  >
                    <Rocket className="h-3 w-3 text-emerald-400 shrink-0" />
                    <span className="truncate text-slate-200 flex-1">{s.latest_campaign.name}</span>
                    <StatusPill tone="neutral">{s.latest_campaign.status}</StatusPill>
                  </Link>
                ) : (
                  <Link
                    href="/launch"
                    onClick={() => setActiveProjectId(s.id)}
                    className="block rounded-md border border-dashed border-slate-700 px-2 py-1.5 text-center text-[10px] font-semibold uppercase tracking-wider text-slate-500 hover:border-emerald-500/40 hover:text-emerald-300"
                  >
                    Launch first campaign →
                  </Link>
                )}
              </div>
            )
          })}
        </div>
      )}
    </SectionPanel>
  )
}

function MiniStat({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: string | number; tone?: 'error' }) {
  return (
    <div className="rounded-md bg-slate-900/70 border border-slate-800 p-2">
      <div className="flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wider text-slate-500">
        {icon}{label}
      </div>
      <div className={`mt-0.5 font-mono-data text-sm font-semibold ${tone === 'error' ? 'text-rose-300' : 'text-slate-100'}`}>{value}</div>
    </div>
  )
}
