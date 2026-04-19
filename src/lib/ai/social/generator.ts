import { generateObject } from 'ai'
import { z } from 'zod'
import { openrouter } from '@/lib/ai/openrouter'

const SocialPostSchema = z.object({
  content: z.string().describe('The full post text, platform-optimized'),
  hashtags: z.array(z.string()).describe('Relevant hashtags without # prefix'),
  suggested_media: z.string().describe('Description of ideal image/video to pair with this post'),
})

export type SocialPost = z.infer<typeof SocialPostSchema>

const MODEL = 'google/gemini-2.0-flash-001'

const PLATFORM_LIMITS: Record<string, { maxChars: number; hashtagAdvice: string }> = {
  twitter: { maxChars: 280, hashtagAdvice: '1-2 hashtags max, integrated naturally' },
  linkedin: { maxChars: 3000, hashtagAdvice: '3-5 hashtags at the end' },
  instagram: { maxChars: 2200, hashtagAdvice: '5-10 relevant hashtags in first comment or end' },
}

interface GenerateSocialParams {
  platform: 'twitter' | 'linkedin' | 'instagram'
  topic: string
  audience?: string
  tone?: string
  brandVoice?: string
  contentType?: 'educational' | 'promotional' | 'engaging' | 'announcement' | 'behind_the_scenes'
}

export async function generateSocialPost(params: GenerateSocialParams): Promise<{
  post: SocialPost
  inputTokens: number
  outputTokens: number
}> {
  const limits = PLATFORM_LIMITS[params.platform] ?? PLATFORM_LIMITS.twitter

  const systemPrompt = `You are an expert social media content creator.

PLATFORM: ${params.platform.toUpperCase()}
- Max characters: ${limits.maxChars}
- Hashtag strategy: ${limits.hashtagAdvice}

RULES:
- Write native-feeling content (not corporate/promotional)
- ${params.platform === 'twitter' ? 'Be concise and punchy. Every word counts.' : ''}
- ${params.platform === 'linkedin' ? 'Use line breaks for readability. Start with a hook line. End with a question to drive engagement.' : ''}
- ${params.platform === 'instagram' ? 'Lead with a strong hook. Use emojis sparingly (2-3). End with a CTA.' : ''}
- Do NOT include hashtags in the content field — put them in the hashtags array
${params.brandVoice ? `\nBRAND VOICE: ${params.brandVoice}` : ''}`

  const userMessage = `Create a ${params.contentType || 'engaging'} ${params.platform} post.

TOPIC: ${params.topic}
${params.audience ? `AUDIENCE: ${params.audience}` : ''}
TONE: ${params.tone || 'authentic and conversational'}`

  const { object, usage } = await generateObject({
    model: openrouter(MODEL),
    schema: SocialPostSchema,
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }],
  })

  return {
    post: object,
    inputTokens: usage?.inputTokens ?? 0,
    outputTokens: usage?.outputTokens ?? 0,
  }
}
