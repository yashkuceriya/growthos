'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { PageShell } from '@/components/ui/page-shell'
import { PageHeader } from '@/components/ui/page-header'
import { SectionPanel } from '@/components/ui/section-panel'
import { StatusPill } from '@/components/ui/status-pill'
import { JsonView } from '@/components/ui/json-viewer'
import { ChevronLeft, FileText, Mail, MessageSquare, Globe, Target } from 'lucide-react'

interface Campaign {
  id: string
  name: string
  description: string | null
  status: string
  channels: string[]
  metadata: Record<string, unknown> | null
  created_at: string
}

interface AdCopyRow { id: string; headline: string | null; primary_text: string | null; ad_briefs: { platform: string } | null }
interface ContentRow { id: string; title: string; slug: string; word_count: number | null; status: string }
interface LandingRow { id: string; name: string; slug: string; published: boolean; visits: number }
interface LeadRow { id: string; email: string; utm_source: string | null; utm_campaign: string | null; created_at: string; status: string }

export default function CampaignDetailPage() {
  const params = useParams<{ id: string }>()
  const supabase = createClient()
  const [campaign, setCampaign] = useState<Campaign | null>(null)
  const [ads, setAds] = useState<AdCopyRow[]>([])
  const [contents, setContents] = useState<ContentRow[]>([])
  const [landings, setLandings] = useState<LandingRow[]>([])
  const [leads, setLeads] = useState<LeadRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!params.id) return
    ;(async () => {
      setLoading(true)
      const [cRes, aRes, cpRes, lpRes, ldRes] = await Promise.all([
        supabase.from('campaigns').select('*').eq('id', params.id).single(),
        supabase.from('ad_copies').select('id, headline, primary_text, ad_briefs!inner(platform, campaign_id)').eq('ad_briefs.campaign_id', params.id),
        supabase.from('content_pieces').select('id, title, slug, word_count, status').eq('campaign_id', params.id),
        supabase.from('landing_pages').select('id, name, slug, published, visits').eq('campaign_id', params.id),
        supabase.from('leads').select('id, email, utm_source, utm_campaign, created_at, status').eq('campaign_id', params.id).order('created_at', { ascending: false }).limit(50),
      ])
      setCampaign(cRes.data as Campaign | null)
      setAds((aRes.data ?? []) as unknown as AdCopyRow[])
      setContents((cpRes.data ?? []) as ContentRow[])
      setLandings((lpRes.data ?? []) as LandingRow[])
      setLeads((ldRes.data ?? []) as LeadRow[])
      setLoading(false)
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id])

  if (loading) return <PageShell><p className="text-slate-400">Loading…</p></PageShell>
  if (!campaign) return <PageShell><p className="text-slate-400">Campaign not found</p></PageShell>

  const meta = campaign.metadata ?? {}
  const brief = (meta as { brief?: unknown }).brief
  const seoPlan = (meta as { seo_plan?: unknown }).seo_plan
  const analyticsPlan = (meta as { analytics_plan?: unknown }).analytics_plan
  const directorReview = (meta as { director_review?: unknown }).director_review
  const insights = (meta as { insights?: unknown }).insights

  return (
    <PageShell>
      <PageHeader
        title={campaign.name}
        subtitle={campaign.description ?? `Created ${new Date(campaign.created_at).toLocaleDateString()}`}
        actions={
          <Link href="/campaigns" className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-slate-400 hover:text-slate-100">
            <ChevronLeft className="h-3.5 w-3.5" /> Back
          </Link>
        }
      />

      <div className="mb-4 flex items-center gap-2">
        <StatusPill status={campaign.status}>{campaign.status}</StatusPill>
        {campaign.channels.map((ch) => (
          <StatusPill key={ch} tone="neutral">{ch}</StatusPill>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-4 mb-4">
        <StatCard icon={<Target className="h-4 w-4" />} label="Ad copies" value={ads.length} />
        <StatCard icon={<FileText className="h-4 w-4" />} label="Content" value={contents.length} />
        <StatCard icon={<Globe className="h-4 w-4" />} label="Landing pages" value={landings.length} />
        <StatCard icon={<Mail className="h-4 w-4" />} label="Leads captured" value={leads.length} />
      </div>

      {directorReview ? (
        <SectionPanel title="Director Review">
          <JsonView data={directorReview} />
        </SectionPanel>
      ) : null}

      {insights ? (
        <SectionPanel title="Launch Insights">
          <JsonView data={insights} />
        </SectionPanel>
      ) : null}

      {brief ? (
        <SectionPanel title="Strategic Brief (CMO)">
          <JsonView data={brief} />
        </SectionPanel>
      ) : null}

      {seoPlan ? (
        <SectionPanel title="SEO Plan">
          <JsonView data={seoPlan} />
        </SectionPanel>
      ) : null}

      {analyticsPlan ? (
        <SectionPanel title="Analytics Plan">
          <JsonView data={analyticsPlan} />
        </SectionPanel>
      ) : null}

      {ads.length > 0 && (
        <SectionPanel title={`Ad Copies (${ads.length})`} contentClassName="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 border-b border-slate-800">
                <th className="px-4 py-2.5 text-left">Platform</th>
                <th className="px-4 py-2.5 text-left">Headline</th>
                <th className="px-4 py-2.5 text-left">Body</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {ads.map((ad) => (
                <tr key={ad.id}>
                  <td className="px-4 py-2.5"><StatusPill tone="neutral">{ad.ad_briefs?.platform ?? '—'}</StatusPill></td>
                  <td className="px-4 py-2.5 font-semibold text-slate-100">{ad.headline ?? '—'}</td>
                  <td className="px-4 py-2.5 text-xs text-slate-400 truncate max-w-lg">{ad.primary_text ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </SectionPanel>
      )}

      {contents.length > 0 && (
        <SectionPanel title={`Content (${contents.length})`} contentClassName="p-0">
          <ul className="divide-y divide-slate-800">
            {contents.map((c) => (
              <li key={c.id} className="px-4 py-2.5 flex items-center gap-3">
                <FileText className="h-4 w-4 text-slate-500" />
                <Link href={`/content`} className="flex-1 font-semibold text-slate-100 hover:text-emerald-300">{c.title}</Link>
                <span className="text-xs text-slate-500 font-mono-data">{c.word_count ?? 0} words</span>
                <StatusPill tone="neutral">{c.status}</StatusPill>
              </li>
            ))}
          </ul>
        </SectionPanel>
      )}

      {landings.length > 0 && (
        <SectionPanel title={`Landing Pages (${landings.length})`} contentClassName="p-0">
          <ul className="divide-y divide-slate-800">
            {landings.map((p) => (
              <li key={p.id} className="px-4 py-2.5 flex items-center gap-3">
                <Globe className="h-4 w-4 text-slate-500" />
                <div className="flex-1">
                  <div className="font-semibold text-slate-100">{p.name}</div>
                  <a href={`/p/${p.slug}`} target="_blank" rel="noreferrer" className="text-xs text-emerald-400 hover:underline">/p/{p.slug}</a>
                </div>
                <span className="text-xs text-slate-500 font-mono-data">{p.visits} visits</span>
                <StatusPill tone="neutral">{p.published ? 'published' : 'draft'}</StatusPill>
              </li>
            ))}
          </ul>
        </SectionPanel>
      )}

      {leads.length > 0 && (
        <SectionPanel title={`Leads from this campaign (${leads.length})`} contentClassName="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 border-b border-slate-800">
                <th className="px-4 py-2.5 text-left">Email</th>
                <th className="px-4 py-2.5 text-left">UTM source</th>
                <th className="px-4 py-2.5 text-left">UTM campaign</th>
                <th className="px-4 py-2.5 text-left">Captured</th>
                <th className="px-4 py-2.5 text-left">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {leads.map((l) => (
                <tr key={l.id}>
                  <td className="px-4 py-2.5 text-slate-100">{l.email}</td>
                  <td className="px-4 py-2.5 text-xs text-slate-400">{l.utm_source ?? '—'}</td>
                  <td className="px-4 py-2.5 text-xs text-slate-400">{l.utm_campaign ?? '—'}</td>
                  <td className="px-4 py-2.5 text-xs text-slate-500">{new Date(l.created_at).toLocaleString()}</td>
                  <td className="px-4 py-2.5"><StatusPill tone="neutral">{l.status}</StatusPill></td>
                </tr>
              ))}
            </tbody>
          </table>
        </SectionPanel>
      )}

      <SectionPanel title="Raw campaign metadata">
        <JsonView data={meta} />
      </SectionPanel>

      {/* Glance at the other channels that didn't get a column */}
      <MessageSection campaignId={campaign.id} />
    </PageShell>
  )
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="rounded-md border border-slate-700 bg-slate-800/50 p-4">
      <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
        {icon}{label}
      </div>
      <div className="mt-2 text-2xl font-bold text-slate-100 font-mono-data">{value}</div>
    </div>
  )
}

function MessageSection({ campaignId }: { campaignId: string }) {
  const supabase = createClient()
  const [social, setSocial] = useState<Array<{ id: string; platform: string; content: string; status: string }>>([])
  const [emails, setEmails] = useState<Array<{ id: string; name: string; status: string }>>([])

  useEffect(() => {
    ;(async () => {
      // social_posts and email_sequences don't carry campaign_id today — pull everything
      // for the project and filter by metadata.launch_run where possible.
      // Kept minimal: just list recent social posts and email sequences for the project.
      const { data: c } = await supabase.from('campaigns').select('project_id').eq('id', campaignId).single()
      if (!c?.project_id) return
      const [socRes, seqRes] = await Promise.all([
        supabase.from('social_posts').select('id, platform, content, status').eq('project_id', c.project_id).order('created_at', { ascending: false }).limit(15),
        supabase.from('email_sequences').select('id, name, status').eq('project_id', c.project_id).order('created_at', { ascending: false }).limit(5),
      ])
      setSocial(socRes.data ?? [])
      setEmails(seqRes.data ?? [])
    })()
  }, [campaignId, supabase])

  if (social.length === 0 && emails.length === 0) return null

  return (
    <>
      {social.length > 0 && (
        <SectionPanel title={`Recent social posts (project)`} contentClassName="p-0">
          <ul className="divide-y divide-slate-800">
            {social.map((s) => (
              <li key={s.id} className="px-4 py-2.5 flex items-start gap-3">
                <MessageSquare className="h-4 w-4 mt-0.5 text-slate-500" />
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-semibold uppercase text-slate-500">{s.platform}</div>
                  <div className="text-sm text-slate-200 line-clamp-2">{s.content}</div>
                </div>
                <StatusPill tone="neutral">{s.status}</StatusPill>
              </li>
            ))}
          </ul>
        </SectionPanel>
      )}
      {emails.length > 0 && (
        <SectionPanel title="Email sequences (project)" contentClassName="p-0">
          <ul className="divide-y divide-slate-800">
            {emails.map((e) => (
              <li key={e.id} className="px-4 py-2.5 flex items-center gap-3">
                <Mail className="h-4 w-4 text-slate-500" />
                <span className="flex-1 text-slate-100">{e.name}</span>
                <StatusPill tone="neutral">{e.status}</StatusPill>
              </li>
            ))}
          </ul>
        </SectionPanel>
      )}
    </>
  )
}
