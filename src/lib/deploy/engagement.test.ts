import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { fetchTweetEngagement } from './twitter-engagement'
import { fetchLinkedInEngagement } from './linkedin-engagement'

describe('fetchTweetEngagement', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>
  beforeEach(() => { fetchSpy = vi.spyOn(globalThis, 'fetch') })
  afterEach(() => { fetchSpy.mockRestore() })

  it('aggregates metrics across a thread', async () => {
    fetchSpy.mockResolvedValue(new Response(JSON.stringify({
      data: [
        { id: '111', public_metrics: { like_count: 5, reply_count: 1, retweet_count: 2, quote_count: 0, bookmark_count: 1, impression_count: 100 } },
        { id: '222', public_metrics: { like_count: 3, reply_count: 2, retweet_count: 0, quote_count: 1, bookmark_count: 0, impression_count: 80 } },
      ],
    }), { status: 200 }))

    const eng = await fetchTweetEngagement('tok', ['111', '222'])
    expect(eng.likes).toBe(8)
    expect(eng.replies).toBe(3)
    expect(eng.shares).toBe(3) // 2 retweets + 1 quote
    expect(eng.impressions).toBe(180)
    expect(eng.bookmarks).toBe(1)
    expect(eng.synced_at).toBeTruthy()
  })

  it('leaves impressions null when neither bucket reports it', async () => {
    fetchSpy.mockResolvedValue(new Response(JSON.stringify({
      data: [{ id: '111', public_metrics: { like_count: 4, reply_count: 0, retweet_count: 0, quote_count: 0 } }],
    }), { status: 200 }))

    const eng = await fetchTweetEngagement('tok', ['111'])
    expect(eng.impressions).toBeNull()
    expect(eng.likes).toBe(4)
  })

  it('throws on API error', async () => {
    fetchSpy.mockResolvedValue(new Response(JSON.stringify({ detail: 'rate limit' }), { status: 429 }))
    await expect(fetchTweetEngagement('tok', ['111'])).rejects.toThrow(/rate limit/)
  })

  it('throws on empty id list', async () => {
    await expect(fetchTweetEngagement('tok', [])).rejects.toThrow(/No tweet ids/)
  })
})

describe('fetchLinkedInEngagement', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>
  beforeEach(() => { fetchSpy = vi.spyOn(globalThis, 'fetch') })
  afterEach(() => { fetchSpy.mockRestore() })

  it('reads aggregatedTotalLikes / aggregatedTotalComments when present', async () => {
    fetchSpy.mockResolvedValue(new Response(JSON.stringify({
      likesSummary: { aggregatedTotalLikes: 42, totalLikes: 40 },
      commentsSummary: { aggregatedTotalComments: 7, totalFirstLevelComments: 5 },
    }), { status: 200 }))

    const eng = await fetchLinkedInEngagement('tok', 'urn:li:share:6993000000000000001')
    expect(eng.likes).toBe(42)
    expect(eng.replies).toBe(7)
    expect(eng.impressions).toBeNull()
  })

  it('falls back to total* fields when aggregated is absent', async () => {
    fetchSpy.mockResolvedValue(new Response(JSON.stringify({
      likesSummary: { totalLikes: 10 },
      commentsSummary: { totalFirstLevelComments: 2 },
    }), { status: 200 }))

    const eng = await fetchLinkedInEngagement('tok', 'urn:li:share:1')
    expect(eng.likes).toBe(10)
    expect(eng.replies).toBe(2)
  })

  it('URL-encodes the URN to the path', async () => {
    fetchSpy.mockResolvedValue(new Response('{}', { status: 200 }))
    await fetchLinkedInEngagement('tok', 'urn:li:share:1234')
    const calledUrl = fetchSpy.mock.calls[0]![0] as string
    expect(calledUrl).toContain('urn%3Ali%3Ashare%3A1234')
  })

  it('throws on API error', async () => {
    fetchSpy.mockResolvedValue(new Response(JSON.stringify({ message: 'not found' }), { status: 404 }))
    await expect(fetchLinkedInEngagement('tok', 'urn:li:share:1')).rejects.toThrow(/not found/)
  })

  it('throws when URN missing', async () => {
    await expect(fetchLinkedInEngagement('tok', '')).rejects.toThrow(/URN/)
  })
})
