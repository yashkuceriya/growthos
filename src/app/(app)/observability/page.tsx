'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { PageShell } from '@/components/ui/page-shell'
import { PageHeader } from '@/components/ui/page-header'
import { SectionPanel } from '@/components/ui/section-panel'
import { StatusPill } from '@/components/ui/status-pill'
import { AlertTriangle, Ban, DollarSign, MailX, RefreshCw, Rocket } from 'lucide-react'

interface OverBudgetRow {
  project_id: string
  project_name: string
  cap: number
  spent: number
}
interface FailedEnrollmentRow {
  id: string
  sequence_id: string
  subscriber_id: string
  status: string
  metadata: Record<string, unknown> | null
  updated_at: string
  email_sequences: { name: string; project_id: string } | null
  email_subscribers: { email: string } | null
}
interface BouncedSubscriberRow { id: string; email: string; list_id: string; updated_at?: string | null }
interface FailedSendRow { id: string; status: string; metadata: Record<string, unknown> | null; created_at: string; subscriber_id: string | null }
interface FailedCampaignRow { id: string; name: string; status: string; created_at: string; metadata: Record<string, unknown> | null; project_id: string }

export default function ObservabilityPage() {
  const supabase = createClient()
  const [overBudget, setOverBudget] = useState<OverBudgetRow[]>([])
  const [failedEnrollments, setFailedEnrollments] = useState<FailedEnrollmentRow[]>([])
  const [bouncedSubs, setBouncedSubs] = useState<BouncedSubscriberRow[]>([])
  const [failedSends, setFailedSends] = useState<FailedSendRow[]>([])
  const [failedCampaigns, setFailedCampaigns] = useState<FailedCampaignRow[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshedAt, setRefreshedAt] = useState<string>('')

  async function load() {
    setLoading(true)

    // Every user-scoped read goes through RLS so we don't need to filter by user manually.
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

    const [projRes, enrollRes, bounceRes, sendRes, campRes] = await Promise.all([
      // Projects with a cap set — we compute over-cap client-side via the RPC
      supabase.from('projects').select('id, name, monthly_ai_budget_usd').not('monthly_ai_budget_usd', 'is', null),
      // Failed sequence enrollments (any time — shouldn't accumulate much)
      supabase.from('email_sequence_enrollments')
        .select('id, sequence_id, subscriber_id, status, metadata, updated_at, email_sequences(name, project_id), email_subscribers(email)')
        .in('status', ['failed', 'cancelled'])
        .order('updated_at', { ascending: false })
        .limit(25),
      // Bounced subscribers
      supabase.from('email_subscribers').select('id, email, list_id').eq('status', 'bounced').order('created_at', { ascending: false }).limit(25),
      // Failed email sends in the last 7 days
      supabase.from('email_sends').select('id, status, metadata, created_at, subscriber_id').eq('status', 'failed').gte('created_at', sevenDaysAgo).order('created_at', { ascending: false }).limit(25),
      // Campaigns whose metadata has channel errors or whose director review failed
      supabase.from('campaigns').select('id, name, status, created_at, metadata, project_id').gte('created_at', sevenDaysAgo).order('created_at', { ascending: false }).limit(50),
    ])

    // Compute over-cap by calling the RPC for each project (one at a time; typically few capped projects)
    const overCap: OverBudgetRow[] = []
    const capped = (projRes.data ?? []) as Array<{ id: string; name: string; monthly_ai_budget_usd: number }>
    for (const p of capped) {
      const { data: spent } = await supabase.rpc('project_month_ai_spend', { p_project_id: p.id })
      const s = Number(spent ?? 0)
      if (s >= p.monthly_ai_budget_usd) {
        overCap.push({ project_id: p.id, project_name: p.name, cap: Number(p.monthly_ai_budget_usd), spent: s })
      }
    }

    const campaignsWithErrors = ((campRes.data ?? []) as FailedCampaignRow[]).filter((c) => {
      const meta = c.metadata ?? {}
      const review = (meta as Record<string, unknown>).director_review
      return !review // no review means something failed before Step 6
    })

    setOverBudget(overCap)
    setFailedEnrollments((enrollRes.data ?? []) as unknown as FailedEnrollmentRow[])
    setBouncedSubs((bounceRes.data ?? []) as BouncedSubscriberRow[])
    setFailedSends((sendRes.data ?? []) as FailedSendRow[])
    setFailedCampaigns(campaignsWithErrors.slice(0, 25))
    setRefreshedAt(new Date().toISOString())
    setLoading(false)
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const totalIssues =
    overBudget.length +
    failedEnrollments.length +
    bouncedSubs.length +
    failedSends.length +
    failedCampaigns.length

  return (
    <PageShell>
      <PageHeader
        title="Observability"
        subtitle={totalIssues === 0
          ? 'Nothing needs your attention right now.'
          : `${totalIssues} item${totalIssues === 1 ? '' : 's'} need${totalIssues === 1 ? 's' : ''} your attention.`}
        actions={
          <button onClick={load} disabled={loading} className="inline-flex items-center gap-1.5 rounded-md border border-slate-700 bg-slate-800/60 px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-slate-300 hover:bg-slate-800 disabled:opacity-50">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
        }
      />
      {refreshedAt && (
        <p className="mb-4 text-[10px] font-mono-data text-slate-500">Last refreshed: {new Date(refreshedAt).toLocaleTimeString()}</p>
      )}

      {totalIssues === 0 && !loading && (
        <SectionPanel>
          <div className="py-8 text-center">
            <div className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/15">
              <AlertTriangle className="h-5 w-5 text-emerald-400" />
            </div>
            <p className="mt-3 text-sm text-slate-300">All clear.</p>
            <p className="mt-1 text-xs text-slate-500">No over-budget projects, failed enrollments, bounced subscribers, or failed campaigns in the last 7 days.</p>
          </div>
        </SectionPanel>
      )}

      {overBudget.length > 0 && (
        <SectionPanel title={`Over-budget projects (${overBudget.length})`}>
          <ul className="divide-y divide-slate-800">
            {overBudget.map((r) => {
              const overBy = r.spent - r.cap
              return (
                <li key={r.project_id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                  <DollarSign className="h-4 w-4 text-rose-400" />
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-slate-100">{r.project_name}</div>
                    <div className="text-xs text-slate-500 font-mono-data">${r.spent.toFixed(2)} / ${r.cap.toFixed(2)} — ${overBy.toFixed(2)} over cap</div>
                  </div>
                  <Link href="/budget" className="rounded-md border border-slate-700 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-300 hover:border-emerald-500/40">Adjust cap</Link>
                </li>
              )
            })}
          </ul>
        </SectionPanel>
      )}

      {failedCampaigns.length > 0 && (
        <SectionPanel title={`Campaigns missing director review (${failedCampaigns.length})`}>
          <ul className="divide-y divide-slate-800">
            {failedCampaigns.map((c) => (
              <li key={c.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                <Rocket className="h-4 w-4 text-amber-400" />
                <div className="flex-1 min-w-0">
                  <Link href={`/campaigns/${c.id}`} className="font-semibold text-slate-100 hover:text-emerald-300">{c.name}</Link>
                  <div className="text-xs text-slate-500 font-mono-data">{new Date(c.created_at).toLocaleString()} · status {c.status}</div>
                </div>
                <StatusPill tone="warn">No review</StatusPill>
              </li>
            ))}
          </ul>
        </SectionPanel>
      )}

      {failedEnrollments.length > 0 && (
        <SectionPanel title={`Sequence enrollments needing attention (${failedEnrollments.length})`}>
          <ul className="divide-y divide-slate-800">
            {failedEnrollments.map((e) => (
              <li key={e.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                <Ban className="h-4 w-4 text-rose-400" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-slate-100 truncate">{e.email_sequences?.name ?? '—'} → {e.email_subscribers?.email ?? '—'}</div>
                  <div className="text-xs text-slate-500">{(e.metadata as { reason?: string; last_error?: string } | null)?.reason ?? (e.metadata as { last_error?: string } | null)?.last_error ?? 'No detail'}</div>
                </div>
                <StatusPill tone={e.status === 'failed' ? 'error' : 'neutral'}>{e.status}</StatusPill>
              </li>
            ))}
          </ul>
        </SectionPanel>
      )}

      {bouncedSubs.length > 0 && (
        <SectionPanel title={`Bounced subscribers (${bouncedSubs.length})`}>
          <ul className="divide-y divide-slate-800">
            {bouncedSubs.map((b) => (
              <li key={b.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                <MailX className="h-4 w-4 text-rose-400" />
                <div className="flex-1 min-w-0 text-sm text-slate-100 truncate">{b.email}</div>
                <StatusPill tone="error">bounced</StatusPill>
              </li>
            ))}
          </ul>
        </SectionPanel>
      )}

      {failedSends.length > 0 && (
        <SectionPanel title={`Failed email sends last 7d (${failedSends.length})`}>
          <ul className="divide-y divide-slate-800">
            {failedSends.map((s) => (
              <li key={s.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                <MailX className="h-4 w-4 text-amber-400" />
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-slate-500 font-mono-data">{new Date(s.created_at).toLocaleString()}</div>
                  <div className="text-xs text-slate-400 truncate">{(s.metadata as { error?: string } | null)?.error ?? 'No detail'}</div>
                </div>
                <StatusPill tone="error">{s.status}</StatusPill>
              </li>
            ))}
          </ul>
        </SectionPanel>
      )}
    </PageShell>
  )
}
