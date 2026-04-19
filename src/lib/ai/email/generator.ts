import { generateObject } from 'ai'
import { z } from 'zod'
import { openrouter } from '@/lib/ai/openrouter'

const EmailCopySchema = z.object({
  subject: z.string().describe('Email subject line, compelling and under 60 chars'),
  preview_text: z.string().describe('Preview text shown in inbox, complements subject, under 90 chars'),
  body_html: z.string().describe('Full email body as clean HTML with inline styles'),
})

export type EmailCopy = z.infer<typeof EmailCopySchema>

const MODEL = 'google/gemini-2.0-flash-001'

interface GenerateEmailParams {
  purpose: string
  audience: string
  tone?: string
  brandVoice?: string
  productName?: string
  keyPoints?: string[]
  emailType: 'welcome' | 'nurture' | 'announcement' | 'promotion' | 'followup' | 'custom'
}

export async function generateEmailCopy(params: GenerateEmailParams): Promise<{
  email: EmailCopy
  inputTokens: number
  outputTokens: number
}> {
  const systemPrompt = `You are an expert email marketer who writes high-converting emails.

RULES:
- Subject lines: Under 60 chars, curiosity-driven or benefit-driven, avoid spam trigger words
- Preview text: Under 90 chars, complements (never repeats) the subject line
- Body HTML: Clean, mobile-friendly HTML with inline styles. Use a single-column layout.
- Use short paragraphs (2-3 sentences max)
- Include a clear CTA button styled with inline CSS (background color, padding, border-radius)
- Personalize with {{name}} placeholder where appropriate
- Keep total email under 200 words for maximum engagement
${params.brandVoice ? `\nBRAND VOICE: ${params.brandVoice}` : ''}`

  const keyPointsStr = params.keyPoints?.length
    ? `\nKEY POINTS TO COVER:\n${params.keyPoints.map((p) => `- ${p}`).join('\n')}`
    : ''

  const userMessage = `Write a ${params.emailType} email.

PURPOSE: ${params.purpose}
AUDIENCE: ${params.audience}
${params.productName ? `PRODUCT: ${params.productName}` : ''}
TONE: ${params.tone || 'professional but friendly'}${keyPointsStr}`

  const { object, usage } = await generateObject({
    model: openrouter(MODEL),
    schema: EmailCopySchema,
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }],
  })

  return {
    email: object,
    inputTokens: usage?.inputTokens ?? 0,
    outputTokens: usage?.outputTokens ?? 0,
  }
}
