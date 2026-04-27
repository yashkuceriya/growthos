// State-machine tests for the publish dispatcher. We don't actually hit
// X/LinkedIn — we stub fetch and assert the post row + account row transitions.

import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest'
import { randomBytes } from 'crypto'

beforeAll(() => {
  process.env.SOCIAL_TOKEN_ENC_KEY = randomBytes(32).toString('base64')
})

// dispatchPost now fires social.published webhooks on success. The fake
// supabase below only knows social_posts + social_accounts; rather than
// teach it about webhook_endpoints/webhook_deliveries, no-op the emit.
// Webhook fan-out has its own coverage in src/lib/webhooks/dispatch.test.ts.
vi.mock('@/lib/webhooks/dispatch', () => ({
  emitEvent: vi.fn(async () => ({ created: 0 })),
}))

import { encryptToken } from './encryption'
import { dispatchPost, MAX_PUBLISH_ATTEMPTS } from './index'
import type { SocialPostRow } from './types'

interface StoredPost extends SocialPostRow {
  metadata?: Record<string, unknown>
}

interface StoredAccount {
  id: string
  platform: string
  expires_at: string | null
  access_token_encrypted: string | null
  external_account_id: string | null
  last_publish_at: string | null
  last_error: string | null
}

interface FakeOpts {
  post: StoredPost
  account: StoredAccount | null
  // If true, the next claimPost() conditional update returns no rows (simulating
  // another worker beat us). Auto-resets after one claim.
  refuseClaim?: boolean
}

function makeFakeSupabase(opts: FakeOpts) {
  const post = opts.post
  let refuseNextClaim = !!opts.refuseClaim

  // Returns a chainable stub. The terminal verbs (.maybeSingle / .single /
  // bare await) resolve to { data, error }. `claim` is a special return that
  // collects filter conditions to gate the conditional update.
  type Resolver = () => Promise<{ data: unknown; error: null }>
  function chain(resolver: Resolver): Record<string, unknown> & PromiseLike<{ data: unknown; error: null }> {
    const proxy: Record<string, unknown> = {}
    proxy.eq = () => chain(resolver)
    proxy.lte = () => chain(resolver)
    proxy.gte = () => chain(resolver)
    proxy.order = () => chain(resolver)
    proxy.limit = () => chain(resolver)
    proxy.in = () => chain(resolver)
    proxy.select = () => chain(resolver)
    proxy.single = () => resolver()
    proxy.maybeSingle = () => resolver()
    proxy.then = (onFulfilled: (v: { data: unknown; error: null }) => unknown) => resolver().then(onFulfilled)
    return proxy as Record<string, unknown> & PromiseLike<{ data: unknown; error: null }>
  }

  function fromHandler(table: string) {
    if (table === 'social_posts') {
      return {
        update(patch: Partial<StoredPost>) {
          // The "claim" call uses .update().eq().eq().eq().select().maybeSingle()
          // — we detect it by presence of `status: 'publishing'`. Other updates
          // (failed / scheduled / published) just mutate.
          if (patch.status === 'publishing') {
            if (refuseNextClaim) {
              refuseNextClaim = false
              return chain(async () => ({ data: null, error: null }))
            }
            Object.assign(post, patch)
            return chain(async () => ({ data: { ...post }, error: null }))
          }
          Object.assign(post, patch)
          return chain(async () => ({ data: null, error: null }))
        },
      }
    }
    if (table === 'social_accounts') {
      return {
        select() {
          return chain(async () => ({ data: opts.account ? { ...opts.account } : null, error: null }))
        },
        update(patch: Partial<StoredAccount>) {
          if (opts.account) Object.assign(opts.account, patch)
          return chain(async () => ({ data: null, error: null }))
        },
      }
    }
    throw new Error(`Unexpected table: ${table}`)
  }
  return { from: fromHandler } as never
}

function basePost(overrides: Partial<StoredPost> = {}): StoredPost {
  return {
    id: 'p1',
    user_id: 'u1',
    project_id: 'pr1',
    platform: 'twitter',
    content: 'hello world',
    media_urls: [],
    status: 'scheduled',
    scheduled_at: new Date().toISOString(),
    published_at: null,
    attempts: 0,
    external_id: null,
    external_url: null,
    last_error: null,
    ...overrides,
  }
}

function account(overrides: Partial<StoredAccount> = {}): StoredAccount {
  return {
    id: 'a1',
    platform: 'twitter',
    expires_at: null,
    access_token_encrypted: encryptToken('tok'),
    external_account_id: '1234',
    last_publish_at: null,
    last_error: null,
    ...overrides,
  }
}

