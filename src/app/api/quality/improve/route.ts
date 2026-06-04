import { generateObject } from 'ai'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { checkBudget, budgetExceededResponse } from '@/lib/budget-guard'
import { getMarketingMemory, marketingMemoryPrompt } from '@/lib/marketing/memory'
import { scoreGeneratedAsset } from '@/lib/marketing/quality'
import { inferPersonasFromMemory, normalizePersonaRow, type MarketingPersona } from '@/lib/marketing/personas'
import { modelFor, modelLabel } from '@/lib/ai/models'
import { trackFromUsage } from '@/lib/cost-tracker'

const ImproveSchema = z.object({
  title: z.string().describe('Improved title, headline, or subject line'),
  body: z.string().describe('Improved body. Preserve markdown/html style when the original uses it.'),
  cta: z.string().optional().describe('Improved CTA when the asset has one'),
  preview_text: z.string().optional().describe('Email preview text when relevant'),
})

interface ImproveRequest {
  projectId?: string
  id?: string
  channel?: string
  surface?: string
  personaId?: string
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const body = (await request.json()) as ImproveRequest
  const projectId = body.projectId
  const id = body.id
  const channel = body.channel
  const surface = body.surface
  const personaId = body.personaId
  if (!projectId || !id || !channel || !surface) {
    return Response.json({ error: 'projectId, id, channel, and surface required' }, { status: 400 })
  }

  const budget = await checkBudget(supabase, projectId)
  if (!budget.ok) return budgetExceededResponse(budget)

  const memory = await getMarketingMemory({ supabase, userId: user.id, projectId })
  const persona = personaId ? await loadPersona(supabase, projectId, personaId, memory) : null
  const original = await loadOriginal(supabase, { id, channel, surface })
  if (!original) return Response.json({ error: 'Asset not found' }, { status: 404 })

  const before = scoreGeneratedAsset(original.scoreSurface, original.scoreInput, memory, persona)
  const memoryBlock = marketingMemoryPrompt(memory, original.scoreSurface)
  const personaBlock = persona ? personaPromptBlock(persona) : ''
  const startedAt = Date.now()
  const model = modelFor('strategic')
  const modelName = modelLabel('strategic')
  const result = await generateObject({
    model,
    schema: ImproveSchema,
    system: `You are a senior growth copy editor. Rewrite weak marketing assets into sharper, more specific, more conversion-oriented drafts. Keep the same channel and asset format. Do not add fake facts, fake metrics, fake testimonials, or unsupported claims.`,
    messages: [{
      role: 'user',
      content: `${memoryBlock}${personaBlock ? `\n\n${personaBlock}` : ''}

ASSET TYPE: ${original.scoreSurface}
CHANNEL: ${channel}

CURRENT QUALITY: ${before.overall}/10
RECOMMENDATIONS:
${before.recommendations.length ? before.recommendations.map((r) => `- ${r}`).join('\n') : '- Tighten specificity and conversion intent while preserving what works.'}

ORIGINAL TITLE:
${original.title}

ORIGINAL BODY:
${original.body}

Rewrite this asset. Keep it ready to use, concise for the channel, grounded in the product memory, and ${persona ? `written for ${persona.name}. Address their pains, desired outcomes, and likely objections without naming the persona unless it would sound natural.` : 'written for the stored audience.'}`,
    }],
  })

  await trackFromUsage({
    userId: user.id,
    projectId,
    module: 'quality_review',
    stepName: 'improve_asset',
    model: modelName,
    usage: result.usage,
    latencyMs: Date.now() - startedAt,
    metadata: { id, channel, surface, personaId: persona?.id ?? null, before: before.overall },
  })

  const improved = result.object
  const afterInput = original.toScoreInput(improved)
  const after = scoreGeneratedAsset(original.scoreSurface, afterInput, memory, persona)
  const error = await saveImproved(supabase, original, improved, after.overall)
  if (error) return Response.json({ error }, { status: 500 })

