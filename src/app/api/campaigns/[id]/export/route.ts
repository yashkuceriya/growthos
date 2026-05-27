// GET /api/campaigns/:id/export
//
// Returns a markdown-formatted "campaign pack" — a single document the
// operator can paste into Notion / a task tracker / a teammate Slack to
// describe what to launch. Includes:
// - Campaign metadata + goal
// - Each asset grouped by kind, with the body + a tracked URL
// - Learning summary (if any) and recommended next experiments
//
// Always returns text/markdown (Content-Disposition lets the browser
// trigger a save dialog when invoked from a download link).
//
// Pure consumer of the unified assets API + learning summary. No new
// reads other than the project's website (for building tracking URLs).
import { createClient } from '@/lib/supabase/server'
import { buildAssetTrackingUrl, campaignSlugFor } from '@/lib/publishing/links'
import { summarizeCampaign, type LearningSummary, type LearningSummaryInputs } from '@/lib/campaigns/learning'

export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: campaignId } = await ctx.params
  if (!campaignId) return Response.json({ error: 'campaign id required' }, { status: 400 })

  const { data: campaign } = await supabase
    .from('campaigns')
    .select('id, name, description, status, channels, project_id, metadata, created_at')
    .eq('id', campaignId)
    .eq('user_id', user.id)
    .maybeSingle() as { data: {
      id: string; name: string; description: string | null; status: string; channels: string[];
      project_id: string; metadata: Record<string, unknown> | null; created_at: string;
    } | null }
  if (!campaign) return Response.json({ error: 'Campaign not found' }, { status: 404 })

  const [{ data: project }, { data: adRows }, { data: socialRows }, { data: contentRows }, { data: landingRows }, { data: metricRows }] = await Promise.all([
    supabase.from('projects').select('name, website').eq('id', campaign.project_id).maybeSingle(),
    supabase
      .from('ad_copies')
      .select('id, status, headline, primary_text, cta_button, is_best, weighted_average, ad_briefs!inner(platform, campaign_id)')
      .eq('ad_briefs.campaign_id', campaignId),
    supabase
      .from('social_posts')
      .select('id, platform, content, status, scheduled_at, external_url, is_winner, engagement')
      .eq('campaign_id', campaignId)
      .order('created_at', { ascending: false }),
    supabase
      .from('content_pieces')
      .select('id, title, slug, body_markdown, content_type, status, word_count')
      .eq('campaign_id', campaignId),
    supabase
      .from('landing_pages')
      .select('id, name, slug, template, published')
      .eq('campaign_id', campaignId),
    supabase
      .from('campaign_metrics')
      .select('channel, date, impressions, clicks, conversions, spend, revenue')
      .eq('campaign_id', campaignId),
  ])

  const summary = computeSummary({
    metrics: (metricRows ?? []) as LearningSummaryInputs['metrics'],
    ads: (adRows ?? []) as unknown as LearningSummaryInputs['ads'],
    social: (socialRows ?? []) as unknown as LearningSummaryInputs['social'],
    email: [],
    insights: {
      current: readCurrentInsights((project as { brand_voice?: Record<string, unknown> } | null)?.brand_voice ?? null),
    },
  })

  const projectWebsite = (project as { website?: string | null } | null)?.website ?? null
  const projectName = (project as { name?: string } | null)?.name ?? 'Untitled product'
  const slug = campaignSlugFor(campaign.name, campaign.id)

  const md = buildMarkdown({
    campaign,
    projectName,
    projectWebsite,
    slug,
    ads: (adRows ?? []) as Array<Record<string, unknown>>,
    social: (socialRows ?? []) as Array<Record<string, unknown>>,
    content: (contentRows ?? []) as Array<Record<string, unknown>>,
    landings: (landingRows ?? []) as Array<Record<string, unknown>>,
    summary,
  })

  return new Response(md, {
    status: 200,
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Content-Disposition': `attachment; filename="campaign-${slug}.md"`,
    },
  })
}

function readCurrentInsights(brandVoice: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!brandVoice) return null
  const ins = brandVoice.insights
  if (!ins || typeof ins !== 'object' || Array.isArray(ins)) return null
  const cur = (ins as Record<string, unknown>).current
  if (!cur || typeof cur !== 'object' || Array.isArray(cur)) return null
  return cur as Record<string, unknown>
}

function computeSummary(inputs: LearningSummaryInputs): LearningSummary {
  return summarizeCampaign(inputs)
}

interface BuildMarkdownArgs {
  campaign: { id: string; name: string; description: string | null; status: string; channels: string[]; created_at: string; metadata: Record<string, unknown> | null }
  projectName: string
  projectWebsite: string | null
  slug: string
  ads: Array<Record<string, unknown>>
  social: Array<Record<string, unknown>>
  content: Array<Record<string, unknown>>
  landings: Array<Record<string, unknown>>
  summary: LearningSummary
}

