'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { PageShell } from '@/components/ui/page-shell'
import { PageHeader } from '@/components/ui/page-header'
import { SectionPanel } from '@/components/ui/section-panel'
import { StatusPill } from '@/components/ui/status-pill'
import { JsonView } from '@/components/ui/json-viewer'
import { ChevronLeft, FileText, Mail, MessageSquare, Globe, Target, Trophy, Archive, Rocket, Users, Download, ExternalLink, Copy, Link as LinkIcon } from 'lucide-react'
import { toast } from 'sonner'
import { ManualMetricsLogger } from '@/components/campaigns/manual-metrics-logger'
import { LearningSummaryPanel } from '@/components/campaigns/learning-summary'
import { LaunchScheduleStrip } from '@/components/campaigns/launch-schedule-strip'
import { NextBestActionPanel } from '@/components/dashboard/next-best-action'
import { buildAssetTrackingUrl, campaignSlugFor, composerLabelFor, composerLinkFor } from '@/lib/publishing/links'

interface Campaign {
  id: string
  name: string
  description: string | null
  status: string
  channels: string[]
  project_id: string
  metadata: Record<string, unknown> | null
  created_at: string
}

interface AdCopyRow {
  id: string
  headline: string | null
  primary_text: string | null
  status: string
  is_best: boolean
  variant_group: string | null
  variant_label: string | null
  hook_framework: string | null
  ad_briefs: { platform: string } | null
}

type AssetKind = 'ad' | 'social_post' | 'blog' | 'landing' | 'lead'
type AssetTone = 'success' | 'warn' | 'info' | 'neutral' | 'accent' | 'error'

interface UnifiedAsset {
  id: string
  kind: AssetKind
  channel: string
  title: string
  body: string | null
  status: string
  status_tone: AssetTone
  href: string | null
  metadata: Record<string, unknown>
  created_at: string | null
}

interface AssetsResponse {
  assets: UnifiedAsset[]
  summary: { ads: number; social: number; blogs: number; landings: number; leads: number }
  projectEmails: Array<{ id: string; title: string; subject: string; category: string | null; is_winner: boolean; created_at: string | null }>
}

const KIND_LABELS: Record<AssetKind, string> = {
  ad: 'Ads',
  social_post: 'Social',
  blog: 'Content',
  landing: 'Landing',
  lead: 'Leads',
}

