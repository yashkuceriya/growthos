// GET /api/campaigns/:id/assets
//
// One read-side endpoint backing the Campaign Command Center page. Returns
// every asset associated with a campaign — ads, social posts, blog posts,
// landing pages, and leads — normalized into one shape the UI can render
// without joining tables in client code.
//
// Email sequences/templates are intentionally project-scoped today (they're
// reusable across campaigns), so the response includes them as a sidecar
// `projectEmails` array rather than first-class campaign assets.
//
// RLS gates everything via the session client. We additionally verify the
// caller owns the parent campaign before returning to avoid leaking asset
// counts via timing.
import { createClient } from '@/lib/supabase/server'

type Tone = 'success' | 'warn' | 'info' | 'neutral' | 'accent' | 'error'

interface UnifiedAsset {
  id: string
  kind: 'ad' | 'social_post' | 'blog' | 'landing' | 'lead'
  channel: string
  title: string
  body: string | null
  status: string
  status_tone: Tone
  href: string | null
  // Compact metadata payload for the UI. Each kind carries different
  // fields; the front-end picks what to render.
  metadata: Record<string, unknown>
  created_at: string | null
}

export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: campaignId } = await ctx.params
  if (!campaignId) return Response.json({ error: 'campaign id required' }, { status: 400 })

  // Verify ownership up front. RLS would block the joins, but a 404 reads
  // cleaner than partially-empty payloads.
  const { data: campaign } = await supabase
    .from('campaigns')
    .select('id, project_id')
    .eq('id', campaignId)
    .eq('user_id', user.id)
    .maybeSingle() as { data: { id: string; project_id: string } | null }
  if (!campaign) return Response.json({ error: 'Campaign not found' }, { status: 404 })

  const [adsRes, socialRes, contentRes, landingRes, leadsRes, projectEmailsRes] = await Promise.all([
    supabase
      .from('ad_copies')
      .select('id, headline, primary_text, status, is_best, variant_group, variant_label, hook_framework, created_at, ad_briefs!inner(platform, campaign_id)')
      .eq('ad_briefs.campaign_id', campaignId)
      .order('created_at', { ascending: false }),
    supabase
      .from('social_posts')
      .select('id, platform, content, status, scheduled_at, external_url, engagement, is_winner, created_at, metadata')
      .eq('campaign_id', campaignId)
      .order('created_at', { ascending: false }),
    supabase
      .from('content_pieces')
      .select('id, title, slug, body_markdown, content_type, status, word_count, seo_score, created_at')
      .eq('campaign_id', campaignId)
      .order('created_at', { ascending: false }),
    supabase
      .from('landing_pages')
      .select('id, name, slug, template, published, visits, conversions, created_at')
      .eq('campaign_id', campaignId)
      .order('created_at', { ascending: false }),
    supabase
      .from('leads')
      .select('id, email, name, status, score, utm_source, utm_medium, utm_campaign, created_at')
      .eq('campaign_id', campaignId)
      .order('created_at', { ascending: false })
      .limit(50),
    // Email templates aren't campaign-scoped today — show the most recent
    // project-wide ones as a sidecar panel.
    supabase
      .from('email_templates')
      .select('id, name, subject, category, is_winner, created_at')
      .eq('project_id', campaign.project_id)
      .order('created_at', { ascending: false })
      .limit(10),
  ])

  const ads: UnifiedAsset[] = (adsRes.data ?? []).map((row: Record<string, unknown>) => {
    const platform = (row.ad_briefs as { platform?: string } | undefined)?.platform ?? 'meta'
    return {
      id: row.id as string,
      kind: 'ad',
      channel: platform,
      title: (row.headline as string | null) ?? `${platform} ad`,
      body: (row.primary_text as string | null) ?? null,
      status: (row.status as string | null) ?? 'unknown',
      status_tone: toneForAdStatus((row.status as string | null) ?? ''),
      href: `/ad-studio?adCopyId=${row.id}`,
      metadata: {
        is_best: row.is_best ?? false,
        variant_group: row.variant_group ?? null,
        variant_label: row.variant_label ?? null,
        hook_framework: row.hook_framework ?? null,
      },
      created_at: (row.created_at as string | null) ?? null,
    }
  })

  const social: UnifiedAsset[] = (socialRes.data ?? []).map((row: Record<string, unknown>) => {
    const status = (row.status as string | null) ?? 'draft'
    return {
      id: row.id as string,
      kind: 'social_post',
      channel: (row.platform as string | null) ?? 'social',
      title: shortenSocialTitle(row),
      body: (row.content as string | null) ?? null,
      status,
      status_tone: toneForSocialStatus(status, row.is_winner === true),
      href: (row.external_url as string | null) ?? null,
      metadata: {
        scheduled_at: row.scheduled_at ?? null,
        is_winner: row.is_winner ?? false,
        engagement: row.engagement ?? null,
      },
      created_at: (row.created_at as string | null) ?? null,
    }
  })

  const blogs: UnifiedAsset[] = (contentRes.data ?? []).map((row: Record<string, unknown>) => {
    const status = (row.status as string | null) ?? 'drafting'
    return {
      id: row.id as string,
      kind: 'blog',
      channel: (row.content_type as string | null) ?? 'blog',
      title: (row.title as string | null) ?? 'Untitled content',
      body: null,
      status,
      status_tone: status === 'published' ? 'success' : status === 'drafting' ? 'warn' : 'neutral',
      href: `/content?id=${row.id}`,
      metadata: {
        slug: row.slug ?? null,
        word_count: row.word_count ?? null,
        seo_score: row.seo_score ?? null,
      },
      created_at: (row.created_at as string | null) ?? null,
    }
  })

  const landings: UnifiedAsset[] = (landingRes.data ?? []).map((row: Record<string, unknown>) => {
    const template = (row.template as Record<string, unknown> | null) ?? {}
    return {
      id: row.id as string,
      kind: 'landing',
      channel: 'landing',
      title: (template.headline as string | null) ?? (row.name as string | null) ?? 'Landing page',
      body: (template.subheadline as string | null) ?? null,
      status: row.published ? 'published' : 'draft',
      status_tone: row.published ? 'success' : 'neutral',
      href: row.slug ? `/p/${row.slug}` : null,
      metadata: {
        slug: row.slug ?? null,
        visits: row.visits ?? 0,
        conversions: row.conversions ?? 0,
      },
      created_at: (row.created_at as string | null) ?? null,
    }
  })

  const leads: UnifiedAsset[] = (leadsRes.data ?? []).map((row: Record<string, unknown>) => ({
    id: row.id as string,
    kind: 'lead',
    channel: (row.utm_source as string | null) ?? 'direct',
    title: (row.email as string | null) ?? 'Lead',
    body: null,
    status: (row.status as string | null) ?? 'new',
    status_tone: leadStatusTone((row.status as string | null) ?? 'new'),
    href: `/leads?id=${row.id}`,
    metadata: {
      name: row.name ?? null,
      score: row.score ?? 0,
      utm_source: row.utm_source ?? null,
      utm_medium: row.utm_medium ?? null,
      utm_campaign: row.utm_campaign ?? null,
    },
    created_at: (row.created_at as string | null) ?? null,
  }))

  const projectEmails = (projectEmailsRes.data ?? []).map((row: Record<string, unknown>) => ({
    id: row.id as string,
    kind: 'email_template' as const,
    title: (row.name as string | null) ?? (row.subject as string | null) ?? 'Email',
    subject: (row.subject as string | null) ?? '',
    category: (row.category as string | null) ?? null,
    is_winner: row.is_winner === true,
    created_at: (row.created_at as string | null) ?? null,
  }))

  return Response.json({
    assets: [...ads, ...social, ...blogs, ...landings, ...leads],
    summary: {
      ads: ads.length,
      social: social.length,
      blogs: blogs.length,
      landings: landings.length,
      leads: leads.length,
    },
    projectEmails,
  })
}

