import type { MarketingMemory, MemorySurface } from './memory'
import { scorePersonaFit, type MarketingPersona } from './personas'

export interface GeneratedAssetInput {
  title?: string | null
  headline?: string | null
  subject?: string | null
  previewText?: string | null
  body?: string | null
  cta?: string | null
  hashtags?: string[] | null
  targetKeyword?: string | null
}

export interface QualityDimension {
  score: number
  rationale: string
}

export interface GeneratedQualityScore {
  overall: number
  dimensions: {
    clarity: QualityDimension
    audienceFit: QualityDimension
    channelFit: QualityDimension
    specificity: QualityDimension
    conversionIntent: QualityDimension
    personaFit?: QualityDimension
  }
  recommendations: string[]
}

const VAGUE_WORDS = ['innovative', 'revolutionary', 'seamless', 'powerful', 'game-changing', 'cutting-edge']
const CTA_WORDS = ['start', 'try', 'book', 'join', 'download', 'learn', 'get', 'reply', 'sign up', 'claim', 'schedule']

export function scoreGeneratedAsset(
  surface: MemorySurface,
  input: GeneratedAssetInput,
  memory?: MarketingMemory | null,
  persona?: MarketingPersona | null,
): GeneratedQualityScore {
  const text = compact([input.title, input.headline, input.subject, input.previewText, input.body, input.cta].join(' '))
  const lower = text.toLowerCase()
  const words = lower.split(/\s+/).filter(Boolean)

  const clarity = scoreClarity(surface, text, words)
  const audienceFit = scoreAudienceFit(lower, memory)
  const channelFit = scoreChannelFit(surface, input, text)
  const specificity = scoreSpecificity(lower, memory)
  const conversionIntent = scoreConversionIntent(lower, input.cta)
  const personaFit = persona ? scorePersonaDimension(text, persona) : undefined

  const dimensions = { clarity, audienceFit, channelFit, specificity, conversionIntent, ...(personaFit ? { personaFit } : {}) }
  const baseOverall = round(
    clarity.score * 0.22 +
    audienceFit.score * 0.22 +
    channelFit.score * 0.18 +
    specificity.score * 0.18 +
    conversionIntent.score * 0.20,
  )
  const overall = personaFit ? round(baseOverall * 0.82 + personaFit.score * 0.18) : baseOverall

  return {
    overall,
    dimensions,
    recommendations: recommendations(dimensions),
  }
}

function scorePersonaDimension(text: string, persona: MarketingPersona): QualityDimension {
  const fit = scorePersonaFit(text, persona)
  return {
    score: fit.score,
    rationale: fit.misses.length
      ? `${fit.rationale} Missing ${fit.misses.join(', ')} signal.`
      : fit.rationale,
  }
}

function scoreClarity(surface: MemorySurface, text: string, words: string[]): QualityDimension {
  let score = 8
  const firstSentence = text.split(/[.!?]/)[0] ?? text
  if (firstSentence.length > 160) score -= 1.5
  if (words.length < 8) score -= 1
  if (words.length > maxWordCount(surface)) score -= 1.5
  const vagueHits = VAGUE_WORDS.filter((word) => text.toLowerCase().includes(word))
  if (vagueHits.length) score -= Math.min(2, vagueHits.length * 0.6)
  return {
    score: clamp(score),
    rationale: vagueHits.length
      ? `Mostly clear, but vague words appear: ${vagueHits.join(', ')}.`
      : 'Message is direct and easy to scan.',
  }
}

function scoreAudienceFit(text: string, memory?: MarketingMemory | null): QualityDimension {
  const audienceTerms = [
    memory?.brand.audience,
    memory?.classification.icp,
    memory?.classification.targetMarket,
    memory?.classification.vertical,
  ]
    .flatMap((value) => keywords(value))
    .filter((value, index, arr) => value.length > 3 && arr.indexOf(value) === index)

  if (!audienceTerms.length) {
    return { score: 6.5, rationale: 'No audience memory available, so fit is judged conservatively.' }
  }

  const hits = audienceTerms.filter((term) => text.includes(term))
  return {
    score: clamp(5.8 + hits.length * 1.1),
    rationale: hits.length
      ? `Uses audience language: ${hits.slice(0, 4).join(', ')}.`
      : 'Does not clearly echo the stored audience or ICP language.',
  }
}