export default function CampaignDetailPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const supabase = createClient()
  const [campaign, setCampaign] = useState<Campaign | null>(null)
  const [projectWebsite, setProjectWebsite] = useState<string | null>(null)
  const [ads, setAds] = useState<AdCopyRow[]>([])
  const [boardAssets, setBoardAssets] = useState<UnifiedAsset[]>([])
  const [summary, setSummary] = useState<AssetsResponse['summary'] | null>(null)
  const [projectEmails, setProjectEmails] = useState<AssetsResponse['projectEmails']>([])
  const [activeKind, setActiveKind] = useState<AssetKind | 'all'>('all')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!params.id) return
    void loadAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id])

  async function loadAll() {
    setLoading(true)
    const [cRes, assetsRes, adsForPromoteRes] = await Promise.all([
      supabase
        .from('campaigns')
        .select('id, name, description, status, channels, project_id, metadata, created_at')
        .eq('id', params.id)
        .single(),
      fetch(`/api/campaigns/${params.id}/assets`),
      // Variant-aware ad rows still feed AdVariantGroups for the
      // promote-winner action; the unified API gives the headline view.
      supabase
        .from('ad_copies')
        .select('id, headline, primary_text, status, is_best, variant_group, variant_label, hook_framework, ad_briefs!inner(platform, campaign_id)')
        .eq('ad_briefs.campaign_id', params.id),
    ])
    const campaignRow = cRes.data as Campaign | null
    setCampaign(campaignRow)
    if (campaignRow?.project_id) {
      const { data: projectRow } = await supabase
        .from('projects')
        .select('website')
        .eq('id', campaignRow.project_id)
        .maybeSingle()
      setProjectWebsite((projectRow as { website?: string | null } | null)?.website ?? null)
    }

    if (assetsRes.ok) {
      const body = (await assetsRes.json()) as AssetsResponse
      setBoardAssets(body.assets)
      setSummary(body.summary)
      setProjectEmails(body.projectEmails)
    } else {
      toast.error('Failed to load campaign assets')
    }

    setAds((adsForPromoteRes.data ?? []) as unknown as AdCopyRow[])
    setLoading(false)
  }

  const filteredAssets = useMemo(() => {
    if (activeKind === 'all') return boardAssets
    return boardAssets.filter((a) => a.kind === activeKind)
  }, [boardAssets, activeKind])

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
          <div className="flex items-center gap-2">
            <a
              href={`/api/campaigns/${campaign.id}/export`}
              download
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-700 bg-slate-800/60 px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-slate-200 hover:bg-slate-800"
              title="Download a markdown launch checklist with tracked URLs"
            >
              <Download className="h-3.5 w-3.5" /> Pack
            </a>
            <button
              onClick={() => router.push(`/launch?campaignId=${campaign.id}`)}
              className="inline-flex items-center gap-1.5 rounded-md bg-emerald-500 px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-slate-950 hover:bg-emerald-400"
              title="Re-run launch and attach new assets to this campaign"
            >
              <Rocket className="h-3.5 w-3.5" /> Re-launch
            </button>
            <Link href="/campaigns" className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-slate-400 hover:text-slate-100">
              <ChevronLeft className="h-3.5 w-3.5" /> Back
            </Link>
          </div>
        }
      />

      <div className="mb-4 flex items-center gap-2">
        <StatusPill status={campaign.status}>{campaign.status}</StatusPill>
        {campaign.channels.map((ch) => (
          <StatusPill key={ch} tone="neutral">{ch}</StatusPill>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-5 mb-4">
        <StatCard icon={<Target className="h-4 w-4" />} label="Ad copies" value={summary?.ads ?? ads.length} onClick={() => setActiveKind('ad')} active={activeKind === 'ad'} />
        <StatCard icon={<MessageSquare className="h-4 w-4" />} label="Social" value={summary?.social ?? 0} onClick={() => setActiveKind('social_post')} active={activeKind === 'social_post'} />
        <StatCard icon={<FileText className="h-4 w-4" />} label="Content" value={summary?.blogs ?? 0} onClick={() => setActiveKind('blog')} active={activeKind === 'blog'} />
        <StatCard icon={<Globe className="h-4 w-4" />} label="Landing" value={summary?.landings ?? 0} onClick={() => setActiveKind('landing')} active={activeKind === 'landing'} />
        <StatCard icon={<Users className="h-4 w-4" />} label="Leads" value={summary?.leads ?? 0} onClick={() => setActiveKind('lead')} active={activeKind === 'lead'} />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-slate-800 bg-slate-900/40 px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
        <span className="text-slate-500">Create & attach</span>
        <Link href={`/ad-studio/generate?campaignId=${campaign.id}`} className="text-emerald-300 hover:text-emerald-200">
          Ad Generate
        </Link>
        <span className="text-slate-600 hidden sm:inline">·</span>
        <Link href={`/social?campaignId=${campaign.id}`} className="text-emerald-300 hover:text-emerald-200">
          Social
        </Link>
        <span className="text-slate-600 hidden sm:inline">·</span>
        <Link href={`/content?campaignId=${campaign.id}`} className="text-emerald-300 hover:text-emerald-200">
          Content
        </Link>
      </div>

      <div className="mb-4 grid gap-4 md:grid-cols-2">
        <NextBestActionPanel projectId={campaign.project_id} campaignId={campaign.id} title="Next best action · this campaign" />
        <LaunchScheduleStrip assets={boardAssets} />
      </div>

      {/* Unified asset board — single tabbed view across every asset type
          attached to the campaign. Stat cards above act as filter chips. */}
      <SectionPanel
        title={
          <span className="flex items-center gap-2">
            Campaign Command Center
            <StatusPill tone="neutral">{filteredAssets.length} asset{filteredAssets.length === 1 ? '' : 's'}</StatusPill>
          </span>
        }
        contentClassName="p-0"
      >
        <div className="flex items-center gap-2 border-b border-slate-800 px-4 py-2">
          <button
            onClick={() => setActiveKind('all')}
            className={`rounded px-2 py-1 text-[10px] font-semibold uppercase tracking-wider ${activeKind === 'all' ? 'bg-emerald-500/15 text-emerald-300' : 'text-slate-400 hover:text-slate-200'}`}
          >
            All
          </button>
          {(Object.keys(KIND_LABELS) as AssetKind[]).map((k) => (
            <button
              key={k}
              onClick={() => setActiveKind(k)}
              className={`rounded px-2 py-1 text-[10px] font-semibold uppercase tracking-wider ${activeKind === k ? 'bg-emerald-500/15 text-emerald-300' : 'text-slate-400 hover:text-slate-200'}`}
            >
              {KIND_LABELS[k]}
            </button>
          ))}
        </div>
        {filteredAssets.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-slate-500">
            No {activeKind === 'all' ? 'assets' : KIND_LABELS[activeKind as AssetKind].toLowerCase()} attached to this campaign yet.
          </div>
        ) : (
          <ul className="divide-y divide-slate-800">
            {filteredAssets.map((a) => (
              <AssetRow
                key={`${a.kind}:${a.id}`}
                asset={a}
                campaignSlug={campaignSlugFor(campaign.name, campaign.id)}
                projectWebsite={projectWebsite}
              />
            ))}
          </ul>
        )}
      </SectionPanel>

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
        <SectionPanel title={`Ad Variants & Winner Picker (${ads.length})`}>
          <AdVariantGroups
            ads={ads}
            onPromote={async (adCopyId) => {
              const res = await fetch('/api/ad-copies/promote-winner', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ adCopyId }),
              })
              const json = await res.json()
              if (!res.ok) { toast.error(json.error ?? 'Failed'); return }
              toast.success(`Winner promoted · ${json.archived} sibling${json.archived === 1 ? '' : 's'} archived`)
              await loadAll()
            }}
          />
        </SectionPanel>
      )}

      <LearningSummaryPanel campaignId={campaign.id} />

      <ManualMetricsLogger campaignId={campaign.id} channels={campaign.channels} />

      {projectEmails.length > 0 && (
        <SectionPanel title="Recent email templates (project)" contentClassName="p-0">
          <ul className="divide-y divide-slate-800">
            {projectEmails.map((e) => (
              <li key={e.id} className="px-4 py-2.5 flex items-center gap-3">
                <Mail className="h-4 w-4 text-slate-500" />
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-slate-100 flex items-center gap-1.5">
                    {e.title}
                    {e.is_winner && <Trophy className="h-3 w-3 text-emerald-400" />}
                  </div>
                  <div className="text-xs text-slate-500 truncate">{e.subject}</div>
                </div>
                {e.category && <StatusPill tone="neutral">{e.category}</StatusPill>}
              </li>
            ))}
          </ul>
        </SectionPanel>
      )}

      <SectionPanel title="Raw campaign metadata">
        <JsonView data={meta} />
      </SectionPanel>
    </PageShell>
  )
}

