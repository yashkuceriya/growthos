// Pull public metrics for published tweets via X API v2.
// Endpoint: GET /2/tweets?ids=<csv>&tweet.fields=public_metrics,non_public_metrics
//
// public_metrics is always present on the user's own tweets (and most public
// tweets). non_public_metrics — including impression_count — only returns for
// tweets owned by the authenticating user. We request both and gracefully
// fall back if the API only returns the public bucket.

import type { NormalizedEngagement } from './engagement-types'

interface TweetPublicMetrics {
  retweet_count: number
  reply_count: number
  like_count: number
  quote_count: number
  bookmark_count?: number
  impression_count?: number
}

interface TweetNonPublicMetrics {
  impression_count?: number
}

interface TweetsLookupResponse {
  data?: Array<{
    id: string
    public_metrics?: TweetPublicMetrics
    non_public_metrics?: TweetNonPublicMetrics
  }>
  errors?: Array<{ detail?: string; title?: string; message?: string }>
  detail?: string
  title?: string
}

export async function fetchTweetEngagement(
  accessToken: string,
  threadIds: string[],
): Promise<NormalizedEngagement> {
  if (threadIds.length === 0) throw new Error('No tweet ids to fetch')

  // X caps the lookup at 100 ids per call. Threads are way smaller, but be safe.
  const ids = threadIds.slice(0, 100).join(',')
  const url = new URL('https://api.twitter.com/2/tweets')
  url.searchParams.set('ids', ids)
  url.searchParams.set('tweet.fields', 'public_metrics,non_public_metrics')

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  const json = (await res.json().catch(() => ({}))) as TweetsLookupResponse

  if (!res.ok || !json.data) {
    const msg = json.detail || json.title || json.errors?.[0]?.detail || `HTTP ${res.status}`
    throw new Error(`X engagement: ${msg}`)
  }

  // Sum metrics across the thread. The headline number is the cumulative
  // engagement on every tweet in the chain, which is what the user usually
  // cares about. We still keep per-tweet detail in platform_raw.
  let likes = 0
  let replies = 0
  let shares = 0
  let impressions = 0
  let bookmarks = 0
  let impressionsSeen = false

  for (const t of json.data) {
    const pub = t.public_metrics
    const nonpub = t.non_public_metrics
    if (pub) {
      likes += pub.like_count ?? 0
      replies += pub.reply_count ?? 0
      shares += (pub.retweet_count ?? 0) + (pub.quote_count ?? 0)
      bookmarks += pub.bookmark_count ?? 0
      if (typeof pub.impression_count === 'number') {
        impressions += pub.impression_count
        impressionsSeen = true
      }
    }
    if (nonpub && typeof nonpub.impression_count === 'number') {
      impressions += nonpub.impression_count
      impressionsSeen = true
    }
  }

  return {
    likes,
    replies,
    shares,
    impressions: impressionsSeen ? impressions : null,
    bookmarks,
    synced_at: new Date().toISOString(),
    platform_raw: { tweets: json.data },
  }
}
