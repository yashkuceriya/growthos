import type { LearningSummary } from '@/lib/campaigns/learning'

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

export function personaInsightSignal(summary: LearningSummary): string | null {
  if (summary.strongestHook) return summary.strongestHook
  if (summary.bestChannel) return `Best channel: ${summary.bestChannel.channel}`
  if (summary.recommendedNext.length > 0) return summary.recommendedNext[0]
  if (summary.inputCounts.manualTasks > 0) return `${summary.inputCounts.manualTasks} manual task${summary.inputCounts.manualTasks === 1 ? '' : 's'} completed`
  return null
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
