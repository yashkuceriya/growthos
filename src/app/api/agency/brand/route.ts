import { createClient } from '@/lib/supabase/server'
import { generateBrandGuidelines } from '@/lib/ai/agency/brand-hub'
import { trackAICost } from '@/lib/cost-tracker'
import type { LaunchContext } from '@/lib/ai/launch/generators'
import { mergeBrandVoice } from '@/lib/brand-voice'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { projectId } = await request.json()
  if (!projectId) return Response.json({ error: 'projectId required' }, { status: 400 })

  const { data: project } = await supabase
    .from('projects')
    .select('id, name, description, website, brand_voice')
    .eq('id', projectId).single()
  if (!project) return Response.json({ error: 'Not found' }, { status: 404 })

  const bv = (project.brand_voice as Record<string, unknown>) ?? {}
  const ctx: LaunchContext = {
    productName: project.name,
    tagline: (bv.tagline as string) ?? project.name,
    valueProp: (bv.value_proposition as string) ?? project.description ?? '',
    audience: (bv.target_audience as string) ?? '',
    features: (bv.key_features as string[]) ?? [],
    differentiators: (bv.differentiators as string[]) ?? [],
    pricing: (bv.pricing as string) ?? 'Not specified',
    tone: (bv.tone_of_voice as string) ?? 'professional',
    primaryColor: (bv.primary_color as string) ?? '#10b981',
    heroImageUrl: (bv.hero_image_url as string) ?? null,
    website: project.website ?? null,
  }

  const startedAt = Date.now()
  const guidelines = await generateBrandGuidelines(ctx)

  // Atomic shallow merge via RPC — concurrent agency writes won't clobber each other
  await mergeBrandVoice(supabase, projectId, { guidelines, guidelines_generated_at: new Date().toISOString() })

  await trackAICost({
    userId: user.id, projectId, module: 'agency_brand',
    costUsd: 0.08, latencyMs: Date.now() - startedAt,
  })

  return Response.json({ guidelines })
}
