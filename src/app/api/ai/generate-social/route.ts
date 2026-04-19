import { createClient } from '@/lib/supabase/server'
import { generateSocialPost } from '@/lib/ai/social/generator'
import { trackAICost, estimateCost } from '@/lib/cost-tracker'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { projectId, platform, topic, audience, tone, brandVoice, contentType } = body

  if (!platform || !topic) {
    return Response.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const result = await generateSocialPost({
    platform,
    topic,
    audience,
    tone,
    brandVoice,
    contentType,
  })

  const model = 'google/gemini-2.0-flash-001'
  await trackAICost({
    userId: user.id,
    projectId,
    module: 'social_scheduler',
    stepName: 'generate_post',
    model,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    costUsd: estimateCost(model, result.inputTokens, result.outputTokens),
  })

  return Response.json(result.post)
}
