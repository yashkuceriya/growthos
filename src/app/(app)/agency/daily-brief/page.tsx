'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useProject } from '@/hooks/use-project'
import { PageShell } from '@/components/ui/page-shell'
import { PageHeader } from '@/components/ui/page-header'
import { SectionPanel } from '@/components/ui/section-panel'
import { StatusPill } from '@/components/ui/status-pill'
import { Rocket, FileText, Mail, Users, Megaphone, ExternalLink, ArrowRight } from 'lucide-react'

interface ProductRow {
  id: string
  name: string
  slug: string
  website: string | null
  vertical: string | null
  stage: string | null
  brand_book_ready: boolean
  intel_ready: boolean
  sprint: { theme: string; north_star: string; deliverables_count: number; week_start: string } | null
  drafts: { ads: number; emails: number; social: number; blog: number; leads: number; landing: number }
  last_launch: string | null
}

export default function DailyBriefPage() {
  const supabase = createClient()
  const { projects, setActiveProjectId } = useProject()
  const [rows, setRows] = useState<ProductRow[]>([])
  const [loading, setLoading] = useState(true)

  async function load() {
    if (projects.length === 0) { setLoading(false); return }
    setLoading(true)
    const ids = projects.map((p) => p.id)
    const [adsRes, emailsRes, socialRes, contentRes, leadsRes, landingRes] = await Promise.all([
      supabase.from('ad_copies').select('id, brief_id, ad_briefs!inner(project_id)').in('ad_briefs.project_id', ids),
      supabase.from('email_templates').select('id, project_id').in('project_id', ids),
      supabase.from('social_posts').select('id, project_id').in('project_id', ids),
      supabase.from('content_pieces').select('id, project_id').in('project_id', ids),
      supabase.from('leads').select('id, project_id').in('project_id', ids),
      supabase.from('landing_pages').select('id, project_id').in('project_id', ids),
    ])

    const count = (arr: { project_id?: string; ad_briefs?: { project_id: string } }[] | null, pid: string) =>
      (arr ?? []).filter((r) => r.project_id === pid || r.ad_briefs?.project_id === pid).length

    const mapped: ProductRow[] = projects.map((p) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const bv = (p as any).brand_voice as Record<string, unknown> | undefined
      const classification = bv?.classification as { vertical?: string; stage?: string } | undefined
      const sprintData = bv?.current_sprint as Record<string, unknown> | undefined
      return {
        id: p.id,
        name: p.name,
        slug: p.slug,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        website: (p as any).website ?? null,
        vertical: classification?.vertical ?? null,
        stage: classification?.stage ?? null,
        brand_book_ready: !!bv?.guidelines,
        intel_ready: !!bv?.competitive_intel,
        sprint: sprintData
          ? {
              theme: (sprintData.sprint_theme as string) ?? '—',
              north_star: (sprintData.north_star as string) ?? '—',
              deliverables_count: Array.isArray(sprintData.deliverables) ? (sprintData.deliverables as unknown[]).length : 0,
              week_start: (sprintData.week_start as string) ?? '',
            }
          : null,
        drafts: {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ads: count(adsRes.data as any, p.id),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          emails: count(emailsRes.data as any, p.id),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          social: count(socialRes.data as any, p.id),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          blog: count(contentRes.data as any, p.id),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          leads: count(leadsRes.data as any, p.id),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          landing: count(landingRes.data as any, p.id),
        },
        last_launch: null,
      }
    })
    setRows(mapped)
    setLoading(false)
  }

  useEffect(() => { load() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [projects.length])

  const today = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })

  return (
    <PageShell>
      <PageHeader
        title="Daily Brief"
        subtitle={`${today} · Everything across all your products, one screen.`}
      />

      {projects.length === 0 ? (
        <SectionPanel>
          <p className="text-sm text-slate-400">No projects yet. <Link href="/projects" className="text-emerald-400 underline">Create one</Link>.</p>
        </SectionPanel>
      ) : loading ? (
        <SectionPanel><p className="text-sm text-slate-500">Loading…</p></SectionPanel>
      ) : (
        <div className="space-y-3">
          {rows.map((r) => {
            const totalDrafts = r.drafts.ads + r.drafts.emails + r.drafts.social + r.drafts.blog + r.drafts.landing
            return (
              <div key={r.id} className="rounded-md border border-slate-800 bg-slate-900/60 p-4">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <h3 className="text-base font-semibold text-slate-100">{r.name}</h3>
                      {r.vertical && <StatusPill tone="accent">{r.vertical.replace(/_/g, ' ')}</StatusPill>}
                      {r.stage && <StatusPill tone="info">{r.stage.replace(/_/g, ' ')}</StatusPill>}
                      {r.website && (
                        <a href={r.website} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[11px] font-mono-data text-emerald-400 hover:text-emerald-300">
                          <ExternalLink className="h-3 w-3" />{r.website.replace(/^https?:\/\//, '')}
                        </a>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap text-[10px]">
                      <StatusPill tone={r.brand_book_ready ? 'success' : 'neutral'}>{r.brand_book_ready ? '✓ Brand Book' : 'No Brand Book'}</StatusPill>
                      <StatusPill tone={r.intel_ready ? 'success' : 'neutral'}>{r.intel_ready ? '✓ Competitive Intel' : 'No Intel'}</StatusPill>
                      <StatusPill tone={r.sprint ? 'success' : 'neutral'}>{r.sprint ? '✓ Sprint Set' : 'No Sprint'}</StatusPill>
                    </div>
                  </div>
                  <button onClick={() => setActiveProjectId(r.id)} className="inline-flex items-center gap-1 rounded-md bg-emerald-500 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-950 hover:bg-emerald-400">
                    Switch To <ArrowRight className="h-3 w-3" />
                  </button>
                </div>

                {r.sprint && (
                  <div className="mb-3 rounded-md border border-emerald-500/20 bg-emerald-500/5 p-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-400">This Week</span>
                      <span className="font-mono-data text-[10px] text-slate-500">week of {r.sprint.week_start}</span>
                    </div>
                    <p className="text-sm text-slate-100 font-semibold">{r.sprint.theme}</p>
                    <div className="mt-1 flex items-center gap-3 text-[11px] text-slate-400">
                      <span>North star: <span className="text-emerald-300 font-mono-data">{r.sprint.north_star}</span></span>
                      <span>·</span>
                      <span>{r.sprint.deliverables_count} deliverables queued</span>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-6 gap-2 mb-3">
                  <DraftTile label="Ads" value={r.drafts.ads} href="/ad-studio" icon={Megaphone} />
                  <DraftTile label="Emails" value={r.drafts.emails} href="/email" icon={Mail} />
                  <DraftTile label="Social" value={r.drafts.social} href="/social" icon={Users} />
                  <DraftTile label="Blog" value={r.drafts.blog} href="/content" icon={FileText} />
                  <DraftTile label="Leads" value={r.drafts.leads} href="/leads" icon={Users} />
                  <DraftTile label="Landing" value={r.drafts.landing} href="/leads/pages" icon={Rocket} />
                </div>

                <div className="flex flex-wrap gap-1.5">
                  <QuickAction onClick={() => setActiveProjectId(r.id)} href="/launch" label="Launch Campaign" />
                  <QuickAction onClick={() => setActiveProjectId(r.id)} href="/agency/optimize" label="Run Optimization" />
                  <QuickAction onClick={() => setActiveProjectId(r.id)} href="/agency/seo-audit" label="SEO Audit" />
                  <QuickAction onClick={() => setActiveProjectId(r.id)} href="/agency/launch-kit" label="Launch Kit" />
                  {totalDrafts > 0 && <span className="ml-auto text-[10px] font-mono-data text-slate-500">{totalDrafts} total drafts</span>}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </PageShell>
  )
}

function DraftTile({ label, value, href, icon: Icon }: { label: string; value: number; href: string; icon: typeof Rocket }) {
  return (
    <Link href={href} className="group rounded-md border border-slate-800 bg-slate-800/40 p-2 hover:border-emerald-500/30 hover:bg-slate-800/60">
      <div className="flex items-center justify-between">
        <Icon className="h-3 w-3 text-slate-500 group-hover:text-emerald-400" />
        <span className="font-mono-data text-base font-semibold text-slate-100">{value}</span>
      </div>
      <div className="mt-1 text-[9px] font-semibold uppercase tracking-wider text-slate-500">{label}</div>
    </Link>
  )
}

function QuickAction({ onClick, href, label }: { onClick: () => void; href: string; label: string }) {
  return (
    <Link href={href} onClick={onClick} className="rounded-md border border-slate-700 bg-slate-800 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-300 hover:bg-slate-800/60 hover:border-emerald-500/40">
      {label}
    </Link>
  )
}
