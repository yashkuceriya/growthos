// Free, no-auth data pullers for market intelligence.
// Reddit JSON API + HN Firebase API + optional RSS.

export interface RedditThread {
  subreddit: string
  title: string
  selftext: string
  upvotes: number
  num_comments: number
  url: string
  created_utc: number
  top_comments: string[]
}

export interface HNStory {
  id: number
  title: string
  url?: string
  score: number
  descendants: number
  by: string
  time: number
  type: string
}

const UA = 'Mozilla/5.0 GrowthOS-MarketIntel/1.0'

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } })
    if (!res.ok) return null
    return await res.json()
  } catch { return null }
}

export async function fetchSubredditTop(subreddit: string, limit = 15): Promise<RedditThread[]> {
  const data = await fetchJson<{ data: { children: Array<{ data: Record<string, unknown> }> } }>(
    `https://www.reddit.com/r/${subreddit}/top.json?t=week&limit=${limit}`,
  )
  if (!data?.data?.children) return []

  // Fetch a couple of top comments per thread (parallel, bounded)
  const threads = data.data.children.map((c) => c.data)
  const withComments = await Promise.all(
    threads.slice(0, 10).map(async (t) => {
      const permalink = t.permalink as string | undefined
      let top_comments: string[] = []
      if (permalink) {
        const comments = await fetchJson<unknown[]>(
          `https://www.reddit.com${permalink}.json?limit=3&depth=1&sort=top`,
        )
        if (Array.isArray(comments) && comments[1] && typeof comments[1] === 'object') {
          const listing = (comments[1] as { data?: { children?: Array<{ data: { body?: string } }> } })
          top_comments = (listing.data?.children ?? [])
            .slice(0, 3)
            .map((c) => c.data?.body ?? '')
            .filter((b) => b.length > 20 && b.length < 500)
        }
      }
      return {
        subreddit,
        title: (t.title as string) ?? '',
        selftext: ((t.selftext as string) ?? '').slice(0, 800),
        upvotes: (t.ups as number) ?? 0,
        num_comments: (t.num_comments as number) ?? 0,
        url: `https://www.reddit.com${permalink ?? ''}`,
        created_utc: (t.created_utc as number) ?? 0,
        top_comments,
      } satisfies RedditThread
    }),
  )
  return withComments
}

export async function fetchHNTopStories(limit = 15, topicFilter?: string[]): Promise<HNStory[]> {
  const ids = await fetchJson<number[]>(`https://hacker-news.firebaseio.com/v0/topstories.json`)
  if (!ids) return []
  const stories = await Promise.all(
    ids.slice(0, 40).map((id) => fetchJson<HNStory>(`https://hacker-news.firebaseio.com/v0/item/${id}.json`)),
  )
  const valid = stories.filter((s): s is HNStory => s !== null && s.type === 'story' && typeof s.title === 'string')
  if (!topicFilter || topicFilter.length === 0) return valid.slice(0, limit)
  const lowered = topicFilter.map((t) => t.toLowerCase())
  const scored = valid.map((s) => {
    const hit = lowered.reduce((n, t) => (s.title.toLowerCase().includes(t) ? n + 1 : n), 0)
    return { s, hit }
  })
  scored.sort((a, b) => b.hit - a.hit || b.s.score - a.s.score)
  return scored.slice(0, limit).map((x) => x.s)
}

export async function fetchRss(url: string, limit = 10): Promise<Array<{ title: string; link: string; pubDate?: string; summary: string }>> {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA } })
    if (!res.ok) return []
    const xml = await res.text()
    // Cheap XML parse — enough for most RSS / Atom feeds
    const itemBlocks = [...xml.matchAll(/<(?:item|entry)[^>]*>([\s\S]*?)<\/(?:item|entry)>/gi)]
    const pick = (block: string, tag: string) => {
      const m = block.match(new RegExp(`<${tag}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${tag}>`, 'i'))
      return m ? m[1].replace(/<[^>]+>/g, '').trim() : ''
    }
    return itemBlocks.slice(0, limit).map((m) => {
      const block = m[1]
      const linkTag = block.match(/<link[^>]*href=["']([^"']+)["']/i)
      return {
        title: pick(block, 'title'),
        link: linkTag?.[1] ?? pick(block, 'link'),
        pubDate: pick(block, 'pubDate') || pick(block, 'updated') || pick(block, 'published'),
        summary: (pick(block, 'description') || pick(block, 'summary') || pick(block, 'content')).slice(0, 400),
      }
    })
  } catch { return [] }
}
