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
import { captureScreenshot } from '@/lib/screenshots/capture'
import { extractDesignTokens } from '@/lib/ai/design/extractor'
import { fetchTextWithGuards } from '@/lib/security/outbound-url'

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

  // Fetch. We send a real-browser-ish User-Agent so sites that 403 on bots
  // are at least less hostile. Sites behind Cloudflare/Akamai bot walls will
  // still 403 or return CAPTCHA HTML; we detect the latter and surface a
  // useful error rather than feeding gibberish to the LLM.
  const { body: html, status: fetchStatus, finalUrl } = await fetchTextWithGuards(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 GrowthOS/1.0',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
    },
    timeoutMs: 20_000,
    maxRedirects: 4,
    maxBytes: 2_000_000,
  })
  if (fetchStatus < 200 || fetchStatus >= 300) {
    if (fetchStatus === 403 || fetchStatus === 429) {
      throw new Error(`Failed to fetch site: ${fetchStatus} — site blocks automated crawlers. Try a different URL or set the brand voice manually.`)
    }
    throw new Error(`Failed to fetch site: HTTP ${fetchStatus}`)
  }
  // Cloudflare/CAPTCHA walls return 200 with a "Just a moment..." interstitial.
  // If the page is essentially empty of marketing content, bail with a clear msg.
  if (html.length < 500 || /just a moment|cf-browser-verification|attention required/i.test(html.slice(0, 4000))) {
    throw new Error('Failed to fetch site: the page returned a bot-protection challenge. Set the brand voice manually for this URL.')
  }

  // Crude image + text extraction
  const imgMatches = [...html.matchAll(/<img[^>]+src=["']([^"']+)["']/gi)].map((m) => absoluteUrl(m[1]!, finalUrl))
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
      content: `URL: ${finalUrl}

Absolute image URLs found on the page (choose from these for logo/hero/screenshots; pick the most relevant, prefer product screenshots over stock photos):
${imgMatches.slice(0, 40).join('\n')}

HTML (trimmed):
${trimmed}`,
    }],
  })

  const normalized = {
    ...object,
    logo_url: object.logo_url ? absoluteUrl(object.logo_url, finalUrl) : null,
    hero_image_url: object.hero_image_url ? absoluteUrl(object.hero_image_url, finalUrl) : null,
    screenshots: object.screenshots.map((s) => absoluteUrl(s, finalUrl)),
    source_url: finalUrl,
    ingested_at: new Date().toISOString(),
  }

  // Pull project name/description/website for the classifier context AND so
  // we can decide whether to update the website column (only when it's empty
  // — never silently rewrite a user-set value just because an API caller
  // passed a different override).
  const { data: existing } = await supabase
    .from('projects')
    .select('name, description, website')
    .eq('id', projectId)
    .maybeSingle() as { data: { name: string; description: string | null; website: string | null } | null }

  let classification = null
  try {
    classification = await classifyProduct({
      name: existing?.name ?? '',
      description: existing?.description ?? null,
      website: finalUrl,
      brandVoice: normalized,
      html: trimmed,
    })
  } catch (e) {
    console.error('[ingest] classifier failed:', e)
  }

  const patch: Record<string, unknown> = { ...normalized }
  if (classification) patch.classification = classification

  // Fresh-rendered screenshot — provider-dependent (no-op without env key).
  // Stored on brand_voice so downstream content generation (ad images,
  // landing pages) can use it as visual ground truth instead of relying
  // on whatever marketing image was already in the page HTML.
  let capturedScreenshotUrl: string | null = null
  try {
    const shot = await captureScreenshot(supabase, userId, projectId, finalUrl)
    if (shot) {
      patch.captured_screenshot = {
        url: shot.url,
        mirrored: shot.mirrored,
        captured_at: shot.capturedAt,
      }
      capturedScreenshotUrl = shot.url
    }
  } catch (e) {
    // Screenshot is enrichment, not a hard requirement. Log + continue.
    console.error('[ingest] screenshot capture errored:', e instanceof Error ? e.message : e)
  }

  // Claude vision pass: extract structured design tokens from the
  // captured screenshot. The image generator + landing-page generator
  // read brand_voice.design_tokens and inject them as a prompt block
  // so creatives feel native to the brand. Skipped if no screenshot
  // landed (capture failed or no provider). Errors don't unwind ingest.
  if (capturedScreenshotUrl && (object.tagline || object.value_proposition)) {
    try {
      const { tokens, modelUsed } = await extractDesignTokens({
        supabase,
        userId,
        projectId,
        screenshotUrl: capturedScreenshotUrl,
        brandContext: `${object.tagline ?? ''} — ${object.value_proposition ?? ''}`,
      })
      patch.design_tokens = {
        ...tokens,
        extracted_at: new Date().toISOString(),
        model: modelUsed,
      }
    } catch (e) {
      console.error('[ingest] design-token extraction errored:', e instanceof Error ? e.message : e)
    }
  }

  await mergeBrandVoice(supabase, projectId, patch)

  // Backfill the project's description from the value_proposition we just
  // discovered, but only if the user hasn't set one — never overwrite their
  // words. Same policy for website: only stamp it when it was empty so a
  // misconfigured API caller can't silently mutate a project's canonical
  // domain via the override parameter on /api/v1/projects/:id/ingest.
  const projectUpdate: Record<string, unknown> = {}
  if (!existing?.website) projectUpdate.website = finalUrl
  if (!existing?.description && typeof normalized.value_proposition === 'string' && normalized.value_proposition.length > 0) {
    projectUpdate.description = normalized.value_proposition.slice(0, 500)
  }
  if (Object.keys(projectUpdate).length > 0) {
    await supabase.from('projects').update(projectUpdate).eq('id', projectId)
  }

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
