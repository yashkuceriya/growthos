import { describe, it, expect } from 'vitest'
import { scorePost, selectWinners, DEFAULT_WINNER_OPTS } from './winner'
import type { SocialPostRow } from '@/lib/deploy/types'

function post(id: string, overrides: Partial<SocialPostRow> = {}): SocialPostRow {
  return {
    id,
    user_id: 'u1',
    project_id: 'pr1',
    platform: 'twitter',
    content: `post ${id}`,
    media_urls: [],
    status: 'published',
    scheduled_at: null,
    published_at: new Date().toISOString(),
    attempts: 1,
    external_id: id,
    external_url: null,
    last_error: null,
    is_winner: false,
    ...overrides,
  }
}

describe('scorePost', () => {
  it('returns 0 for posts with no engagement', () => {
    expect(scorePost(post('a'))).toBe(0)
  })

  it('returns 0 for unpublished posts even with engagement', () => {
    expect(scorePost(post('a', { status: 'scheduled', engagement: { likes: 100 } }))).toBe(0)
  })

  it('weights replies and shares above likes', () => {
    const a = post('a', { engagement: { likes: 10, replies: 0, shares: 0 } })
    const b = post('b', { engagement: { likes: 0, replies: 10, shares: 0 } })
    const c = post('c', { engagement: { likes: 0, replies: 0, shares: 10 } })
    expect(scorePost(c)).toBeGreaterThan(scorePost(b))
    expect(scorePost(b)).toBeGreaterThan(scorePost(a))
  })

  it('boosts posts with strong engagement-per-impression rate', () => {
    // Both have the same raw engagement, but `b` reached 10x fewer eyes —
    // it should score higher because the rate is higher.
    const a = post('a', { engagement: { likes: 50, replies: 5, shares: 5, impressions: 10000 } })
    const b = post('b', { engagement: { likes: 50, replies: 5, shares: 5, impressions: 1000 } })
    expect(scorePost(b)).toBeGreaterThan(scorePost(a))
  })

  it('handles null impressions (LinkedIn case) by falling back to weighted raw count', () => {
    const a = post('a', { engagement: { likes: 5, replies: 1, shares: 0, impressions: null } })
    expect(scorePost(a)).toBe(5 * 1 + 1 * 3 + 0 * 5) // = 8
  })
})

describe('selectWinners', () => {
  it('picks top N per platform separately', () => {
    const posts = [
      post('t1', { platform: 'twitter', engagement: { likes: 100, replies: 5, shares: 5 } }),
      post('t2', { platform: 'twitter', engagement: { likes: 80, replies: 4, shares: 3 } }),
      post('t3', { platform: 'twitter', engagement: { likes: 60, replies: 3, shares: 2 } }),
      post('t4', { platform: 'twitter', engagement: { likes: 40, replies: 2, shares: 1 } }),
      post('l1', { platform: 'linkedin', engagement: { likes: 50, replies: 10, shares: 0, impressions: null } }),
      post('l2', { platform: 'linkedin', engagement: { likes: 30, replies: 5, shares: 0, impressions: null } }),
    ]
    const { winners } = selectWinners(posts)
    const ids = winners.map((w) => w.post.id).sort()
    expect(ids).toContain('t1'); expect(ids).toContain('t2'); expect(ids).toContain('t3')
    expect(ids).not.toContain('t4') // 4th twitter shouldn't qualify (topN=3)
    expect(ids).toContain('l1'); expect(ids).toContain('l2')
  })

  it('filters out posts below minScore', () => {
    const posts = [
      post('t1', { engagement: { likes: 1 } }), // weighted=1, below default min=5
      post('t2', { engagement: { likes: 10 } }), // weighted=10, qualifies
    ]
    const { winners } = selectWinners(posts)
    expect(winners).toHaveLength(1)
    expect(winners[0]!.post.id).toBe('t2')
  })

  it('demotes previously-flagged winners that no longer qualify', () => {
    const posts = [
      post('old', { is_winner: true, engagement: { likes: 0 } }), // weighted=0 → not in winners now
      post('new', { engagement: { likes: 50 } }),
    ]
    const { winners, demote } = selectWinners(posts)
    expect(winners.map((w) => w.post.id)).toEqual(['new'])
    expect(demote.map((d) => d.id)).toEqual(['old'])
  })

  it('does not demote a still-qualifying winner', () => {
    const posts = [
      post('a', { is_winner: true, engagement: { likes: 100, replies: 5, shares: 5 } }),
      post('b', { engagement: { likes: 50 } }),
    ]
    const { winners, demote } = selectWinners(posts)
    expect(winners.map((w) => w.post.id).sort()).toEqual(['a', 'b'])
    expect(demote).toHaveLength(0)
  })

  it('respects custom topN', () => {
    const posts = [
      post('a', { engagement: { likes: 100 } }),
      post('b', { engagement: { likes: 80 } }),
      post('c', { engagement: { likes: 60 } }),
    ]
    const { winners } = selectWinners(posts, { ...DEFAULT_WINNER_OPTS, topN: 1 })
    expect(winners).toHaveLength(1)
    expect(winners[0]!.post.id).toBe('a')
  })
})
