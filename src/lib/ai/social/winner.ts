// Winner detection for organic social posts.
//
// Score = engagement_rate when impressions are available (X), else a weighted
// raw count fallback (LinkedIn / no-impressions). Replies and shares are
// weighted higher than likes — they take more effort, so they're stronger
// signal of resonance.
//
// Winners are picked per (project, platform) over a rolling 30-day window,
// gated by a minimum-engagement floor so newly-published posts with 1 like
// don't get crowned by accident.

import type { SocialPostRow } from '@/lib/deploy/types'

export interface WinnerOpts {
  windowDays: number
  topN: number
  minScore: number
}

export const DEFAULT_WINNER_OPTS: WinnerOpts = {
  windowDays: 30,
  topN: 3,
  minScore: 5, // raw points — a post needs at least this much weighted engagement to qualify
}

const W_LIKES = 1
const W_REPLIES = 3
const W_SHARES = 5

interface EngagementShape {
  likes?: number
  replies?: number
  shares?: number
  impressions?: number | null
}

/**
 * Score a single post. Higher is better. Returns 0 for posts that lack
 * engagement data or aren't published.
 */
export function scorePost(post: SocialPostRow): number {
  if (post.status !== 'published') return 0
  const eng = (post.engagement ?? {}) as EngagementShape
  const likes = eng.likes ?? 0
  const replies = eng.replies ?? 0
  const shares = eng.shares ?? 0

  const weighted = W_LIKES * likes + W_REPLIES * replies + W_SHARES * shares
  if (weighted === 0) return 0

  // If we have impressions, normalize to a "rate" but scale up so it's in the
  // same order of magnitude as the raw weighted score. Posts that earned
  // disproportionate engagement vs reach get rewarded here.
  if (typeof eng.impressions === 'number' && eng.impressions > 0) {
    const rate = weighted / eng.impressions
    // multiplier picked so ~5% engagement on 100 impressions ≈ raw weighted score
    return rate * 100 + weighted * 0.1
  }
  return weighted
}

/**
 * Pick top N winners per platform among `posts`. Returns the winners and the
 * losers (posts that should be demoted from winner status). `posts` should be
 * pre-filtered to a single project and recent window.
 */
export function selectWinners(
  posts: SocialPostRow[],
  opts: WinnerOpts = DEFAULT_WINNER_OPTS,
): { winners: Array<{ post: SocialPostRow; score: number }>; demote: SocialPostRow[] } {
  const byPlatform = new Map<string, SocialPostRow[]>()
  for (const p of posts) {
    const list = byPlatform.get(p.platform) ?? []
    list.push(p)
    byPlatform.set(p.platform, list)
  }

  const winners: Array<{ post: SocialPostRow; score: number }> = []
  const winnerIds = new Set<string>()

  for (const [, group] of byPlatform) {
    const scored = group
      .map((post) => ({ post, score: scorePost(post) }))
      .filter((s) => s.score >= opts.minScore)
      .sort((a, b) => b.score - a.score)
      .slice(0, opts.topN)

    for (const s of scored) {
      winners.push(s)
      winnerIds.add(s.post.id)
    }
  }

  // Anything currently flagged is_winner that didn't make the cut → demote.
  const demote = posts.filter((p) => p.is_winner && !winnerIds.has(p.id))
  return { winners, demote }
}
