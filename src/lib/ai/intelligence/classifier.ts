import { generateObject } from 'ai'
import { modelFor } from '@/lib/ai/models'
import { z } from 'zod'

export const VERTICALS = [
  'b2b_saas', 'b2c_saas', 'ecommerce', 'marketplace', 'mobile_app',
  'dev_tool', 'creator_info', 'local_business', 'services', 'ai_product',
  'healthcare', 'fintech', 'edu', 'nonprofit', 'crypto', 'other',
] as const
export type Vertical = typeof VERTICALS[number]

export const ClassificationSchema = z.object({
  vertical: z.enum(VERTICALS),
  vertical_confidence: z.number().min(0).max(1),
  business_model: z.enum(['subscription', 'transactional', 'freemium', 'ads', 'affiliate', 'donations', 'services_retainer', 'marketplace_commission', 'other']),
  target_market: z.enum(['consumer', 'prosumer', 'smb', 'mid_market', 'enterprise', 'developer', 'creator']),
  stage: z.enum(['pre_launch', 'beta', 'launched', 'scaling', 'mature']),
  primary_goal: z.enum(['awareness', 'signups', 'revenue', 'retention', 'engagement', 'calls_bookings']),
  geography: z.enum(['global', 'regional', 'country', 'local_city']),
  compliance_flags: z.array(z.enum(['gdpr', 'ccpa', 'hipaa', 'coppa', 'ftc', 'sec', 'can_spam', 'crypto_disclaimer', 'medical_claims', 'none'])),
  pricing_tier: z.enum(['free', 'low_ticket_under_50', 'mid_ticket_50_500', 'high_ticket_over_500', 'enterprise_custom', 'unknown']),
  key_competitors: z.array(z.string()).max(5),
  ideal_customer_profile: z.string().describe('One-sentence ICP'),
  rationale: z.string().describe('Why you chose this vertical + model'),
})
export type Classification = z.infer<typeof ClassificationSchema>

export async function classifyProduct(args: {
  name: string
  description: string | null
  website: string | null
  brandVoice: Record<string, unknown>
  html?: string
}): Promise<Classification> {
  const bv = args.brandVoice
  const ctx = `NAME: ${args.name}
DESCRIPTION: ${args.description ?? ''}
WEBSITE: ${args.website ?? ''}
TAGLINE: ${bv.tagline ?? ''}
VALUE PROP: ${bv.value_proposition ?? ''}
AUDIENCE: ${bv.target_audience ?? ''}
FEATURES: ${Array.isArray(bv.key_features) ? (bv.key_features as string[]).join(' · ') : ''}
PRICING: ${bv.pricing ?? ''}
${args.html ? `\nSITE HTML (trimmed):\n${args.html.slice(0, 15000)}` : ''}`

  const res = await generateObject({
    model: modelFor('strategic'),
    schema: ClassificationSchema,
    system: `You are a product analyst. Classify the product into the most accurate vertical, business model, stage, and compliance context. Be specific, not generic. If uncertain, pick the closest match and lower the confidence score.`,
    messages: [{ role: 'user', content: ctx }],
  })
  return res.object
}
