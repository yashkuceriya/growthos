// Shared ingest core. Both the dashboard route (session-authed) and the v1
// public API route (api-key-authed) call into this — they only differ in how
// they prove the caller owns the project, not in the actual crawl/extract/
// merge work.

import { openrouter } from '@/lib/ai/openrouter'
import { generateObject } from 'ai'
import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import { trackAICost, estimateCost } from '@/lib/cost-tracker'
import { classifyProduct } from '@/lib/ai/intelligence/classifier'
import { mergeBrandVoice } from '@/lib/brand-voice'

export const BrandSchema = z.object({
  tagline: z.string().describe('Primary tagline or H1 headline from the page'),
  value_proposition: z.string().describe('One-sentence description of what the product does and for whom'),
  target_audience: z.string().describe('Who this product is for'),
  key_features: z.array(z.string()).describe('3-6 concrete features or benefits'),
  differentiators: z.array(z.string()).describe('What makes this different from competitors'),
  pricing: z.string().describe('Pricing summary if available, else "Not found"'),
  testimonials: z.array(z.string()).describe('User quotes or testimonials on the page'),
  tone_of_voice: z.string().describe('The brand tone (e.g. professional, playful, authoritative)'),
  primary_color: z.string().describe('Primary brand color as hex (e.g. #10b981), or best guess'),
  logo_url: z.string().nullable().describe('Absolute URL to the logo image if identifiable'),
  hero_image_url: z.string().nullable().describe('Absolute URL to the main hero/product screenshot image'),
  screenshots: z.array(z.string()).describe('Absolute URLs of product screenshots visible on the page'),
  ctas: z.array(z.string()).describe('Call-to-action button text present on the page'),
})
export type Brand = z.infer<typeof BrandSchema>

function absoluteUrl(src: string, base: string): string {
  try { return new URL(src, base).toString() } catch { return src }
}

export interface IngestArgs {
  supabase: SupabaseClient
  userId: string
  projectId: string
  url: string
}

export interface IngestResult {
  brand: Record<string, unknown>
}

/**
 * Crawl a URL, extract brand info via Gemini, classify the product, merge
 * everything into projects.brand_voice atomically, and track the cost.
 * Throws on any failure — callers wrap in try/catch and respond with the
 * appropriate HTTP status.
 */
export async function runIngest(args: IngestArgs): Promise<IngestResult> {
  const { supabase, userId, projectId, url } = args

  // Fetch
  let html = ''
  const fetchRes = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 GrowthOS/1.0' } })
  if (!fetchRes.ok) throw new Error(`Failed to fetch site: HTTP ${fetchRes.status}`)
  html = await fetchRes.text()

  // Crude image + text extraction
  const imgMatches = [...html.matchAll(/<img[^>]+src=["']([^"']+)["']/gi)].map((m) => absoluteUrl(m[1]!, url))
  const trimmed = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .slice(0, 40_000)

  const startedAt = Date.now()
  const { object, usage } = await generateObject({
    model: openrouter('google/gemini-2.0-flash-001'),
    schema: BrandSchema,
    system: `You extract structured brand info from a product landing page HTML. Return concrete facts grounded in the page content. For image URLs, choose from the list the user will provide and return absolute URLs. If the page has no testimonials or pricing, return "Not found" or empty arrays as appropriate.`,
    messages: [{
      role: 'user',
      content: `URL: ${url}

Absolute image URLs found on the page (choose from these for logo/hero/screenshots; pick the most relevant, prefer product screenshots over stock photos):
${imgMatches.slice(0, 40).join('\n')}

HTML (trimmed):
${trimmed}`,
    }],
  })

  const normalized = {
    ...object,
    logo_url: object.logo_url ? absoluteUrl(object.logo_url, url) : null,
    hero_image_url: object.hero_image_url ? absoluteUrl(object.hero_image_url, url) : null,
    screenshots: object.screenshots.map((s) => absoluteUrl(s, url)),
    source_url: url,
    ingested_at: new Date().toISOString(),
  }

  // Pull project name/description for the classifier context
  const { data: existing } = await supabase
    .from('projects')
    .select('name, description')
    .eq('id', projectId)
    .single()

  let classification = null
  try {
    classification = await classifyProduct({
      name: existing?.name ?? '',
      description: existing?.description ?? null,
      website: url,
      brandVoice: normalized,
      html: trimmed,
    })
  } catch (e) {
    console.error('[ingest] classifier failed:', e)
  }

  const patch: Record<string, unknown> = { ...normalized }
  if (classification) patch.classification = classification

  await mergeBrandVoice(supabase, projectId, patch)
  await supabase.from('projects').update({ website: url }).eq('id', projectId)

  await trackAICost({
    userId,
    projectId,
    module: 'site_ingest',
    model: 'google/gemini-2.0-flash-001',
    inputTokens: usage.inputTokens ?? 0,
    outputTokens: usage.outputTokens ?? 0,
    costUsd: estimateCost('google/gemini-2.0-flash-001', usage.inputTokens ?? 0, usage.outputTokens ?? 0),
    latencyMs: Date.now() - startedAt,
  })

  return { brand: patch }
}