function toneForAdStatus(status: string): Tone {
  switch (status) {
    case 'compliance_pass': return 'success'
    case 'evaluator_pass': return 'info'
    case 'below_threshold': return 'warn'
    case 'rejected': return 'neutral'
    default: return 'neutral'
  }
}

function toneForSocialStatus(status: string, isWinner: boolean): Tone {
  if (isWinner) return 'success'
  switch (status) {
    case 'published': return 'success'
    case 'publishing': return 'info'
    case 'scheduled': return 'accent'
    case 'failed': return 'error'
    case 'draft': return 'neutral'
    case 'cancelled': return 'neutral'
    default: return 'neutral'
  }
}

function leadStatusTone(status: string): Tone {
  switch (status) {
    case 'converted': return 'success'
    case 'qualified': return 'info'
    case 'nurturing': return 'accent'
    case 'contacted': return 'neutral'
    case 'lost': return 'error'
    default: return 'neutral'
  }
}

function shortenSocialTitle(row: Record<string, unknown>): string {
  const metadata = (row.metadata as Record<string, unknown> | null) ?? {}
  const titleHint = metadata.title as string | undefined
  if (titleHint) return titleHint
  const content = (row.content as string | null) ?? ''
  const firstLine = content.split('\n').find((line) => line.trim().length > 0) ?? ''
  if (firstLine.length <= 80) return firstLine || `${row.platform ?? 'social'} post`
  return `${firstLine.slice(0, 77)}…`
}
