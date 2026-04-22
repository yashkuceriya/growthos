import { generateAdImage } from '@/lib/ai/ad-studio/image-generator'
import { trackAICost, trackFromUsage } from '@/lib/cost-tracker'
import type { LaunchContext } from './generators'

export interface TrackOpts {
  userId: string
  projectId: string
}

/** Track a generateObject result's token usage against a module. Safe no-op if track undefined. */
export async function trackGen(
  track: TrackOpts | undefined,
  module: string,
  model: string,
  usage: { inputTokens?: number; outputTokens?: number } | undefined,
  startedAt: number,
) {
  if (!track) return
  await trackFromUsage({
    userId: track.userId,
    projectId: track.projectId,
    module,
    model,
    usage,
    latencyMs: Date.now() - startedAt,
  })
}

export async function withRetries<T>(
  fn: () => Promise<T>,
  label: string,
  maxRetries = 2,
): Promise<T> {
  let lastErr: unknown
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastErr = err
      if (attempt < maxRetries) {
        const delay = 500 * Math.pow(2, attempt)
        console.warn(`[launch][${label}] attempt ${attempt + 1} failed, retrying in ${delay}ms:`, err instanceof Error ? err.message : err)
        await new Promise((r) => setTimeout(r, delay))
      }
    }
  }
  throw lastErr
}

export function brandContextFromCtx(ctx: LaunchContext): string {
  return [
    `Product: ${ctx.productName}`,
    `Tagline: ${ctx.tagline}`,
    `Value: ${ctx.valueProp.split('\n\n')[0]}`,
    ctx.audience ? `Audience: ${ctx.audience}` : '',
    ctx.features.length ? `Features: ${ctx.features.join(' · ')}` : '',
    `Tone: ${ctx.tone}`,
    `Primary color: ${ctx.primaryColor}`,
    ctx.website ? `Site: ${ctx.website}` : '',
  ].filter(Boolean).join('\n')
}

export interface AdImageChainParams {
  adCopyId: string
  headline: string
  description?: string | null
  primaryText?: string | null
  platform: string
  brandContext: string
  referenceImageUrl?: string | null
  aspects: Array<'1:1' | '9:16' | '1.91:1'>
}

export async function generateAdImagesForCopy(
  params: AdImageChainParams,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
  projectId: string,
): Promise<{ saved: number; failed: number }> {
  const startedAt = Date.now()

  const results = await Promise.allSettled(
    params.aspects.map((aspect) =>
      generateAdImage({
        headline: params.headline,
        description: params.description,
        primaryText: params.primaryText,
        platform: params.platform,
        brandContext: params.brandContext,
        referenceImageUrl: params.referenceImageUrl,
        aspect,
      }),
    ),
  )

  const images: string[] = []
  let failed = 0
  for (const r of results) {
    if (r.status === 'fulfilled' && r.value) images.push(r.value.dataUrl)
    else failed++
  }

  if (images.length > 0) {
    await supabase.from('ad_copies').update({ media_urls: images }).eq('id', params.adCopyId)
    await trackAICost({
      userId,
      projectId,
      module: 'launch_ad_image',
      model: 'google/gemini-3.1-flash-image-preview',
      costUsd: 0.04 * images.length,
      latencyMs: Date.now() - startedAt,
      metadata: { adCopyId: params.adCopyId, aspects: params.aspects, saved: images.length, failed },
    })
  }

  return { saved: images.length, failed }
}
