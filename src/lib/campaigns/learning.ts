// Pure campaign-learning summarizer.
//
// Inputs: snapshots of manual metrics rows + the campaign's ad copies,
// social posts, email templates, content pieces, and any prior launch
// insights stored on the project's brand_voice.insights.history.
//
// Output: a `LearningSummary` shape designed for two consumers:
// 1) the campaign-page UI ("what worked?")
// 2) the next launch's Marketing Memory (already pulled via the
//    project's brand_voice — we just need to persist the summary back
//    onto the campaign so the operator and the LLM both see it).
//
// Kept dependency-free and deterministic so behavior is testable and
// stable across runs. No DB calls live here — the route does I/O, this
// file just does math.
import { rollupByChannel, type DerivedMetrics, type MetricRow } from '@/lib/metrics/derive'

export interface LearningAdInput {
  id: string
  status: string
  weighted_average: number | null
  headline: string | null
  primary_text: string | null
  is_best: boolean | null
}

export interface LearningSocialInput {
  id: string
  platform: string
  content: string
  is_winner: boolean | null
  // Engagement jsonb shape from Bundle K. We treat missing fields as 0.
  engagement: {
    likes?: number
    replies?: number
    shares?: number
    impressions?: number | null
  } | null
}

export interface LearningEmailInput {
  id: string
  name: string
  subject: string | null
  is_winner: boolean | null
  sends?: number
  opens?: number
  clicks?: number
}

export interface LearningMetricInput extends MetricRow {
  channel: string
  date: string
}

export interface LearningInsightsInput {
  // Prior launch lessons from brand_voice.insights.current — best-effort,
  // we accept anything shaped roughly like the existing payload.
  current: Record<string, unknown> | null
}

export interface LearningSummaryInputs {
  metrics: LearningMetricInput[]
  ads: LearningAdInput[]
  social: LearningSocialInput[]
  email: LearningEmailInput[]
  insights: LearningInsightsInput
}

export interface BestChannel {
  channel: string
  reason: string
  metrics: MetricRow & DerivedMetrics
}

export interface BestAsset {
  kind: 'ad' | 'social' | 'email'
  id: string
  label: string
  detail: string
  score: number | null
}

export interface LearningSummary {
  generatedAt: string
  bestChannel: BestChannel | null
  worstChannel: BestChannel | null
  bestAsset: BestAsset | null
  strongestHook: string | null
  recommendedNext: string[]
  reusableStyleNotes: string[]
  inputCounts: {
    metrics: number
    ads: number
    social: number
    email: number
  }
}

// Sum-of-engagement weighting matches the social winner-detector (Bundle K).
function socialScore(s: LearningSocialInput): number {
  const e = s.engagement ?? {}
  const likes = e.likes ?? 0
  const replies = e.replies ?? 0
  const shares = e.shares ?? 0
  return likes + 3 * replies + 5 * shares
}

function emailScore(e: LearningEmailInput): number {
  const sends = e.sends ?? 0
  if (sends === 0) return 0
  const openRate = (e.opens ?? 0) / sends
  const clickRate = (e.clicks ?? 0) / sends
  // Same weighting as the email winner scorer.
  return 0.3 * openRate + 0.7 * clickRate
}

function snippet(text: string | null, max = 90): string {
  if (!text) return ''
  const trimmed = text.trim()
  return trimmed.length > max ? `${trimmed.slice(0, max).trimEnd()}…` : trimmed
}

function pickBestChannel(metrics: LearningMetricInput[]): { best: BestChannel | null; worst: BestChannel | null } {
  if (metrics.length === 0) return { best: null, worst: null }
  const rollups = rollupByChannel(metrics)
  if (rollups.length === 0) return { best: null, worst: null }
  // Best: highest ROAS, falling back to lowest CPL, falling back to most
  // conversions. Worst: spend > 0 with no conversions, else lowest ROAS.
  const withSpend = rollups.filter((r) => r.spend > 0)
  const ranked = [...rollups].sort((a, b) => {
    const aRoas = a.roas ?? -Infinity
    const bRoas = b.roas ?? -Infinity
    if (aRoas !== bRoas) return bRoas - aRoas
    const aCpl = a.cpl ?? Infinity
    const bCpl = b.cpl ?? Infinity
    if (aCpl !== bCpl) return aCpl - bCpl
    return b.conversions - a.conversions
  })
  const best = ranked[0]
  let worst: typeof best | null = null
  const wasted = withSpend.find((r) => r.conversions === 0 && r.spend > 0) ?? null
  if (wasted) {
    worst = wasted
  } else if (ranked.length > 1) {
    worst = ranked[ranked.length - 1]
  }
  return {
    best: best
      ? {
          channel: best.channel,
          reason: explainChannel(best, 'best'),
          metrics: best,
        }
      : null,
    worst: worst && worst.channel !== best?.channel
      ? {
          channel: worst.channel,
          reason: explainChannel(worst, 'worst'),
          metrics: worst,
        }
      : null,
  }
}

