import { createClient } from '@/lib/supabase/server'
import { generateSocialPost } from '@/lib/ai/social/generator'
import { trackAICost, estimateCost } from '@/lib/cost-tracker'
import { getFounderVoiceContext } from '@/lib/ai/voice/founder-voice'
import { modeBlock } from '@/lib/ai/creative/modes'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { projectId, platform, topic, audience, tone, brandVoice, contentType, creativeMode } = body

  if (!platform || !topic) {
    return Response.json({ error: 'Missing required fields' }, { status: 400 })
  }

  // Pull proven style refs for this platform — winning posts that the
  // winner-tick cron promoted feed back into future drafts. Append the
  // creative-mode directive so a "funny twitter post" generation injects
  // both the proven patterns AND the funny-mode angle.
  const baseStyle = await getFounderVoiceContext(user.id, `${platform}_post`).catch(() => '')
  const styleContext = (baseStyle + modeBlock(creativeMode, 'copy')).trim() || undefined

  const result = await generateSocialPost({
    platform,
    topic,
    audience,
    tone,
    brandVoice,
    contentType,
    styleContext,
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