function buildMarkdown(args: BuildMarkdownArgs): string {
  const lines: string[] = []
  lines.push(`# ${args.campaign.name}`)
  lines.push('')
  lines.push(`_Project: **${args.projectName}**${args.projectWebsite ? ` · ${args.projectWebsite}` : ''}_`)
  lines.push(`_Status: ${args.campaign.status} · Created ${new Date(args.campaign.created_at).toLocaleDateString()}_`)
  lines.push(`_Channels: ${args.campaign.channels.length ? args.campaign.channels.join(', ') : '—'}_`)
  lines.push(`_UTM campaign slug: \`${args.slug}\`_`)
  lines.push('')

  if (args.campaign.description) {
    lines.push(args.campaign.description)
    lines.push('')
  }

  // Brief/goal block (if launch populated it).
  const meta = args.campaign.metadata ?? {}
  const brief = (meta as { brief?: unknown }).brief
  if (brief && typeof brief === 'object') {
    const briefObj = brief as Record<string, unknown>
    const goal = typeof briefObj.primary_goal === 'string' ? briefObj.primary_goal : null
    const angle = typeof briefObj.angle === 'string' ? briefObj.angle : null
    if (goal || angle) {
      lines.push('## Strategic brief')
      if (goal) lines.push(`- **Goal**: ${goal}`)
      if (angle) lines.push(`- **Angle**: ${angle}`)
      lines.push('')
    }
  }

  // Learning summary highlights (kept short — the campaign page is the
  // full view; the markdown export is the "share with a teammate" view).
  if (args.summary.bestChannel || args.summary.bestAsset || args.summary.recommendedNext.length > 0) {
    lines.push('## What we know so far')
    if (args.summary.bestChannel) {
      lines.push(`- **Best channel**: ${args.summary.bestChannel.channel} — ${args.summary.bestChannel.reason}`)
    }
    if (args.summary.worstChannel) {
      lines.push(`- **Worst channel**: ${args.summary.worstChannel.channel} — ${args.summary.worstChannel.reason}`)
    }
    if (args.summary.strongestHook) {
      lines.push(`- **Strongest hook**: ${args.summary.strongestHook}`)
    }
    if (args.summary.bestAsset) {
      lines.push(`- **Best asset**: (${args.summary.bestAsset.kind}) ${args.summary.bestAsset.label}`)
    }
    if (args.summary.recommendedNext.length > 0) {
      lines.push('')
      lines.push('### Recommended next experiments')
      for (const r of args.summary.recommendedNext) lines.push(`- ${r}`)
    }
    lines.push('')
  }

  // ---- Assets, grouped by kind --------------------------------------
  if (args.ads.length > 0) {
    lines.push(`## Ads (${args.ads.length})`)
    for (const ad of args.ads) {
      const platform = ((ad.ad_briefs as { platform?: string } | undefined)?.platform) ?? 'meta'
      const headline = (ad.headline as string | null) ?? '(no headline)'
      const tracked = args.projectWebsite ? buildAssetTrackingUrl({
        destination: args.projectWebsite,
        campaignSlug: args.slug,
        channel: platform,
        assetId: ad.id as string,
        assetKind: 'ad',
      }) : null
      lines.push(`### ${headline}`)
      lines.push(`_${platform} · status: ${ad.status} · score: ${(ad.weighted_average as number | null) ?? '—'}${ad.is_best ? ' · WINNER' : ''}_`)
      if (ad.primary_text) {
        lines.push('')
        lines.push((ad.primary_text as string).trim())
      }
      if (ad.cta_button) lines.push(`- **CTA**: ${ad.cta_button}`)
      if (tracked) lines.push(`- **Tracked URL**: ${tracked}`)
      lines.push('')
    }
  }

  if (args.social.length > 0) {
    lines.push(`## Social posts (${args.social.length})`)
    for (const post of args.social) {
      const platform = (post.platform as string) ?? 'social'
      const tracked = args.projectWebsite ? buildAssetTrackingUrl({
        destination: args.projectWebsite,
        campaignSlug: args.slug,
        channel: platform,
        assetId: post.id as string,
        assetKind: 'social',
      }) : null
      lines.push(`### ${platform}${post.is_winner ? ' · winner' : ''}`)
      lines.push(`_Status: ${post.status}${post.scheduled_at ? ` · scheduled ${post.scheduled_at}` : ''}_`)
      lines.push('')
      lines.push(((post.content as string | null) ?? '').trim() || '_(empty)_')
      lines.push('')
      if (tracked) lines.push(`- **Tracked URL**: ${tracked}`)
      if (post.external_url) lines.push(`- **Published URL**: ${post.external_url}`)
      lines.push('')
    }
  }

  if (args.content.length > 0) {
    lines.push(`## Content (${args.content.length})`)
    for (const piece of args.content) {
      lines.push(`### ${(piece.title as string | null) ?? 'Untitled'}`)
      lines.push(`_${piece.content_type} · status: ${piece.status} · ${piece.word_count ?? '?'} words_`)
      if (args.projectWebsite && piece.slug) {
        const url = new URL(`/${piece.slug}`, args.projectWebsite).toString()
        const tracked = buildAssetTrackingUrl({
          destination: url, campaignSlug: args.slug, channel: 'blog', assetId: piece.id as string, assetKind: 'blog',
        })
        lines.push(`- **Tracked URL**: ${tracked}`)
      }
      const body = (piece.body_markdown as string | null) ?? null
      if (body) {
        lines.push('')
        lines.push(body.length > 400 ? `${body.slice(0, 400).trim()}…` : body)
      }
      lines.push('')
    }
  }

  if (args.landings.length > 0) {
    lines.push(`## Landing pages (${args.landings.length})`)
    for (const page of args.landings) {
      const template = (page.template as Record<string, unknown> | null) ?? {}
      const headline = (template.headline as string | null) ?? (page.name as string | null) ?? 'Landing page'
      lines.push(`### ${headline}`)
      lines.push(`_${page.published ? 'published' : 'draft'}_`)
      if (page.slug) {
        const url = `/p/${page.slug}`
        lines.push(`- **Path**: ${url}`)
      }
      lines.push('')
    }
  }

  lines.push('---')
  lines.push(`_Exported from GrowthOS on ${new Date().toLocaleString()}_`)
  return lines.join('\n')
}