function AssetRow({ asset: a, campaignSlug, projectWebsite }: {
  asset: UnifiedAsset
  campaignSlug: string
  projectWebsite: string | null
}) {
  // Compute a destination + tracked URL for the asset. We prefer the
  // published URL (only social_post carries one), then the project website,
  // then nothing (omits the action).
  const publishedUrl = a.kind === 'social_post' && a.href && /^https?:/i.test(a.href) ? a.href : null
  const destination = publishedUrl ?? projectWebsite ?? null
  const trackedUrl = destination
    ? buildAssetTrackingUrl({
        destination,
        campaignSlug,
        channel: a.channel,
        assetId: a.id,
        assetKind: a.kind,
      })
    : null
  // Composer URL only useful for social-class assets where a platform composer exists.
  const composerHref = a.kind === 'social_post'
    ? composerLinkFor({ platform: a.channel, text: a.body ?? a.title, url: trackedUrl ?? destination ?? undefined })
    : null
  const copyable = a.body && a.body.trim().length > 0 ? a.body : a.title

  return (
    <li className="px-4 py-3">
      <div className="grid grid-cols-[auto_1fr_auto_auto] items-center gap-3">
        <span className="font-mono-data text-[10px] uppercase tracking-wider text-slate-500 w-16">
          {a.kind === 'social_post' ? 'social' : a.kind}
        </span>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            {a.href
              ? <Link href={a.href} className="font-semibold text-slate-100 hover:text-emerald-300 truncate">{a.title}</Link>
              : <span className="font-semibold text-slate-100 truncate">{a.title}</span>
            }
            {a.metadata.is_winner === true && <span title="Promoted winner"><Trophy className="h-3 w-3 text-emerald-400" /></span>}
            {a.metadata.is_best === true && <span title="Best variant"><Trophy className="h-3 w-3 text-emerald-400" /></span>}
          </div>
          {a.body && <div className="text-xs text-slate-500 line-clamp-1">{a.body}</div>}
        </div>
        <StatusPill tone="neutral">{a.channel}</StatusPill>
        <StatusPill tone={a.status_tone}>{a.status}</StatusPill>
      </div>
      {(copyable || trackedUrl || composerHref) && (
        <div className="mt-2 ml-[4.75rem] flex flex-wrap items-center gap-1.5">
          {copyable && (
            <button
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(copyable)
                  toast.success('Copied to clipboard')
                } catch {
                  toast.error('Could not copy')
                }
              }}
              className="inline-flex items-center gap-1 rounded border border-slate-800 bg-slate-900/60 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-300 hover:bg-slate-800"
            >
              <Copy className="h-3 w-3" /> Copy
            </button>
          )}
          {trackedUrl && (
            <button
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(trackedUrl)
                  toast.success('Tracked URL copied')
                } catch {
                  toast.error('Could not copy')
                }
              }}
              className="inline-flex items-center gap-1 rounded border border-slate-800 bg-slate-900/60 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-300 hover:bg-slate-800"
              title={trackedUrl}
            >
              <LinkIcon className="h-3 w-3" /> Tracked URL
            </button>
          )}
          {composerHref && (
            <a
              href={composerHref}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-emerald-200 hover:bg-emerald-500/20"
            >
              <ExternalLink className="h-3 w-3" /> {composerLabelFor(a.channel)}
            </a>
          )}
        </div>
      )}
    </li>
  )
}

