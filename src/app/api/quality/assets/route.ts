import { createClient } from '@/lib/supabase/server'
import { getMarketingMemory } from '@/lib/marketing/memory'
import { scoreGeneratedAsset, type GeneratedQualityScore } from '@/lib/marketing/quality'

type QualityBand = 'weak' | 'review' | 'strong'

interface QualityAsset {
  id: string
  channel: string
  surface: string
  title: string
  body: string
  href: string
  status: string | null
  createdAt: string | null
  quality: GeneratedQualityScore
  band: QualityBand
}

export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const url = new URL(request.url)
  const projectId = url.searchParams.get('projectId')
  const limit = Math.min(120, Math.max(10, Number(url.searchParams.get('limit') ?? 80)))
  if (!projectId) return Response.json({ error: 'projectId required' }, { status: 400 })

  const { data: project } = await supabase
    .from('projects')
    .select('id')
    .eq('id', projectId)
    .maybeSingle()
  if (!project) return Response.json({ error: 'Project not found' }, { status: 404 })

  const memory = await getMarketingMemory({ supabase, userId: user.id, projectId })

  const [ads, social, emails, content, landing] = await Promise.all([
    safeQuery<Array<Record<string, unknown>>>(() => supabase
      .from('ad_copies')
      .select('id, headline, primary_text, cta_button, status, created_at, ad_briefs!inner(platform, project_id)')
      .eq('ad_briefs.project_id', projectId)
      .order('created_at', { ascending: false })
      .limit(limit)),
    safeQuery<Array<Record<string, unknown>>>(() => supabase
      .from('social_posts')
      .select('id, platform, content, status, created_at')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
      .limit(limit)),
    safeQuery<Array<Record<string, unknown>>>(() => supabase
      .from('email_templates')
      .select('id, subject, body_html, category, created_at')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
      .limit(limit)),
    safeQuery<Array<Record<string, unknown>>>(() => supabase
      .from('content_pieces')
      .select('id, title, body_markdown, content_type, status, target_keywords, created_at')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
      .limit(limit)),
    safeQuery<Array<Record<string, unknown>>>(() => supabase
      .from('landing_pages')
      .select('id, name, slug, template, published, created_at')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
      .limit(limit)),
  ])

  const items: QualityAsset[] = []

  for (const row of ads) {
    const platform = readJoin(row.ad_briefs, 'platform') ?? 'ad'
    const body = str(row.primary_text)
    const title = str(row.headline) || `${humanize(platform)} ad`
    const quality = scoreGeneratedAsset('ad_copy', {
      headline: title,
      body,
      cta: str(row.cta_button),
    }, memory)
    items.push(asset(row, platform, 'ad', title, `${body}\n\nCTA: ${str(row.cta_button)}`, '/ad-studio', str(row.status), quality))
  }

  for (const row of social) {
    const platform = str(row.platform) || 'social'
    const body = str(row.content)
    const quality = scoreGeneratedAsset('social_post', { body }, memory)
    items.push(asset(row, platform, 'social', `${humanize(platform)} post`, body, '/social', str(row.status), quality))
  }

  for (const row of emails) {
    const title = str(row.subject) || 'Email template'
    const body = str(row.body_html)
    const quality = scoreGeneratedAsset('email', {
      subject: title,
      body,
    }, memory)
    items.push(asset(row, 'email', 'email', title, body, '/email', str(row.category), quality))
  }

  for (const row of content) {
    const title = str(row.title) || 'Content piece'
    const body = str(row.body_markdown)
    const keywords = Array.isArray(row.target_keywords) ? row.target_keywords.filter((v): v is string => typeof v === 'string') : []
    const quality = scoreGeneratedAsset('blog', {
      title,
      body,
      targetKeyword: keywords[0],
    }, memory)
    items.push(asset(row, 'blog', str(row.content_type) || 'content', title, body, `/content?id=${row.id}`, str(row.status), quality))
  }

  for (const row of landing) {
    const template = isRecord(row.template) ? row.template : {}
    const title = str(template.headline) || str(row.name) || 'Landing page'
    const body = str(template.subheadline) + '\n\n' + str(template.bodyText)
    const quality = scoreGeneratedAsset('landing_page', {
      headline: title,
      body,
      cta: str(template.ctaText),
    }, memory)
    const slug = str(row.slug)
    items.push(asset(row, 'landing', 'landing', title, body || `Slug: /p/${slug}`, slug ? `/p/${slug}` : '/leads/pages', str(row.published) || null, quality))
  }

  const sorted = items
    .sort((a, b) => a.quality.overall - b.quality.overall || (Date.parse(b.createdAt ?? '') || 0) - (Date.parse(a.createdAt ?? '') || 0))
    .slice(0, limit)

  return Response.json({
    items: sorted,
    summary: {
      total: sorted.length,
      weak: sorted.filter((item) => item.band === 'weak').length,
      review: sorted.filter((item) => item.band === 'review').length,
      strong: sorted.filter((item) => item.band === 'strong').length,
      average: sorted.length ? Math.round((sorted.reduce((sum, item) => sum + item.quality.overall, 0) / sorted.length) * 10) / 10 : null,
    },
  })
}

async function safeQuery<T>(query: () => PromiseLike<{ data: T | null; error?: { message?: string } | null }>): Promise<T> {
  try {
    const { data } = await query()
    return (data ?? []) as T
  } catch {
    return [] as T
  }
}

function asset(
  row: Record<string, unknown>,
  channel: string,
  surface: string,
  title: string,
  body: string,
  href: string,
  status: string | null,
  quality: GeneratedQualityScore,
): QualityAsset {
  return {
    id: str(row.id),
    channel,
    surface,
    title,
    body,
    href,
    status,
    createdAt: str(row.created_at) || null,
    quality,
    band: quality.overall >= 8 ? 'strong' : quality.overall >= 7 ? 'review' : 'weak',
  }
}

function str(value: unknown): string {
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return ''
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function readJoin(value: unknown, key: string): string | null {
  if (Array.isArray(value)) return isRecord(value[0]) ? str(value[0][key]) || null : null
  return isRecord(value) ? str(value[key]) || null : null
}

function humanize(value: string): string {
  return value.replace(/[_-]/g, ' ').replace(/\b\w/g, (match) => match.toUpperCase())
}
