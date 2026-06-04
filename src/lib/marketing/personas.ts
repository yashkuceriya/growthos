import type { MarketingMemory } from './memory'

export type PersonaSkepticism = 'low' | 'medium' | 'high'

export interface MarketingPersona {
  id: string
  projectId: string
  name: string
  role: string | null
  description: string | null
  painPoints: string[]
  objections: string[]
  buyingTriggers: string[]
  desiredOutcomes: string[]
  vocabulary: string[]
  preferredChannels: string[]
  skepticismLevel: PersonaSkepticism
  isPrimary: boolean
}

export interface PersonaFitScore {
  score: number
  rationale: string
  hits: string[]
  misses: string[]
}

const PERSONA_PRESETS: Array<Omit<MarketingPersona, 'id' | 'projectId' | 'isPrimary'>> = [
  {
    name: 'Founder Operator',
    role: 'Founder',
    description: 'Ships products, runs launches personally, and wants leverage without hiring a marketing team.',
    painPoints: ['too many disconnected marketing tools', 'launches lose momentum', 'hard to know what worked'],
    objections: ['sounds generic', 'takes too much setup', 'another dashboard to maintain'],
    buyingTriggers: ['new product launch', 'low conversion from existing traffic', 'need to move faster this week'],
    desiredOutcomes: ['ship campaigns faster', 'see what to fix next', 'turn learnings into the next launch'],
    vocabulary: ['launch', 'ship', 'sprint', 'leads', 'conversion', 'campaign', 'local', 'operator'],
    preferredChannels: ['landing', 'email', 'linkedin', 'social'],
    skepticismLevel: 'high',
  },
  {
    name: 'Growth Marketer',
    role: 'Marketer',
    description: 'Owns acquisition experiments and needs clearer testing, assets, and reporting loops.',
    painPoints: ['slow creative iteration', 'unclear winning message', 'manual reporting work'],
    objections: ['quality will be too generic', 'does not match brand voice', 'hard to trust automation'],
    buyingTriggers: ['campaign performance stalls', 'new channel test', 'weekly reporting pressure'],
    desiredOutcomes: ['more testable variants', 'clear quality gates', 'faster campaign learning'],
    vocabulary: ['experiment', 'variant', 'quality', 'attribution', 'creative', 'pipeline', 'performance'],
    preferredChannels: ['meta', 'linkedin', 'email', 'blog'],
    skepticismLevel: 'medium',
  },
  {
    name: 'App Builder',
    role: 'Builder',
    description: 'Builds multiple apps and needs a practical way to market each one without context switching.',
    painPoints: ['marketing gets postponed', 'each app needs different positioning', 'too much blank-page work'],
    objections: ['will not understand my product', 'too much polish instead of outcomes', 'AI copy feels fake'],
    buyingTriggers: ['finished MVP', 'new app idea', 'stale launch copy'],
    desiredOutcomes: ['usable assets today', 'sharper positioning per app', 'repeatable marketing workflow'],
    vocabulary: ['app', 'MVP', 'build', 'local', 'workflow', 'positioning', 'copy', 'launch'],
    preferredChannels: ['landing', 'reddit', 'social', 'email'],
    skepticismLevel: 'high',
  },
]

export function inferPersonasFromMemory(memory: MarketingMemory): MarketingPersona[] {
  const audience = [
    memory.brand.audience,
    memory.classification.icp,
    memory.classification.targetMarket,
  ].filter((value): value is string => !!value)

  const projectId = memory.project.id
  const presets = PERSONA_PRESETS.map((preset, index) => ({
    ...preset,
    id: `preset-${index + 1}`,
    projectId,
    isPrimary: index === 0,
  }))

  if (!audience.length) return presets

  const primaryWords = keywords(audience.join(' '))
  return [
    {
      ...presets[0],
      name: humanize(audience[0]),
      description: `Primary inferred buyer from project memory: ${audience.join(' / ')}.`,
      vocabulary: unique([...primaryWords, ...presets[0].vocabulary]),
    },
    ...presets.slice(1),
  ]
}

