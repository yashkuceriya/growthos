// Claude as the art director. Reads the captured screenshot of a project
// during ingest, returns structured design tokens that downstream image +
// content generators use as visual ground truth.
//
// Why Claude (not Gemini): Claude's vision is materially better at
// structured-JSON output describing what's IN an image (color palette,
// typography vibe, layout pattern, mood). Gemini Flash is great at
// generating images but worse at this kind of analytical structured
// output. Falls back to Gemini Flash silently if no ANTHROPIC_API_KEY.
//
// Output is stored on projects.brand_voice.design_tokens — every ad
// image / launch generator can reach for it via the existing
// brandVoice JSONB they already read.

import { generateObject } from 'ai'
import { z } from 'zod'
import { modelFor, modelLabel } from '@/lib/ai/models'
import { trackAICost, estimateCost } from '@/lib/cost-tracker'
import type { SupabaseClient } from '@supabase/supabase-js'

export const DesignTokensSchema = z.object({
  color_palette: z.object({
    primary: z.string().describe('Most prominent brand color, hex format like #10b981'),
    secondary: z.string().nullable().describe('Second-most prominent color or null'),
    accent: z.string().nullable().describe('Accent / CTA color used for buttons or highlights'),
    background: z.string().describe('Dominant page background color'),
    text: z.string().describe('Primary body text color'),
  }),
  typography_vibe: z.string().describe(
    'Two-sentence description of the typography style. Mention font weight, contrast, '
    + 'spacing, whether sans/serif/mono. Example: "Heavy-weight sans-serif headlines '
    + 'with generous letter-spacing. Body uses lighter, neutral sans-serif at comfortable line-height."',
  ),
  layout_pattern: z.string().describe(
    'One-sentence description of the page layout. e.g. '
    + '"Centered hero with screenshot anchored below the fold, three-column feature grid, '
    + 'testimonial carousel, CTA-heavy footer."',
  ),
  mood: z.array(z.string()).describe(
    '3-5 mood adjectives. Examples: ["professional", "trustworthy", "playful", "dense", "minimalist"]',
  ),
  ui_elements: z.array(z.string()).describe(
    '3-6 distinctive UI elements visible. Examples: ["rounded buttons with subtle shadows", '
    + '"data tables with alternating row colors", "gradient hero background"]',
  ),
  ad_creative_principles: z.array(z.string()).describe(
    '3-5 specific visual rules an ad creative for this product should follow to feel native. '
    + 'Phrase as imperatives. Example: "Lead with a product screenshot, not a stock photo of a person." '
    + '"Use the brand primary color (#10b981) for accent only, not as background."',
  ),
})

export type DesignTokens = z.infer<typeof DesignTokensSchema>

export interface ExtractArgs {
  supabase: SupabaseClient
  userId: string
  projectId: string
  /** Public URL of the captured screenshot. Must be reachable by Anthropic / OpenRouter. */
  screenshotUrl: string
  /** Brief brand context to anchor the extraction (product name, value prop). */
  brandContext: string
}

export interface ExtractResult {
  tokens: DesignTokens
  modelUsed: string
}

/**
 * Run the Claude (or Gemini-fallback) vision pass and return structured
 * design tokens. Tracks cost via ai_cost_ledger so the ledger reflects
 * the call.
 *
 * Throws on any failure — the caller (runIngest) wraps in try/catch so a
 * failed extract doesn't unwind the rest of ingest.
 */
export async function extractDesignTokens(args: ExtractArgs): Promise<ExtractResult> {
  const startedAt = Date.now()

  const res = await generateObject({
    model: modelFor('vision'),
    schema: DesignTokensSchema,
    system: `You are an art director analyzing a product website screenshot. Your job is to produce design tokens specific enough that another AI could render an ad creative that looks like it belongs to this brand. Be concrete (hex codes, weights, spacing patterns), not vague ("nice" / "modern" / "clean"). If the screenshot is mostly a hero section, infer the rest from what's visible — don't refuse.`,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: `Brand context:
${args.brandContext}

Analyze the attached screenshot and produce design tokens that capture how this product LOOKS. The downstream image generator will use these to make ads that feel native to the brand.`,
          },
          {
            type: 'image',
            image: new URL(args.screenshotUrl),
          },
        ],
      },
    ],
  })

  const modelUsed = modelLabel('vision')

  await trackAICost({
    userId: args.userId,
    projectId: args.projectId,
    module: 'design_extraction',
    model: modelUsed,
    inputTokens: res.usage.inputTokens ?? 0,
    outputTokens: res.usage.outputTokens ?? 0,
    costUsd: estimateCost(modelUsed, res.usage.inputTokens ?? 0, res.usage.outputTokens ?? 0),
    latencyMs: Date.now() - startedAt,
  })

  return { tokens: res.object, modelUsed }
}

/**
 * Render the design tokens as a compact prompt block that's pasted into
 * downstream image / content generation system prompts. Kept separate
 * from extraction so generators can use the cached tokens without
 * re-running vision.
 */
export function designTokensPromptBlock(tokens: DesignTokens): string {
  return `BRAND DESIGN SYSTEM (extracted from the live UI):
- Primary color: ${tokens.color_palette.primary}
- Secondary: ${tokens.color_palette.secondary ?? '(none)'}
- Accent: ${tokens.color_palette.accent ?? '(none)'}
- Background: ${tokens.color_palette.background}
- Body text: ${tokens.color_palette.text}
- Typography: ${tokens.typography_vibe}
- Layout pattern: ${tokens.layout_pattern}
- Mood: ${tokens.mood.join(', ')}
- Distinctive UI: ${tokens.ui_elements.join('; ')}
- Visual rules to follow:
${tokens.ad_creative_principles.map((p, i) => `  ${i + 1}. ${p}`).join('\n')}`
}