function explainChannel(r: MetricRow & DerivedMetrics & { channel: string }, kind: 'best' | 'worst'): string {
  if (kind === 'best') {
    if (r.roas != null) return `Highest ROAS at ${(r.roas).toFixed(2)}x on $${r.spend.toFixed(0)} spend.`
    if (r.cpl != null) return `Best CPL at $${r.cpl.toFixed(2)} (${r.conversions} conversions).`
    if (r.conversions > 0) return `${r.conversions} conversions on $${r.spend.toFixed(0)} spend.`
    return 'Strongest top-of-funnel performance in the window.'
  }
  if (r.spend > 0 && r.conversions === 0) {
    return `Spent $${r.spend.toFixed(0)} with no conversions.`
  }
  if (r.roas != null && r.roas < 1) return `ROAS only ${r.roas.toFixed(2)}x — losing money on each click.`
  return 'Underperformed relative to the other channels.'
}

function pickBestAsset(inputs: LearningSummaryInputs): BestAsset | null {
  const candidates: BestAsset[] = []

  // Ads: human_approved beats experiment_ready beats compliance/eval_pass.
  // Tie-break on weighted_average.
  const adRank: Record<string, number> = {
    human_approved: 5,
    experiment_ready: 4,
    compliance_pass: 3,
    evaluator_pass: 2,
    generated: 1,
  }
  for (const ad of inputs.ads) {
    const rank = adRank[ad.status] ?? 0
    if (rank === 0 && !ad.is_best) continue
    const score = (ad.weighted_average ?? 0) + rank
    candidates.push({
      kind: 'ad',
      id: ad.id,
      label: snippet(ad.headline, 60) || 'Ad copy',
      detail: snippet(ad.primary_text, 110) || `Score ${ad.weighted_average?.toFixed(1) ?? '?'} (${ad.status})`,
      score,
    })
  }

  for (const post of inputs.social) {
    const score = socialScore(post)
    if (!post.is_winner && score === 0) continue
    candidates.push({
      kind: 'social',
      id: post.id,
      label: `${post.platform}: ${snippet(post.content, 50)}`,
      detail: post.engagement
        ? `${post.engagement.likes ?? 0} likes · ${post.engagement.replies ?? 0} replies · ${post.engagement.shares ?? 0} shares`
        : 'Marked as winner',
      score: post.is_winner ? score + 1000 : score,
    })
  }

  for (const email of inputs.email) {
    const score = emailScore(email)
    if (!email.is_winner && score === 0) continue
    candidates.push({
      kind: 'email',
      id: email.id,
      label: email.subject || email.name || 'Email template',
      detail: `${email.sends ?? 0} sends · ${(((email.opens ?? 0) / Math.max(email.sends ?? 0, 1)) * 100).toFixed(0)}% open · ${(((email.clicks ?? 0) / Math.max(email.sends ?? 0, 1)) * 100).toFixed(0)}% click`,
      score: email.is_winner ? score + 1000 : score,
    })
  }

  if (candidates.length === 0) return null
  return candidates.sort((a, b) => (b.score ?? 0) - (a.score ?? 0))[0]
}

function pickStrongestHook(inputs: LearningSummaryInputs): string | null {
  // The clearest signal we already have is from the prior launch insights'
  // winning_hooks list. If absent, fall back to the headline of the
  // top-scoring ad.
  const winning = inputs.insights.current?.winning_hooks
  if (Array.isArray(winning) && winning.length > 0 && typeof winning[0] === 'string') {
    return winning[0].slice(0, 200)
  }
  const winningPatterns = inputs.insights.current?.winning_patterns
  if (Array.isArray(winningPatterns) && winningPatterns.length > 0 && typeof winningPatterns[0] === 'string') {
    return winningPatterns[0].slice(0, 200)
  }
  const topAd = [...inputs.ads]
    .filter((a) => a.weighted_average != null && a.headline)
    .sort((a, b) => (b.weighted_average ?? 0) - (a.weighted_average ?? 0))[0]
  if (topAd?.headline) return snippet(topAd.headline, 200)
  const winnerSocial = inputs.social.find((s) => s.is_winner)
  if (winnerSocial) return snippet(winnerSocial.content, 200)
  return null
}

