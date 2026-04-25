import { createClient } from '@/lib/supabase/server'
import { generateEmailCopy } from '@/lib/ai/email/generator'
import { trackAICost, estimateCost } from '@/lib/cost-tracker'
import { getFounderVoiceContext } from '@/lib/ai/voice/founder-voice'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { projectId, purpose, audience, tone, brandVoice, productName, keyPoints, emailType } = body

  if (!purpose || !audience || !emailType) {
    return Response.json({ error: 'Missing required fields' }, { status: 400 })
  }

  // Pull proven email patterns — winner-tick promotes top open/click templates
  // into style_references with asset_kind='email_template'.
  const styleContext = await getFounderVoiceContext(user.id, 'email_template').catch(() => '')

  const result = await generateEmailCopy({
    purpose,
    audience,
    tone,
    brandVoice,
    productName,
    keyPoints,
    emailType,
    styleContext: styleContext || undefined,
  })

  const model = 'google/gemini-2.0-flash-001'
  await trackAICost({
    userId: user.id,
    projectId,
    module: 'email_engine',
    stepName: 'generate_email',
    model,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    costUsd: estimateCost(model, result.inputTokens, result.outputTokens),
  })

  return Response.json(result.email)
}
