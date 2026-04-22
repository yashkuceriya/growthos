import { createClient } from '@/lib/supabase/server'
import { generateAdImage } from '@/lib/ai/ad-studio/image-generator'
import { trackAICost } from '@/lib/cost-tracker'

// Gemini 2.5 Flash Image pricing via OpenRouter: ~$0.04 per generated image
const IMAGE_COST_USD = 0.04

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { adCopyId, aspects } = await request.json()
  if (!adCopyId) return Response.json({ error: 'adCopyId required' }, { status: 400 })

  const { data: ad } = await supabase
    .from('ad_copies')
    .select('*, ad_briefs!inner(project_id, platform, projects!inner(brand_voice, name, description, website))')
    .eq('id', adCopyId)
    .single()

  if (!ad) return Response.json({ error: 'Ad not found' }, { status: 404 })

  const brief = (ad as unknown as { ad_briefs: { project_id: string; platform: string; projects: { brand_voice: unknown; name: string; description: string | null; website: string | null } } }).ad_briefs
  const project = brief.projects
  const brandVoice = typeof project.brand_voice === 'object' && project.brand_voice !== null ? project.brand_voice as Record<string, unknown> : {}

  const brandContext = [
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

  const referenceImageUrl: string | null =
    (brandVoice.hero_image_url as string | null) ??
    (Array.isArray(brandVoice.screenshots) ? ((brandVoice.screenshots as string[])[0] ?? null) : null)

  const requested: Array<'1:1' | '9:16' | '1.91:1'> = Array.isArray(aspects) && aspects.length ? aspects : ['1:1', '9:16', '1.91:1']

  const startedAt = Date.now()
  const images: string[] = []

  for (const aspect of requested) {
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
      if (img) images.push(img.dataUrl)
    } catch (err) {
      console.error('Image gen failed for aspect', aspect, err)
    }
  }

  if (images.length === 0) {
    return Response.json({ error: 'All image generations failed. Check OPENROUTER_API_KEY and model availability.' }, { status: 500 })
  }

  await supabase.from('ad_copies').update({ media_urls: images }).eq('id', adCopyId)

  await trackAICost({
    userId: user.id, projectId: brief.project_id,
    module: 'ad_image', model: 'google/gemini-3.1-flash-image-preview',
    costUsd: IMAGE_COST_USD * images.length,
    latencyMs: Date.now() - startedAt,
    metadata: { aspects: requested, count: images.length },
  })

  return Response.json({ images, count: images.length })
}