function pickRecommendedNext(inputs: LearningSummaryInputs, best: BestChannel | null, worst: BestChannel | null): string[] {
  const recs: string[] = []
  const fromInsights = inputs.insights.current?.next_experiments ?? inputs.insights.current?.recommended_next
  if (Array.isArray(fromInsights)) {
    for (const item of fromInsights) {
      if (typeof item === 'string' && item.trim().length > 0) recs.push(item)
    }
  }
  if (best) recs.push(`Double down on ${best.channel} — ${best.reason.toLowerCase()}`)
  if (worst) recs.push(`Cut or rework ${worst.channel} — ${worst.reason.toLowerCase()}`)
  const noWinners = inputs.social.every((s) => !s.is_winner) && inputs.email.every((e) => !e.is_winner)
  if (noWinners && (inputs.social.length > 0 || inputs.email.length > 0)) {
    recs.push('Promote a winning post or email so future generations copy what worked.')
  }
  return recs.slice(0, 5)
}

function pickReusableStyleNotes(inputs: LearningSummaryInputs): string[] {
  const notes: string[] = []
  const themes = inputs.insights.current?.themes_that_resonate
  if (Array.isArray(themes)) {
    for (const t of themes) {
      if (typeof t === 'string') notes.push(`Reuse theme: ${t}`)
    }
  }
  const channelNotes = inputs.insights.current?.channel_notes
  if (channelNotes && typeof channelNotes === 'object' && !Array.isArray(channelNotes)) {
    for (const [channel, note] of Object.entries(channelNotes)) {
      if (typeof note === 'string') notes.push(`${channel}: ${note}`)
    }
  }
  const winnerCount = inputs.social.filter((s) => s.is_winner).length
    + inputs.email.filter((e) => e.is_winner).length
  if (winnerCount > 0) {
    notes.push(`${winnerCount} winning asset${winnerCount === 1 ? '' : 's'} are already feeding back into style memory.`)
  }
  return notes.slice(0, 5)
}

export function summarizeCampaign(inputs: LearningSummaryInputs): LearningSummary {
  const { best, worst } = pickBestChannel(inputs.metrics)
  return {
    generatedAt: new Date().toISOString(),
    bestChannel: best,
    worstChannel: worst,
    bestAsset: pickBestAsset(inputs),
    strongestHook: pickStrongestHook(inputs),
    recommendedNext: pickRecommendedNext(inputs, best, worst),
    reusableStyleNotes: pickReusableStyleNotes(inputs),
    inputCounts: {
      metrics: inputs.metrics.length,
      ads: inputs.ads.length,
      social: inputs.social.length,
      email: inputs.email.length,
    },
  }
}

// Compact, stable text block for LLM injection (launch orchestrator,
// optional memory extensions). Accepts unknown because it is read from jsonb.
export function learningSummaryToPrompt(summary: unknown): string | null {
  if (!summary || typeof summary !== 'object' || Array.isArray(summary)) return null
  const s = summary as Partial<LearningSummary>
  const lines: string[] = []
  if (s.bestChannel?.channel && typeof s.bestChannel.reason === 'string') {
    lines.push(`Best channel: ${s.bestChannel.channel} — ${s.bestChannel.reason}`)
  } else if (s.bestChannel?.channel) {
    lines.push(`Best channel: ${s.bestChannel.channel}`)
  }
  if (s.worstChannel?.channel && typeof s.worstChannel.reason === 'string') {
    lines.push(`Underperforming channel: ${s.worstChannel.channel} — ${s.worstChannel.reason}`)
  } else if (s.worstChannel?.channel) {
    lines.push(`Underperforming channel: ${s.worstChannel.channel}`)
  }
  if (typeof s.strongestHook === 'string' && s.strongestHook.trim()) {
    lines.push(`Strongest hook: ${s.strongestHook.trim()}`)
  }
  if (s.bestAsset?.kind && typeof s.bestAsset.label === 'string') {
    lines.push(`Standout asset (${s.bestAsset.kind}): ${s.bestAsset.label}`)
  }
  if (Array.isArray(s.recommendedNext)) {
    const recs = s.recommendedNext.filter((x): x is string => typeof x === 'string' && x.trim().length > 0).slice(0, 5)
    if (recs.length) lines.push(`Suggested next experiments: ${recs.join(' | ')}`)
  }
  if (Array.isArray(s.reusableStyleNotes)) {
    const notes = s.reusableStyleNotes.filter((x): x is string => typeof x === 'string' && x.trim().length > 0).slice(0, 5)
    if (notes.length) lines.push(`Reusable style notes: ${notes.join(' · ')}`)
  }
  if (lines.length === 0) return null
  return lines.join('\n')
}
