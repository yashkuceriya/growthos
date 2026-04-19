import { createClient } from '@/lib/supabase/server'
import { generateEmailCopy } from '@/lib/ai/email/generator'
import { trackAICost, estimateCost } from '@/lib/cost-tracker'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { projectId, purpose, audience, tone, brandVoice, productName, keyPoints, emailType } = body

  if (!purpose || !audience || !emailType) {
    return Response.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const result = await generateEmailCopy({
    purpose,
    audience,
    tone,
    brandVoice,
    productName,
    keyPoints,
    emailType,
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