  return Response.json({
    asset: { id, channel, surface, title: improved.title, body: improved.body },
    persona,
    before,
    after,
  })
}

type ScoreSurface = Parameters<typeof scoreGeneratedAsset>[0]
type ScoreInput = Parameters<typeof scoreGeneratedAsset>[1]
type Supabase = Awaited<ReturnType<typeof createClient>>
type Improved = z.infer<typeof ImproveSchema>

interface OriginalAsset {
  table: 'ad_copies' | 'social_posts' | 'email_templates' | 'content_pieces' | 'landing_pages'
  id: string
  title: string
  body: string
  cta?: string | null
  template?: Record<string, unknown>
  scoreSurface: ScoreSurface
  scoreInput: ScoreInput
  toScoreInput: (asset: Improved) => ScoreInput
}

async function loadPersona(
  supabase: Supabase,
  projectId: string,
  personaId: string,
  memory: Awaited<ReturnType<typeof getMarketingMemory>>,
): Promise<MarketingPersona | null> {
  if (personaId.startsWith('preset-')) {
    return inferPersonasFromMemory(memory).find((persona) => persona.id === personaId) ?? null
  }

  try {
    const { data } = await supabase
      .from('personas')
      .select('*')
      .eq('project_id', projectId)
      .eq('id', personaId)
      .maybeSingle()
    return data ? normalizePersonaRow(data as Record<string, unknown>) : null
  } catch {
    return null
  }
}

function personaPromptBlock(persona: MarketingPersona): string {
  return [
    `TARGET PERSONA: ${persona.name}${persona.role ? ` (${persona.role})` : ''}`,
    persona.description ? `Description: ${persona.description}` : null,
    persona.painPoints.length ? `Pain points: ${persona.painPoints.join(' | ')}` : null,
    persona.desiredOutcomes.length ? `Desired outcomes: ${persona.desiredOutcomes.join(' | ')}` : null,
    persona.objections.length ? `Objections to overcome: ${persona.objections.join(' | ')}` : null,
    persona.buyingTriggers.length ? `Buying triggers: ${persona.buyingTriggers.join(' | ')}` : null,
    persona.vocabulary.length ? `Use natural vocabulary like: ${persona.vocabulary.slice(0, 12).join(', ')}` : null,
    `Skepticism level: ${persona.skepticismLevel}. ${persona.skepticismLevel === 'high' ? 'Be concrete, sober, and proof-seeking; avoid hype.' : 'Stay specific and useful.'}`,
  ].filter(Boolean).join('\n')
}

