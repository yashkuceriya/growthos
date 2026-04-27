import { createClient, createServiceClient } from '@/lib/supabase/server'
import { generateAdImage } from '@/lib/ai/ad-studio/image-generator'
import { trackAICost } from '@/lib/cost-tracker'
import { modeBlock } from '@/lib/ai/creative/modes'
import { uploadAdImage } from '@/lib/storage/images'

// Gemini Flash Image pricing via OpenRouter: ~$0.04 per generated image
const IMAGE_COST_USD = 0.04

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { adCopyId, aspects } = await request.json()
  if (!adCopyId) return Response.json({ error: 'adCopyId required' }, { status: 400 })

  const { data: ad } = await supabase
    .from('ad_copies')
    .select('*, ad_briefs!inner(project_id, platform, creative_mode, projects!inner(brand_voice, name, description, website))')
    .eq('id', adCopyId)
    .maybeSingle()

  if (!ad) return Response.json({ error: 'Ad not found' }, { status: 404 })

  const brief = (ad as unknown as {
    ad_briefs: {
      project_id: string
      platform: string
      creative_mode: string | null
      projects: { brand_voice: unknown; name: string; description: string | null; website: string | null }
    }
  }).ad_briefs
  const project = brief.projects
  const brandVoice = typeof project.brand_voice === 'object' && project.brand_voice !== null
    ? project.brand_voice as Record<string, unknown>
    : {}

  // Brand context the image model sees. We append the visual directive of the
  // brief's creative_mode so a "funny" ad gets funny visuals, "shocking" gets
  // shocking visuals, etc. This was missing — image gen ignored the mode the
  // copy was generated under, producing tonal mismatch.
  const baseContext = [
    `Product: ${project.name}`,
    project.description ? `What it does: ${project.description}` : '',
    brandVoice.tagline ? `Tagline: ${brandVoice.tagline}` : '',
    brandVoice.value_proposition ? `Value: ${brandVoice.value_proposition}` : '',
    brandVoice.target_audience ? `Audience: ${brandVoice.target_audience}` : '',
    Array.isArray(brandVoice.key_features) && brandVoice.key_features.length ? `Features: ${(brandVoice.key_features as string[]).join(' · ')}` : '',
    brandVoice.tone_of_voice ? `Tone: ${brandVoice.tone_of_voice}` : '',
    brandVoice.primary_color ? `Primary color: ${brandVoice.primary_color}` : '',
    project.website ? `Site: ${project.website}` : '',
  ].filter(Boolean).join('\n')

  const brandContext = baseContext + modeBlock(brief.creative_mode, 'visual')

  // Reference-image priority: a fresh-rendered captured screenshot beats
  // the marketing-curated hero image, because the captured shot reflects
  // the actual current UI. Falls back to hero, then to any embedded
  // screenshot, then nothing.
  const captured = (brandVoice.captured_screenshot as { url?: string } | undefined)?.url ?? null
  const referenceImageUrl: string | null =
    captured ??
    (brandVoice.hero_image_url as string | null) ??
    (Array.isArray(brandVoice.screenshots) ? ((brandVoice.screenshots as string[])[0] ?? null) : null)

  const requested: Array<'1:1' | '9:16' | '1.91:1'> =
    Array.isArray(aspects) && aspects.length ? aspects : ['1:1', '9:16', '1.91:1']

  const startedAt = Date.now()
  // Service client is used for Storage uploads — bucket policies handle
  // access; RLS on storage.objects is bypassed by service role.
  const service = createServiceClient()
  const urls: string[] = []

  for (const [idx, aspect] of requested.entries()) {
    try {
      const img = await generateAdImage({
        headline: ad.headline ?? '',
        description: ad.description,
        primaryText: ad.primary_text,
        platform: brief.platform,
        brandContext,
        referenceImageUrl,
        aspect,
      })
      if (!img) continue
      // Upload the data URL to Storage. Helper falls back to the data URL on
      // failure so we never drop the generated image — we just take the row
      // bloat hit when Storage isn't configured.
      const persistedUrl = await uploadAdImage({
        supabase: service,
        userId: user.id,
        adCopyId,
        aspect,
        source: img.dataUrl,
        index: idx,
      })
      urls.push(persistedUrl)
    } catch (err) {
      console.error('Image gen failed for aspect', aspect, err)
    }
  }

  if (urls.length === 0) {
    return Response.json(
      { error: 'All image generations failed. Check OPENROUTER_API_KEY and model availability.' },
      { status: 500 },
    )
  }

  await supabase.from('ad_copies').update({ media_urls: urls }).eq('id', adCopyId)

  await trackAICost({
    userId: user.id,
    projectId: brief.project_id,
    module: 'ad_image',
    model: 'google/gemini-3.1-flash-image-preview',
    costUsd: IMAGE_COST_USD * urls.length,
    latencyMs: Date.now() - startedAt,
    metadata: { aspects: requested, count: urls.length, mode: brief.creative_mode ?? null },
  })

  return Response.json({ images: urls, count: urls.length })
}