export function scorePersonaFit(text: string, persona: MarketingPersona): PersonaFitScore {
  const lower = text.toLowerCase()
  const vocabulary = unique([
    ...persona.vocabulary,
    ...persona.painPoints.flatMap(keywords),
    ...persona.desiredOutcomes.flatMap(keywords),
    ...keywords(persona.name),
    ...keywords(persona.role),
  ]).filter((term) => term.length > 3)

  const hits = vocabulary.filter((term) => lower.includes(term)).slice(0, 8)
  const objectionHits = persona.objections.filter((objection) => containsAny(lower, keywords(objection)))
  const outcomeHits = persona.desiredOutcomes.filter((outcome) => containsAny(lower, keywords(outcome)))
  const painHits = persona.painPoints.filter((pain) => containsAny(lower, keywords(pain)))

  const skepticismPenalty = persona.skepticismLevel === 'high' && objectionHits.length === 0 ? 0.7 : 0
  const score = clamp(5.4 + hits.length * 0.45 + outcomeHits.length * 0.7 + painHits.length * 0.55 - skepticismPenalty)
  const misses = [
    !painHits.length ? 'pain point' : null,
    !outcomeHits.length ? 'desired outcome' : null,
    persona.skepticismLevel === 'high' && !objectionHits.length ? 'skeptic objection' : null,
  ].filter((value): value is string => !!value)

  return {
    score,
    hits,
    misses,
    rationale: hits.length
      ? `Matches ${persona.name} language: ${hits.slice(0, 5).join(', ')}.`
      : `Does not clearly speak in ${persona.name} language yet.`,
  }
}

export function normalizePersonaRow(row: Record<string, unknown>): MarketingPersona {
  return {
    id: str(row.id),
    projectId: str(row.project_id),
    name: str(row.name) || 'Persona',
    role: str(row.role) || null,
    description: str(row.description) || null,
    painPoints: stringArray(row.pain_points),
    objections: stringArray(row.objections),
    buyingTriggers: stringArray(row.buying_triggers),
    desiredOutcomes: stringArray(row.desired_outcomes),
    vocabulary: stringArray(row.vocabulary),
    preferredChannels: stringArray(row.preferred_channels),
    skepticismLevel: isSkepticism(row.skepticism_level) ? row.skepticism_level : 'medium',
    isPrimary: row.is_primary === true,
  }
}

export function personaToRow(persona: Partial<MarketingPersona>) {
  return {
    name: persona.name,
    role: persona.role,
    description: persona.description,
    pain_points: persona.painPoints ?? [],
    objections: persona.objections ?? [],
    buying_triggers: persona.buyingTriggers ?? [],
    desired_outcomes: persona.desiredOutcomes ?? [],
    vocabulary: persona.vocabulary ?? [],
    preferred_channels: persona.preferredChannels ?? [],
    skepticism_level: persona.skepticismLevel ?? 'medium',
    is_primary: persona.isPrimary ?? false,
  }
}

function keywords(value: unknown): string[] {
  if (typeof value !== 'string') return []
  return value.toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').split(/\s+/).filter(Boolean)
}

function containsAny(text: string, terms: string[]): boolean {
  return terms.some((term) => term.length > 3 && text.includes(term))
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0) : []
}

function unique(values: string[]): string[] {
  return values.map((value) => value.trim().toLowerCase()).filter((value, index, arr) => value && arr.indexOf(value) === index)
}

function humanize(value: string): string {
  return value.replace(/[_-]/g, ' ').replace(/\b\w/g, (match) => match.toUpperCase())
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function isSkepticism(value: unknown): value is PersonaSkepticism {
  return value === 'low' || value === 'medium' || value === 'high'
}

function clamp(value: number): number {
  return Math.max(1, Math.min(10, Math.round(value * 10) / 10))
}