function AdVariantGroups({ ads, onPromote }: { ads: AdCopyRow[]; onPromote: (id: string) => Promise<void> }) {
  const groups = new Map<string, AdCopyRow[]>()
  for (const ad of ads) {
    const key = ad.variant_group ?? `solo:${ad.id}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(ad)
  }
  const ordered = Array.from(groups.values()).map((arr) =>
    arr.slice().sort((a, b) => (a.variant_label ?? '').localeCompare(b.variant_label ?? ''))
  )
  return (
    <div className="space-y-4">
      {ordered.map((group, i) => {
        const platform = group[0]?.ad_briefs?.platform ?? '—'
        const hasWinner = group.some((ad) => ad.is_best)
        const groupHasVariants = group.length > 1
        return (
          <div key={group[0]?.variant_group ?? group[0]?.id ?? i}>
            <div className="mb-2 flex items-center gap-2">
              <StatusPill tone="accent">{platform}</StatusPill>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{groupHasVariants ? `${group.length}-way split` : 'single variant'}</span>
              {hasWinner && <StatusPill tone="success"><Trophy className="h-3 w-3" /> Winner picked</StatusPill>}
            </div>
            <div className={`grid gap-3 ${group.length === 1 ? 'grid-cols-1' : 'md:grid-cols-3'}`}>
              {group.map((ad) => {
                const archived = ad.status === 'rejected'
                return (
                  <div
                    key={ad.id}
                    className={`rounded-md border p-3 flex flex-col ${
                      ad.is_best
                        ? 'border-emerald-500/40 bg-emerald-500/5'
                        : archived
                        ? 'border-slate-800 bg-slate-900/30 opacity-60'
                        : 'border-slate-800 bg-slate-900/60'
                    }`}
                  >
                    <div className="mb-2 flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <StatusPill tone={ad.is_best ? 'success' : archived ? 'neutral' : 'info'}>
                          Variant {ad.variant_label ?? '—'}
                        </StatusPill>
                        {ad.is_best && <Trophy className="h-3 w-3 text-emerald-400" />}
                        {archived && <Archive className="h-3 w-3 text-slate-500" />}
                      </div>
                      {ad.hook_framework && <span className="text-[9px] font-mono-data text-slate-500">{ad.hook_framework}</span>}
                    </div>
                    <div className="text-sm font-semibold text-slate-100 mb-1">{ad.headline ?? '—'}</div>
                    <div className="text-xs text-slate-400 line-clamp-5 flex-1">{ad.primary_text ?? '—'}</div>
                    {groupHasVariants && !ad.is_best && !archived && (
                      <button
                        onClick={() => onPromote(ad.id)}
                        className="mt-3 w-full rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-300 hover:bg-emerald-500/20"
                      >
                        <Trophy className="inline h-3 w-3 mr-1" /> Promote as winner
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function StatCard({
  icon, label, value, onClick, active,
}: { icon: React.ReactNode; label: string; value: number; onClick?: () => void; active?: boolean }) {
  const className = `rounded-md border p-4 text-left transition-colors ${active ? 'border-emerald-500/50 bg-emerald-500/5' : 'border-slate-700 bg-slate-800/50'} ${onClick ? 'hover:border-emerald-500/40 hover:bg-slate-800' : ''}`
  const content = (
    <>
      <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
        {icon}{label}
      </div>
      <div className="mt-2 text-2xl font-bold text-slate-100 font-mono-data">{value}</div>
    </>
  )
  if (onClick) return <button type="button" onClick={onClick} className={className}>{content}</button>
  return <div className={className}>{content}</div>
}

