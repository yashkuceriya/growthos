// Winner detection for email templates.
//
// Score = 0.3 × open_rate + 0.7 × click_rate. Click rate is weighted heavier
// than open rate because clicks are a stronger signal of resonance — opens
// can be inflated by image-pixel preloading or curiosity.
//
// Templates only qualify once they've been sent at least MIN_SENDS times,
// otherwise a single send-and-open returns 100% open rate and gets crowned.

export interface TemplateStats {
  template_id: string
  sends: number     // status >= 'sent' (sent + delivered + opened + clicked + bounced)
  delivered: number // status >= 'delivered'
  opens: number     // status >= 'opened'
  clicks: number    // status = 'clicked'
}

export interface WinnerOpts {
  windowDays: number
  topN: number
  minSends: number
  minScore: number
}

export const DEFAULT_WINNER_OPTS: WinnerOpts = {
  windowDays: 30,
  topN: 2,
  minSends: 20,    // need a real sample before crowning
  minScore: 0.05,  // 5% — below this, the winner-is-best-of-bad
}

const W_OPEN = 0.3
const W_CLICK = 0.7

export function scoreTemplate(stats: TemplateStats): number {
  if (stats.sends < 1) return 0
  // Use delivered count as the denominator for "real reach". If we have no
  // delivered events (e.g., status only ever hit 'sent' because Resend
  // webhooks weren't wired), fall back to sends.
  const reach = stats.delivered > 0 ? stats.delivered : stats.sends
  if (reach === 0) return 0
  const openRate = stats.opens / reach
  const clickRate = stats.clicks / reach
  return W_OPEN * openRate + W_CLICK * clickRate
}

export interface ScoredTemplate {
  template_id: string
  score: number
  stats: TemplateStats
}

/**
 * Pick top N templates above the score floor and the minimum-sends gate.
 * Returns winners and the list of currently-flagged template ids that should
 * be demoted because they fell out of the top.
 */
export function selectTemplateWinners(
  statsRows: TemplateStats[],
  currentlyFlagged: Set<string>,
  opts: WinnerOpts = DEFAULT_WINNER_OPTS,
): { winners: ScoredTemplate[]; demote: string[] } {
  const eligible = statsRows
    .filter((s) => s.sends >= opts.minSends)
    .map((s) => ({ template_id: s.template_id, score: scoreTemplate(s), stats: s }))
    .filter((s) => s.score >= opts.minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, opts.topN)

  const winnerIds = new Set(eligible.map((e) => e.template_id))
  const demote = [...currentlyFlagged].filter((id) => !winnerIds.has(id))
  return { winners: eligible, demote }
}