async function loadOriginal(
  supabase: Supabase,
  params: { id: string; channel: string; surface: string },
): Promise<OriginalAsset | null> {
  if (params.surface === 'ad') {
    const { data } = await supabase
      .from('ad_copies')
      .select('id, headline, primary_text, cta_button')
      .eq('id', params.id)
      .maybeSingle() as { data: { id: string; headline: string | null; primary_text: string | null; cta_button: string | null } | null }
    if (!data) return null
    return {
      table: 'ad_copies',
      id: data.id,
      title: data.headline ?? 'Ad',
      body: data.primary_text ?? '',
      cta: data.cta_button,
      scoreSurface: 'ad_copy',
      scoreInput: { headline: data.headline, body: data.primary_text, cta: data.cta_button },
      toScoreInput: (asset) => ({ headline: asset.title, body: asset.body, cta: asset.cta ?? data.cta_button }),
    }
  }

  if (params.channel === 'email') {
    const { data } = await supabase
      .from('email_templates')
      .select('id, subject, body_html')
      .eq('id', params.id)
      .maybeSingle() as { data: { id: string; subject: string; body_html: string | null } | null }
    if (!data) return null
    return {
      table: 'email_templates',
      id: data.id,
      title: data.subject,
      body: data.body_html ?? '',
      scoreSurface: 'email',
      scoreInput: { subject: data.subject, body: data.body_html },
      toScoreInput: (asset) => ({ subject: asset.title, previewText: asset.preview_text, body: asset.body, cta: asset.cta }),
    }
  }

  if (params.channel === 'blog' || params.surface === 'blog_post') {
    const { data } = await supabase
      .from('content_pieces')
      .select('id, title, body_markdown, target_keywords')
      .eq('id', params.id)
      .maybeSingle() as { data: { id: string; title: string; body_markdown: string | null; target_keywords: string[] | null } | null }
    if (!data) return null
    const keyword = data.target_keywords?.[0]
    return {
      table: 'content_pieces',
      id: data.id,
      title: data.title,
      body: data.body_markdown ?? '',
      scoreSurface: 'blog',
      scoreInput: { title: data.title, body: data.body_markdown, targetKeyword: keyword },
      toScoreInput: (asset) => ({ title: asset.title, body: asset.body, targetKeyword: keyword }),
    }
  }

  if (params.channel === 'landing') {
    const { data } = await supabase
      .from('landing_pages')
      .select('id, name, template')
      .eq('id', params.id)
      .maybeSingle() as { data: { id: string; name: string; template: Record<string, unknown> | null } | null }
    if (!data) return null
    const template = data.template ?? {}
    return {
      table: 'landing_pages',
      id: data.id,
      title: str(template.headline) || data.name,
      body: [str(template.subheadline), str(template.bodyText)].filter(Boolean).join('\n\n'),
      cta: str(template.ctaText),
      template,
      scoreSurface: 'landing_page',
      scoreInput: { headline: str(template.headline), body: str(template.bodyText), cta: str(template.ctaText) },
      toScoreInput: (asset) => ({ headline: asset.title, body: asset.body, cta: asset.cta ?? str(template.ctaText) }),
    }
  }

  const { data } = await supabase
    .from('social_posts')
    .select('id, content')
    .eq('id', params.id)
    .maybeSingle() as { data: { id: string; content: string | null } | null }
  if (!data) return null
  return {
    table: 'social_posts',
    id: data.id,
    title: `${params.channel} post`,
    body: data.content ?? '',
    scoreSurface: 'social_post',
    scoreInput: { body: data.content },
    toScoreInput: (asset) => ({ title: asset.title, body: asset.body, cta: asset.cta }),
  }
}

async function saveImproved(
  supabase: Supabase,
  original: OriginalAsset,
  improved: Improved,
  score: number,
): Promise<string | null> {
  if (original.table === 'ad_copies') {
    const { error } = await supabase.from('ad_copies').update({
      headline: improved.title,
      primary_text: improved.body,
      cta_button: improved.cta ?? original.cta ?? null,
      weighted_average: score,
    }).eq('id', original.id)
    return error?.message ?? null
  }
  if (original.table === 'social_posts') {
    const { error } = await supabase.from('social_posts').update({ content: improved.body }).eq('id', original.id)
    return error?.message ?? null
  }
  if (original.table === 'email_templates') {
    const { error } = await supabase.from('email_templates').update({ subject: improved.title, body_html: improved.body }).eq('id', original.id)
    return error?.message ?? null
  }
  if (original.table === 'content_pieces') {
    const { error } = await supabase.from('content_pieces').update({
      title: improved.title,
      body_markdown: improved.body,
      seo_score: Math.round(score * 10),
      word_count: improved.body.split(/\s+/).filter(Boolean).length,
    }).eq('id', original.id)
    return error?.message ?? null
  }

  const template = original.template ?? {}
  const { error } = await supabase.from('landing_pages').update({
    template: {
      ...template,
      headline: improved.title,
      bodyText: improved.body,
      ctaText: improved.cta ?? original.cta ?? str(template.ctaText),
    },
  }).eq('id', original.id)
  return error?.message ?? null
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : ''
}
