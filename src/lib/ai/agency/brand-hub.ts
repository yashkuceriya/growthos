import { generateObject } from 'ai'
import { modelFor } from '@/lib/ai/models'
import { z } from 'zod'
import type { LaunchContext } from '@/lib/ai/launch/generators'

export const BrandGuidelinesSchema = z.object({
  positioning_statement: z.string().describe('One-sentence positioning (For [audience] who [need], [product] is [category] that [benefit])'),
  mission: z.string(),
  vision: z.string(),
  brand_values: z.array(z.string()).length(5),
  voice_traits: z.array(z.object({
    trait: z.string().describe('One-word brand voice trait (e.g. "bold", "wry", "empathetic")'),
    description: z.string().describe('How this trait shows up in copy'),
    we_are: z.array(z.string()).length(3).describe('3 descriptors that fit'),
    we_are_not: z.array(z.string()).length(3).describe('3 descriptors that do NOT fit'),
  })).length(4).describe('4 voice traits'),
  tone_by_context: z.object({
    ads: z.string(),
    email: z.string(),
    social: z.string(),
    support: z.string(),
    sales: z.string(),
  }),
  messaging_matrix: z.array(z.object({
    audience_segment: z.string(),
    pain_point: z.string(),
    promise: z.string(),
    proof: z.string(),
    cta: z.string(),
  })).min(2).max(4),
  taglines: z.array(z.string()).length(5).describe('5 tagline candidates, different angles'),
  elevator_pitches: z.object({
    one_liner: z.string().describe('10 words max'),
    tweet: z.string().describe('240 chars max'),
    elevator_30s: z.string().describe('~80 words'),
    investor_pitch: z.string().describe('~150 words'),
  }),
  vocabulary: z.object({
    always_use: z.array(z.string()).describe('Words/phrases that reinforce brand'),
    never_use: z.array(z.string()).describe('Words/phrases that break voice'),
  }),
  story: z.string().describe('2-paragraph brand story — why this exists, who it helps'),
})

export type BrandGuidelines = z.infer<typeof BrandGuidelinesSchema>

export async function generateBrandGuidelines(ctx: LaunchContext): Promise<BrandGuidelines> {
  const res = await generateObject({
    model: modelFor('strategic'),
    schema: BrandGuidelinesSchema,
    system: `You are a senior brand strategist from Koto / Pentagram / Red Antler. Produce a tight, usable brand book — opinionated, specific, not generic. Every field should be ready to ship to a team tomorrow. No corporate mush.`,
    messages: [{ role: 'user', content: `PRODUCT: ${ctx.productName}
TAGLINE: ${ctx.tagline}
VALUE PROP: ${ctx.valueProp}
AUDIENCE: ${ctx.audience}
FEATURES: ${ctx.features.join(' · ')}
DIFFERENTIATORS: ${ctx.differentiators.join(' · ')}
PRICING: ${ctx.pricing}
WEBSITE: ${ctx.website ?? ''}

Produce the complete brand guidelines.` }],
  })
  return res.object
}
