import type { LearningSummary } from '@/lib/campaigns/learning'
import type { MarketingPersona } from '@/lib/marketing/personas'

export interface CampaignPersonaLearning {
  campaign_id: string
  timestamp: string
  persona: {
    id: string
    name: string
    role: string | null
    skepticism_level: string | null
  }
  insight_signal: string | null
  best_channel: string | null
  worst_channel: string | null
  manual_task_count: number
  recommended_next: string[]
  summary: LearningSummary
}

export interface PersonaLearningDigest {
  personaId: string
  personaName: string | null
  campaignId: string
  updatedAt: string
  insightSignal: string | null
  bestChannel: string | null
  worstChannel: string | null
  manualTaskCount: number
  recommendedNext: string[]
  historyCount: number
}

export interface PersonaExperimentRow {
  personaId: string
  personaName: string
  role: string | null
  isPrimary: boolean
  confidence: 'strong' | 'learning' | 'cold'
  evidenceScore: number
  bestChannel: string | null
  reworkChannel: string | null
  insight: string
  nextTest: string
  launchHref: string
  updatedAt: string | null
  historyCount: number
}

export interface PersonaLearningTimelineEntry {
  campaignId: string
  updatedAt: string
  personaName: string | null
  insightSignal: string | null
  bestChannel: string | null
  worstChannel: string | null
  manualTaskCount: number
  recommendedNext: string[]
}

export function campaignPersonaFromMetadata(metadata: Record<string, unknown> | null | undefined): CampaignPersonaLearning['persona'] | null {
  const direct = readPersona(metadata?.persona)
  if (direct) return direct

  const tracker = metadata?.manual_launch_tracker
  if (!tracker || typeof tracker !== 'object' || Array.isArray(tracker)) return null
  return readPersona((tracker as Record<string, unknown>).persona)
}

export function buildCampaignPersonaLearning(args: {
  campaignId: string
  metadata: Record<string, unknown> | null | undefined
  summary: LearningSummary
  timestamp?: string
}): CampaignPersonaLearning | null {
  const persona = campaignPersonaFromMetadata(args.metadata)
  if (!persona) return null
  return {
    campaign_id: args.campaignId,
    timestamp: args.timestamp ?? new Date().toISOString(),
    persona,
    insight_signal: personaInsightSignal(args.summary),
    best_channel: args.summary.bestChannel?.channel ?? null,
    worst_channel: args.summary.worstChannel?.channel ?? null,
    manual_task_count: args.summary.inputCounts.manualTasks,
    recommended_next: args.summary.recommendedNext.slice(0, 5),
    summary: args.summary,
  }
}

export function mergeCampaignPersonaLearning(
  insights: Record<string, unknown> | null | undefined,
  entry: CampaignPersonaLearning,
): Record<string, unknown> {
  const prev = insights && typeof insights === 'object' && !Array.isArray(insights) ? insights : {}
  const personaCurrent = readObjectMap(prev.persona_current)
  const personaHistory = readHistoryMap(prev.persona_history)
  const key = entry.persona.id
  const prior = personaHistory[key]?.slice(-4) ?? []
  return {
    ...prev,
    last_updated: entry.timestamp,
    last_persona_learning_campaign_id: entry.campaign_id,
    persona_current: {
      ...personaCurrent,
      [key]: entry,
    },
    persona_history: {
      ...personaHistory,
      [key]: [...prior, entry],
    },
  }
}

export function personaLearningDigestMap(brandVoice: Record<string, unknown> | null | undefined): Record<string, PersonaLearningDigest> {
  const insights = readObjectMap(brandVoice?.insights)
  const current = readObjectMap(insights.persona_current)
  const history = readHistoryMap(insights.persona_history)
  const out: Record<string, PersonaLearningDigest> = {}
  for (const [personaId, raw] of Object.entries(current)) {
    const digest = readLearningDigest(personaId, raw, history[personaId]?.length ?? 0)
    if (digest) out[personaId] = digest
  }
  return out
}

export function latestPersonaLearningDigest(brandVoice: Record<string, unknown> | null | undefined): PersonaLearningDigest | null {
  const digests = Object.values(personaLearningDigestMap(brandVoice))
  if (digests.length === 0) return null
  return digests.sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))[0]
}

export function personaLearningTimeline(
  brandVoice: Record<string, unknown> | null | undefined,
  personaId: string | null | undefined,
): PersonaLearningTimelineEntry[] {
  if (!personaId) return []
  const insights = readObjectMap(brandVoice?.insights)
  const history = readHistoryMap(insights.persona_history)[personaId] ?? []
  const current = readObjectMap(insights.persona_current)[personaId]
  const candidates = current ? [...history, current] : history
  const byKey = new Map<string, PersonaLearningTimelineEntry>()
  for (const raw of candidates) {
    const entry = readTimelineEntry(raw)
    if (!entry) continue
    byKey.set(`${entry.campaignId}:${entry.updatedAt}`, entry)
  }
  return Array.from(byKey.values())
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
    .slice(0, 5)
}

