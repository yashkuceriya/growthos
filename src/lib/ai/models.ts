// Central model router. Strategic tasks → Claude Sonnet (if key present), else Gemini.
// Production tasks always → Gemini (cheap, fast, great at high-volume short copy).
// Images → Gemini Flash Image.
// Vision/design extraction → Claude (best structured-vision output we have).

import { createOpenAI } from '@ai-sdk/openai'
import { createAnthropic } from '@ai-sdk/anthropic'

export const openrouter = createOpenAI({
  apiKey: process.env.OPENROUTER_API_KEY!,
  baseURL: 'https://openrouter.ai/api/v1',
  headers: {
    'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
    'X-Title': 'GrowthOS',
  },
})

// Direct Anthropic client (preferred for strategic agents when key present)
export const anthropic = process.env.ANTHROPIC_API_KEY
  ? createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null

// Bumping these is the highest-leverage knob in the codebase — every
// generated asset routes through one. After changing, eyeball
// /ad-studio/generate and /launch to confirm output quality didn't
// regress.
export const MODEL_GEMINI_PRODUCTION = 'google/gemini-2.5-flash'
export const MODEL_GEMINI_IMAGE = 'google/gemini-3.1-flash-image-preview'
export const MODEL_CLAUDE_STRATEGIC = 'claude-sonnet-4-6'
// Vision model used for design-token extraction from captured screenshots.
// Same Claude SKU as strategic — pinning separately so we can swap without
// touching strategic-agent paths.
export const MODEL_CLAUDE_VISION = 'claude-sonnet-4-6'

/**
 * Pick the model for the task.
 * - 'strategic': CMO, Director, SEO strategist, Blog long-form, Competitive Intel, Brand Hub
 * - 'production': Meta ad, Twitter, TikTok, Reddit, Email, Landing, LinkedIn copy
 * - 'vision': design-token extraction from screenshots; falls back to
 *   Gemini 2.5 Flash (also multimodal) if no Anthropic key
 */
export function modelFor(task: 'strategic' | 'production' | 'vision') {
  if (task === 'strategic' && anthropic) {
    return anthropic(MODEL_CLAUDE_STRATEGIC)
  }
  if (task === 'vision' && anthropic) {
    return anthropic(MODEL_CLAUDE_VISION)
  }
  return openrouter(MODEL_GEMINI_PRODUCTION)
}

export function modelLabel(task: 'strategic' | 'production' | 'vision'): string {
  if (task === 'strategic' && anthropic) return MODEL_CLAUDE_STRATEGIC
  if (task === 'vision' && anthropic) return MODEL_CLAUDE_VISION
  return MODEL_GEMINI_PRODUCTION
}