describe('dispatchPost', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch')
  })
  afterEach(() => {
    fetchSpy.mockRestore()
  })

  it('marks post failed when no account is connected', async () => {
    const post = basePost()
    const supabase = makeFakeSupabase({ post, account: null })
    const result = await dispatchPost(supabase, post)
    expect(result.ok).toBe(false)
    expect(result.finalStatus).toBe('failed')
    expect(post.status).toBe('failed')
    expect(post.attempts).toBe(1)
    expect(post.last_error).toMatch(/no connected/i)
  })

  it('marks post failed when account token is expired', async () => {
    const post = basePost()
    const acc = account({ expires_at: new Date(Date.now() - 10_000).toISOString() })
    const supabase = makeFakeSupabase({ post, account: acc })
    const result = await dispatchPost(supabase, post)
    expect(result.ok).toBe(false)
    expect(result.finalStatus).toBe('failed')
    expect(post.status).toBe('failed')
    expect(acc.last_error).toMatch(/expired/i)
  })

  it('publishes a tweet, writes external_id and url, clears errors', async () => {
    const post = basePost({ content: 'hi from test' })
    const acc = account()
    const supabase = makeFakeSupabase({ post, account: acc })
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ data: { id: '999', text: 'hi' } }), { status: 201 }),
    )

    const result = await dispatchPost(supabase, post)
    expect(result.ok).toBe(true)
    expect(result.finalStatus).toBe('published')
    expect(post.status).toBe('published')
    expect(post.external_id).toBe('999')
    expect(post.external_url).toContain('999')
    expect(post.attempts).toBe(1)
    expect(post.last_error).toBeNull()
    expect(acc.last_publish_at).not.toBeNull()
  })

  it('on transient publisher error, leaves status=scheduled until MAX_PUBLISH_ATTEMPTS', async () => {
    const post = basePost({ attempts: 0 })
    const acc = account()
    const supabase = makeFakeSupabase({ post, account: acc })
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ detail: 'rate limit' }), { status: 429 }),
    )

    const r1 = await dispatchPost(supabase, post)
    expect(r1.ok).toBe(false)
    expect(r1.finalStatus).toBe('scheduled')
    expect(post.status).toBe('scheduled')
    expect(post.attempts).toBe(1)
    expect(post.last_error).toMatch(/rate limit/)
  })

  it('after MAX_PUBLISH_ATTEMPTS, gives up and marks failed', async () => {
    const post = basePost({ attempts: MAX_PUBLISH_ATTEMPTS - 1 })
    const acc = account()
    const supabase = makeFakeSupabase({ post, account: acc })
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ detail: 'still broken' }), { status: 500 }),
    )

    const r = await dispatchPost(supabase, post)
    expect(r.ok).toBe(false)
    expect(r.finalStatus).toBe('failed')
    expect(post.status).toBe('failed')
    expect(post.attempts).toBe(MAX_PUBLISH_ATTEMPTS)
  })

  it('is idempotent for already-published posts', async () => {
    const post = basePost({ status: 'published', external_id: 'xyz', external_url: 'https://x.com/i/web/status/xyz' })
    const supabase = makeFakeSupabase({ post, account: null })
    const r = await dispatchPost(supabase, post)
    expect(r.ok).toBe(true)
    expect(r.finalStatus).toBe('published')
    expect(post.attempts).toBe(0)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('returns skipped without touching the platform if claim is lost (concurrent dispatcher)', async () => {
    const post = basePost()
    const acc = account()
    const supabase = makeFakeSupabase({ post, account: acc, refuseClaim: true })
    fetchSpy.mockResolvedValue(new Response('{}', { status: 200 }))

    const r = await dispatchPost(supabase, post)
    expect(r.ok).toBe(false)
    expect(r.finalStatus).toBe('skipped')
    expect(fetchSpy).not.toHaveBeenCalled()
    // Original row untouched by this dispatcher
    expect(post.attempts).toBe(0)
    expect(post.status).toBe('scheduled')
  })

  it('on twitter thread partial failure, persists partial_thread_ids for resume', async () => {
    const post = basePost({
      content: '[1/3] first\n\n[2/3] second\n\n[3/3] third',
    })
    const acc = account()
    const supabase = makeFakeSupabase({ post, account: acc })

    // First two tweets succeed, third fails.
    fetchSpy
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { id: '111', text: 'first' } }), { status: 201 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { id: '222', text: 'second' } }), { status: 201 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ detail: 'duplicate content' }), { status: 403 }))

    const r = await dispatchPost(supabase, post)
    expect(r.ok).toBe(false)
    expect(r.finalStatus).toBe('scheduled')
    expect(post.status).toBe('scheduled')
    expect((post.metadata as { partial_thread_ids?: string[] } | undefined)?.partial_thread_ids)
      .toEqual(['111', '222'])
    expect(post.last_error).toMatch(/3\/3/)
  })

  it('on retry of a partially-published thread, resumes from where it stopped', async () => {
    const post = basePost({
      content: '[1/3] first\n\n[2/3] second\n\n[3/3] third',
      attempts: 1,
      metadata: { partial_thread_ids: ['111', '222'] },
    })
    const acc = account()
    const supabase = makeFakeSupabase({ post, account: acc })

    // Only one fetch should fire — tweet 3 — because 1 and 2 were already posted.
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ data: { id: '333', text: 'third' } }), { status: 201 }),
    )

    const r = await dispatchPost(supabase, post)
    expect(r.ok).toBe(true)
    expect(r.finalStatus).toBe('published')
    expect(fetchSpy).toHaveBeenCalledTimes(1)

    // The body of that single call should be the third tweet, replying to 222
    const lastCall = fetchSpy.mock.calls[0]!
    const init = lastCall[1] as RequestInit
    const body = JSON.parse(init.body as string) as { text: string; reply?: { in_reply_to_tweet_id: string } }
    expect(body.text).toBe('third')
    expect(body.reply?.in_reply_to_tweet_id).toBe('222')

    expect(post.external_id).toBe('111') // first tweet of the thread
    expect((post.metadata as { thread_ids?: string[] } | undefined)?.thread_ids).toEqual(['111', '222', '333'])
  })
})