export function buildPersonaExperimentBoard(
  personas: MarketingPersona[],
  learningByPersona: Record<string, PersonaLearningDigest>,
): PersonaExperimentRow[] {
  return personas
    .map((persona) => {
      const learning = learningByPersona[persona.id] ?? null
      const evidenceScore = personaEvidenceScore(learning)
      const bestChannel = learning?.bestChannel ?? persona.preferredChannels[0] ?? null
      const nextTest = learning?.recommendedNext[0]
        ?? (bestChannel
          ? `Run a focused ${bestChannel} test for ${persona.name}`
          : `Run a small launch test for ${persona.name}`)
      return {
        personaId: persona.id,
        personaName: persona.name,
        role: persona.role,
        isPrimary: persona.isPrimary,
        confidence: personaConfidence(evidenceScore),
        evidenceScore,
        bestChannel,
        reworkChannel: learning?.worstChannel ?? null,
        insight: learning?.insightSignal
          ?? `${persona.name} has no captured launch evidence yet.`,
        nextTest,
        launchHref: `/launch?personaId=${encodeURIComponent(persona.id)}`,
        updatedAt: learning?.updatedAt ?? null,
        historyCount: learning?.historyCount ?? 0,
      } satisfies PersonaExperimentRow
    })
    .sort((a, b) => {
      if (a.confidence !== b.confidence) return confidenceRank(b.confidence) - confidenceRank(a.confidence)
      if (a.evidenceScore !== b.evidenceScore) return b.evidenceScore - a.evidenceScore
      if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1
      return a.personaName.localeCompare(b.personaName)
    })
}

export function personaInsightSignal(summary: LearningSummary): string | null {
  if (summary.strongestHook) return summary.strongestHook
  if (summary.bestChannel) return `Best channel: ${summary.bestChannel.channel}`
  if (summary.recommendedNext.length > 0) return summary.recommendedNext[0]
  if (summary.inputCounts.manualTasks > 0) return `${summary.inputCounts.manualTasks} manual task${summary.inputCounts.manualTasks === 1 ? '' : 's'} completed`
  return null
}

function personaEvidenceScore(learning: PersonaLearningDigest | null): number {
  if (!learning) return 0
  let score = 0
  if (learning.insightSignal) score += 2
  if (learning.bestChannel) score += 2
  if (learning.worstChannel) score += 1
  if (learning.recommendedNext.length > 0) score += 1
  score += Math.min(learning.historyCount, 4)
  if (learning.manualTaskCount > 0) score += 1
  return score
}

function personaConfidence(score: number): PersonaExperimentRow['confidence'] {
  if (score >= 7) return 'strong'
  if (score > 0) return 'learning'
  return 'cold'
}

function confidenceRank(confidence: PersonaExperimentRow['confidence']): number {
  if (confidence === 'strong') return 3
  if (confidence === 'learning') return 2
  return 1
}

function readLearningDigest(personaId: string, raw: unknown, historyCount: number): PersonaLearningDigest | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const row = raw as Record<string, unknown>
  const campaignId = typeof row.campaign_id === 'string' ? row.campaign_id : null
  const updatedAt = typeof row.timestamp === 'string' ? row.timestamp : null
  if (!campaignId || !updatedAt) return null
  const recommended = Array.isArray(row.recommended_next)
    ? row.recommended_next.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).slice(0, 5)
    : []
  return {
    personaId,
    personaName: readDigestPersonaName(row.persona),
    campaignId,
    updatedAt,
    insightSignal: typeof row.insight_signal === 'string' ? row.insight_signal : null,
    bestChannel: typeof row.best_channel === 'string' ? row.best_channel : null,
    worstChannel: typeof row.worst_channel === 'string' ? row.worst_channel : null,
    manualTaskCount: typeof row.manual_task_count === 'number' ? row.manual_task_count : 0,
    recommendedNext: recommended,
    historyCount,
  }
}

function readTimelineEntry(raw: unknown): PersonaLearningTimelineEntry | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const row = raw as Record<string, unknown>
  const campaignId = typeof row.campaign_id === 'string' ? row.campaign_id : null
  const updatedAt = typeof row.timestamp === 'string' ? row.timestamp : null
  if (!campaignId || !updatedAt) return null
  return {
    campaignId,
    updatedAt,
    personaName: readDigestPersonaName(row.persona),
    insightSignal: typeof row.insight_signal === 'string' ? row.insight_signal : null,
    bestChannel: typeof row.best_channel === 'string' ? row.best_channel : null,
    worstChannel: typeof row.worst_channel === 'string' ? row.worst_channel : null,
    manualTaskCount: typeof row.manual_task_count === 'number' ? row.manual_task_count : 0,
    recommendedNext: Array.isArray(row.recommended_next)
      ? row.recommended_next.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).slice(0, 3)
      : [],
  }
}

function readDigestPersonaName(raw: unknown): string | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const name = (raw as Record<string, unknown>).name
  return typeof name === 'string' ? name : null
}

function readPersona(raw: unknown): CampaignPersonaLearning['persona'] | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const row = raw as Record<string, unknown>
  const id = typeof row.id === 'string' ? row.id : null
  const name = typeof row.name === 'string' ? row.name : null
  if (!id || !name) return null
  return {
    id,
    name,
    role: typeof row.role === 'string' ? row.role : null,
    skepticism_level: typeof row.skepticismLevel === 'string'
      ? row.skepticismLevel
      : typeof row.skepticism_level === 'string' ? row.skepticism_level : null,
  }
}

function readObjectMap(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function readHistoryMap(value: unknown): Record<string, unknown[]> {
  const raw = readObjectMap(value)
  const out: Record<string, unknown[]> = {}
  for (const [key, list] of Object.entries(raw)) {
    if (Array.isArray(list)) out[key] = list
  }
  return out
}
