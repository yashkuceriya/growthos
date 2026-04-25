// State-machine tests for the publish dispatcher. We don't actually hit
// X/LinkedIn — we stub the publisher functions on globalThis.fetch and assert
// the post row + account row transitions.

import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest'
import { randomBytes } from 'crypto'

beforeAll(() => {
  process.env.SOCIAL_TOKEN_ENC_KEY = randomBytes(32).toString('base64')
})

import { encryptToken } from './encryption'
import { dispatchPost, MAX_PUBLISH_ATTEMPTS } from './index'
import type { SocialPostRow } from './types'

interface StoredPost {
  id: string
  status: string
  attempts: number
  external_id: string | null
  external_url: string | null
  last_error: string | null
  published_at: string | null
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

function makeFakeSupabase(opts: { post: StoredPost; account: StoredAccount | null }) {
  const post = opts.post
  const account = opts.account
  // Build a minimal chainable mock that handles the call patterns dispatchPost uses.
  function fromHandler(table: string) {
    if (table === 'social_posts') {
      return {
        update(patch: Partial<StoredPost>) {
          Object.assign(post, patch)
          return { eq: () => Promise.resolve({ error: null }) }
        },
      }
    }
    if (table === 'social_accounts') {
      return {
        select() {
          return {
            eq() {
              return {
                eq() {
                  return {
                    maybeSingle: () => Promise.resolve({ data: account ? { ...account } : null }),
                  }
                },
              }
            },
          }
        },
        update(patch: Partial<StoredAccount>) {
          if (account) Object.assign(account, patch)
          return { eq: () => Promise.resolve({ error: null }) }
        },
      }
    }
    throw new Error(`Unexpected table: ${table}`)
  }
  return { from: fromHandler } as never
}

function basePost(overrides: Partial<SocialPostRow> = {}): StoredPost & SocialPostRow {
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
    const account: StoredAccount = {
      id: 'a1',
      platform: 'twitter',
      expires_at: new Date(Date.now() - 10_000).toISOString(),
      access_token_encrypted: encryptToken('tok'),
      external_account_id: '1234',
      last_publish_at: null,
      last_error: null,
    }
    const supabase = makeFakeSupabase({ post, account })
    const result = await dispatchPost(supabase, post)
    expect(result.ok).toBe(false)
    expect(result.finalStatus).toBe('failed')
    expect(post.status).toBe('failed')
    expect(account.last_error).toMatch(/expired/i)
  })

  it('publishes a tweet, writes external_id and url, clears errors', async () => {
    const post = basePost({ content: 'hi from test' })
    const account: StoredAccount = {
      id: 'a1',
      platform: 'twitter',
      expires_at: null,
      access_token_encrypted: encryptToken('tok'),
      external_account_id: '1234',
      last_publish_at: null,
      last_error: null,
    }
    const supabase = makeFakeSupabase({ post, account })
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
    expect(account.last_publish_at).not.toBeNull()
  })

  it('on transient publisher error, leaves status=scheduled until MAX_PUBLISH_ATTEMPTS', async () => {
    const post = basePost({ attempts: 0 })
    const account: StoredAccount = {
      id: 'a1',
      platform: 'twitter',
      expires_at: null,
      access_token_encrypted: encryptToken('tok'),
      external_account_id: '1234',
      last_publish_at: null,
      last_error: null,
    }
    const supabase = makeFakeSupabase({ post, account })
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ detail: 'rate limit' }), { status: 429 }),
    )

    const r1 = await dispatchPost(supabase, post)
    expect(r1.ok).toBe(false)
    expect(r1.finalStatus).toBe('scheduled') // retryable
    expect(post.status).toBe('scheduled')
    expect(post.attempts).toBe(1)
    expect(post.last_error).toMatch(/rate limit/)
  })

  it('after MAX_PUBLISH_ATTEMPTS, gives up and marks failed', async () => {
    const post = basePost({ attempts: MAX_PUBLISH_ATTEMPTS - 1 })
    const account: StoredAccount = {
      id: 'a1',
      platform: 'twitter',
      expires_at: null,
      access_token_encrypted: encryptToken('tok'),
      external_account_id: '1234',
      last_publish_at: null,
      last_error: null,
    }
    const supabase = makeFakeSupabase({ post, account })
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
    // attempts should not increment, status untouched
    expect(post.attempts).toBe(0)
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
