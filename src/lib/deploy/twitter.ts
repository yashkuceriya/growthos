// X/Twitter publishing.
//
// - Browser helpers (clipboard / intent composer) cover the unauthenticated
//   "user pastes into X.com" path, which is still useful when no OAuth token
//   is configured.
// - publishTweet() hits X API v2 (POST /2/tweets) using a user OAuth 2.0
//   Bearer access token. Threads ([1/N], [2/N], ...) are posted as a chain
//   via in_reply_to_tweet_id.
//
// Token acquisition is out of scope here — accounts are connected via the
// settings page (paste-token flow for v1; full 3-legged OAuth dance later).

import type { PublishResult } from './types'

export function splitThreadFromContent(content: string): string[] {
  const parts = content
    .split(/\n\n+/)
    .map((s) => s.replace(/^\[\d+\/\d+\]\s*/, '').trim())
    .filter(Boolean)
  return parts
}

export async function copyThreadAsReplies(content: string): Promise<number> {
  const tweets = splitThreadFromContent(content)
  await navigator.clipboard.writeText(tweets.join('\n\n---NEXT TWEET---\n\n'))
  return tweets.length
}

export function openXComposer(firstTweet: string) {
  const url = new URL('https://twitter.com/intent/tweet')
  url.searchParams.set('text', firstTweet)
  window.open(url.toString(), '_blank', 'noopener,noreferrer,width=600,height=500')
}

interface TweetResponse {
  data?: { id: string; text: string }
  errors?: Array<{ message: string; code?: number }>
  detail?: string
  title?: string
}

async function postTweet(
  accessToken: string,
  text: string,
  inReplyTo: string | null,
): Promise<{ id: string }> {
  const body: Record<string, unknown> = { text }
  if (inReplyTo) body.reply = { in_reply_to_tweet_id: inReplyTo }

  const res = await fetch('https://api.twitter.com/2/tweets', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  const json = (await res.json().catch(() => ({}))) as TweetResponse
  if (!res.ok || !json.data) {
    const msg = json.detail || json.title || json.errors?.[0]?.message || `HTTP ${res.status}`
    throw new Error(`X API: ${msg}`)
  }
  return { id: json.data.id }
}

export class TwitterPartialThreadError extends Error {
  partialThreadIds: string[]
  constructor(message: string, partialThreadIds: string[]) {
    super(message)
    this.name = 'TwitterPartialThreadError'
    this.partialThreadIds = partialThreadIds
  }
}

interface PublishTweetOpts {
  // Skip the first N tweets (already posted in a previous attempt) and resume
  // chain replies from priorThreadIds[N-1].
  resumeFromIndex?: number
  priorThreadIds?: string[]
}

export async function publishTweet(
  accessToken: string,
  content: string,
  externalAccountId: string | null,
  opts: PublishTweetOpts = {},
): Promise<PublishResult> {
  const tweets = splitThreadFromContent(content)
  if (tweets.length === 0) throw new Error('Tweet body is empty')

  const resumeFrom = opts.resumeFromIndex ?? 0
  const priorIds = opts.priorThreadIds ?? []
  const ids: string[] = [...priorIds]
  let replyTo: string | null = priorIds[priorIds.length - 1] ?? null

  for (let i = resumeFrom; i < tweets.length; i++) {
    const text = tweets[i]!
    try {
      const { id } = await postTweet(accessToken, text, replyTo)
      ids.push(id)
      replyTo = id
    } catch (err) {
      // Re-raise as a partial-thread error so the dispatcher can persist
      // ids[] and resume on the next attempt instead of double-posting.
      const msg = err instanceof Error ? err.message : 'Unknown'
      throw new TwitterPartialThreadError(
        `Tweet ${i + 1}/${tweets.length} failed: ${msg}`,
        ids,
      )
    }
  }

  const firstId = ids[0]!
  const url = externalAccountId
    ? `https://x.com/i/web/status/${firstId}`
    : `https://twitter.com/anyuser/status/${firstId}`

  return {
    externalId: firstId,
    externalUrl: url,
    metadata: { thread_ids: ids, count: ids.length },
  }
}