function scoreChannelFit(surface: MemorySurface, input: GeneratedAssetInput, text: string): QualityDimension {
  if (surface === 'social_post') {
    if (text.length > 3000) return { score: 4.5, rationale: 'Social post is too long for native scanning.' }
    if ((input.hashtags?.length ?? 0) > 10) return { score: 5.5, rationale: 'Too many hashtags for a focused post.' }
    return { score: text.length <= 280 ? 8.5 : 7.6, rationale: 'Length and hashtag usage fit social distribution.' }
  }

  if (surface === 'email') {
    const subjectLength = input.subject?.length ?? 0
    const previewLength = input.previewText?.length ?? 0
    let score = 8
    if (subjectLength > 60) score -= 1.2
    if (previewLength > 90) score -= 1
    return { score: clamp(score), rationale: 'Email structure is judged on subject, preview, and concise body fit.' }
  }

  if (surface === 'blog') {
    const hasHeading = /^## /m.test(input.body ?? '')
    const keyword = input.targetKeyword?.toLowerCase()
    let score = hasHeading ? 8 : 6
    if (keyword && text.toLowerCase().includes(keyword)) score += 0.8
    return { score: clamp(score), rationale: hasHeading ? 'Blog has scannable section structure.' : 'Blog needs clearer H2/H3 structure.' }
  }

  return { score: 7, rationale: 'Channel constraints are acceptable.' }
}

function scoreSpecificity(text: string, memory?: MarketingMemory | null): QualityDimension {
  const productTerms = [
    memory?.project.name,
    ...(memory?.brand.features ?? []),
    ...(memory?.brand.differentiators ?? []),
  ]
    .flatMap((value) => keywords(value))
    .filter((value, index, arr) => value.length > 3 && arr.indexOf(value) === index)

  const hasNumber = /\b\d+([.,]\d+)?%?\b/.test(text)
  const hits = productTerms.filter((term) => text.includes(term))
  const score = clamp(5.5 + hits.length * 0.75 + (hasNumber ? 1.2 : 0))

  return {
    score,
    rationale: hits.length || hasNumber
      ? `Grounded in concrete details${hits.length ? `: ${hits.slice(0, 4).join(', ')}` : ''}${hasNumber ? ' plus numeric proof.' : '.'}`
      : 'Needs more concrete product details or proof.',
  }
}

function scoreConversionIntent(text: string, cta?: string | null): QualityDimension {
  const ctaText = (cta ?? '').toLowerCase()
  const hits = CTA_WORDS.filter((word) => text.includes(word) || ctaText.includes(word))
  const score = clamp(5.5 + hits.length * 0.8 + (ctaText ? 0.8 : 0))
  return {
    score,
    rationale: hits.length
      ? `Clear action language: ${hits.slice(0, 4).join(', ')}.`
      : 'Needs a clearer next step.',
  }
}

function recommendations(dimensions: GeneratedQualityScore['dimensions']): string[] {
  return Object.entries(dimensions)
    .filter(([, dimension]) => dimension.score < 7.2)
    .sort((a, b) => a[1].score - b[1].score)
    .slice(0, 3)
    .map(([key, dimension]) => `${label(key)}: ${dimension.rationale}`)
}

function maxWordCount(surface: MemorySurface): number {
  if (surface === 'social_post') return 90
  if (surface === 'email') return 240
  if (surface === 'ad_copy') return 80
  return 1_800
}

function keywords(value: unknown): string[] {
  if (typeof value !== 'string') return []
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
}

function compact(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function label(value: string): string {
  return value.replace(/[A-Z]/g, (match) => ` ${match.toLowerCase()}`).replace(/^./, (match) => match.toUpperCase())
}

function clamp(value: number): number {
  return Math.max(1, Math.min(10, round(value)))
}

function round(value: number): number {
  return Math.round(value * 10) / 10
}
