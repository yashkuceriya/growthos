import { describe, it, expect, beforeEach, vi } from 'vitest'

// authenticateApiKey() reaches for createServiceClient. Mock it so tests
// don't need real Supabase env. Each test seeds keyRow + tracks update
// calls via the in-memory state below.
let keyRow: {
  id: string
  user_id: string
  scopes: string[]
  revoked_at: string | null
  expires_at: string | null
} | null = null
const updateCalls: Array<{ id: string; patch: Record<string, unknown> }> = []

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => ({
    from: (table: string) => {
      if (table !== 'api_keys') throw new Error(`unexpected table: ${table}`)
      const proxy: Record<string, unknown> = {}
      proxy.select = () => proxy
      proxy.eq = (col: string, val: string) => {
        void col
        void val
        return proxy
      }
      proxy.maybeSingle = async () => ({ data: keyRow, error: null })
      proxy.update = (patch: Record<string, unknown>) => {
        const captured: Record<string, unknown> = {}
        const updateProxy: Record<string, unknown> = {
          eq: (col: string, val: string) => {
            if (col === 'id') captured.id = val
            return updateProxy
          },
          then: (res: (v: unknown) => unknown) => {
            updateCalls.push({ id: String(captured.id ?? ''), patch })
            return Promise.resolve({ data: null, error: null }).then(res)
          },
        }
        return updateProxy
      }
      return proxy
    },
  }),
}))

import { generateApiKey, hashKey, authenticateApiKey, type Scope } from './api-auth'

function makeRequest(token?: string): Request {
  const headers = new Headers()
  if (token !== undefined) headers.set('Authorization', token)
  return new Request('https://example.test/api/v1/anything', { headers })
}

beforeEach(() => {
  keyRow = null
  updateCalls.length = 0
})

describe('generateApiKey', () => {
  it('produces a key with the gos_live_ prefix', () => {
    const k = generateApiKey()
    expect(k.plaintext.startsWith('gos_live_')).toBe(true)
  })

  it('returns a prefix of length 17 (gos_live_ + 8 chars)', () => {
    const k = generateApiKey()
    expect(k.prefix.length).toBe(17)
    expect(k.prefix.startsWith('gos_live_')).toBe(true)
  })

  it('hash matches SHA-256 of plaintext', () => {
    const k = generateApiKey()
    expect(k.hash).toBe(hashKey(k.plaintext))
  })

  it('produces distinct keys on each call (high entropy)', () => {
    const a = generateApiKey()
    const b = generateApiKey()
    expect(a.plaintext).not.toBe(b.plaintext)
    expect(a.hash).not.toBe(b.hash)
  })
})

describe('hashKey', () => {
  it('is deterministic', () => {
    expect(hashKey('abc')).toBe(hashKey('abc'))
  })

  it('produces 64 hex chars (256-bit SHA)', () => {
    expect(hashKey('whatever')).toMatch(/^[a-f0-9]{64}$/)
  })
})

describe('authenticateApiKey', () => {
  // ── Header-shape rejections (these never touch the DB) ───────────────

  it('rejects missing Authorization header with 401', async () => {
    const result = await authenticateApiKey(makeRequest(), 'leads:write')
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.response.status).toBe(401)
    const body = await result.response.json()
    expect(body.error).toBe('Missing bearer token')
  })

  it('rejects header without Bearer prefix with 401', async () => {
    const result = await authenticateApiKey(makeRequest('Token gos_live_abc'), 'leads:write')
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.response.status).toBe(401)
  })

  it('rejects token without gos_live_ prefix with 401 invalid format', async () => {
    const result = await authenticateApiKey(makeRequest('Bearer some_other_token'), 'leads:write')
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.response.status).toBe(401)
    const body = await result.response.json()
    expect(body.error).toBe('Invalid token format')
  })

  // ── DB-backed rejections ─────────────────────────────────────────────

  it('rejects unknown key with 401 Invalid API key', async () => {
    keyRow = null // hash doesn't match anything
    const k = generateApiKey()
    const result = await authenticateApiKey(makeRequest(`Bearer ${k.plaintext}`), 'leads:write')
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.response.status).toBe(401)
    const body = await result.response.json()
    expect(body.error).toBe('Invalid API key')
  })

  it('rejects revoked key with 401 even if scope matches', async () => {
    keyRow = {
      id: 'k1',
      user_id: 'u1',
      scopes: ['leads:write'],
      revoked_at: new Date(Date.now() - 60_000).toISOString(),
      expires_at: null,
    }
    const k = generateApiKey()
    const result = await authenticateApiKey(makeRequest(`Bearer ${k.plaintext}`), 'leads:write')
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.response.status).toBe(401)
    const body = await result.response.json()
    expect(body.error).toBe('API key revoked')
  })

  it('rejects expired key with 401', async () => {
    keyRow = {
      id: 'k1',
      user_id: 'u1',
      scopes: ['leads:write'],
      revoked_at: null,
      expires_at: new Date(Date.now() - 1_000).toISOString(),
    }
    const k = generateApiKey()
    const result = await authenticateApiKey(makeRequest(`Bearer ${k.plaintext}`), 'leads:write')
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.response.status).toBe(401)
    const body = await result.response.json()
    expect(body.error).toBe('API key expired')
  })

  it('accepts a key whose expires_at is in the future', async () => {
    keyRow = {
      id: 'k1',
      user_id: 'u1',
      scopes: ['leads:write'],
      revoked_at: null,
      expires_at: new Date(Date.now() + 60 * 60_000).toISOString(),
    }
    const k = generateApiKey()
    const result = await authenticateApiKey(makeRequest(`Bearer ${k.plaintext}`), 'leads:write')
    expect(result.ok).toBe(true)
  })

  it('accepts a key with no expires_at (never-expires)', async () => {
    keyRow = {
      id: 'k1',
      user_id: 'u1',
      scopes: ['leads:write'],
      revoked_at: null,
      expires_at: null,
    }
    const k = generateApiKey()
    const result = await authenticateApiKey(makeRequest(`Bearer ${k.plaintext}`), 'leads:write')
    expect(result.ok).toBe(true)
  })

  // ── Scope gate ───────────────────────────────────────────────────────

  it('rejects with 403 when required scope is not on the key', async () => {
    keyRow = {
      id: 'k1',
      user_id: 'u1',
      scopes: ['projects:read'], // doesn't include leads:write
      revoked_at: null,
      expires_at: null,
    }
    const k = generateApiKey()
    const result = await authenticateApiKey(makeRequest(`Bearer ${k.plaintext}`), 'leads:write')
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.response.status).toBe(403)
    const body = await result.response.json()
    expect(body.error).toContain('leads:write')
  })

  it('accepts any valid key when requiredScope is null (health-endpoint pattern)', async () => {
    keyRow = {
      id: 'k1',
      user_id: 'u1',
      scopes: ['projects:read'], // scope list is irrelevant for null
      revoked_at: null,
      expires_at: null,
    }
    const k = generateApiKey()
    const result = await authenticateApiKey(makeRequest(`Bearer ${k.plaintext}`), null)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.scopes).toContain('projects:read')
  })

  it('still rejects revoked keys when requiredScope is null', async () => {
    keyRow = {
      id: 'k1',
      user_id: 'u1',
      scopes: ['projects:read'],
      revoked_at: new Date(Date.now() - 60_000).toISOString(),
      expires_at: null,
    }
    const k = generateApiKey()
    const result = await authenticateApiKey(makeRequest(`Bearer ${k.plaintext}`), null)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.response.status).toBe(401)
  })

  it('accepts when key has the required scope alongside others', async () => {
    keyRow = {
      id: 'k1',
      user_id: 'u1',
      scopes: ['projects:read', 'leads:write', 'webhooks:write'] as Scope[],
      revoked_at: null,
      expires_at: null,
    }
    const k = generateApiKey()
    const result = await authenticateApiKey(makeRequest(`Bearer ${k.plaintext}`), 'leads:write')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.userId).toBe('u1')
    expect(result.keyId).toBe('k1')
    expect(result.scopes).toContain('leads:write')
    expect(result.scopes).toContain('webhooks:write')
  })

  // ── Side-effect: last_used_at touch ──────────────────────────────────

  it('touches last_used_at on success (fire-and-forget)', async () => {
    keyRow = {
      id: 'k1',
      user_id: 'u1',
      scopes: ['leads:write'],
      revoked_at: null,
      expires_at: null,
    }
    const k = generateApiKey()
    await authenticateApiKey(makeRequest(`Bearer ${k.plaintext}`), 'leads:write')
    // The void-prefixed update is fire-and-forget; flush microtasks so the
    // mock's `then` runs before we assert.
    await new Promise((r) => setImmediate(r))
    expect(updateCalls).toHaveLength(1)
    expect(updateCalls[0]!.id).toBe('k1')
    expect(updateCalls[0]!.patch).toHaveProperty('last_used_at')
  })

  it('does NOT touch last_used_at on auth failure', async () => {
    keyRow = {
      id: 'k1',
      user_id: 'u1',
      scopes: ['projects:read'],
      revoked_at: null,
      expires_at: null,
    }
    const k = generateApiKey()
    await authenticateApiKey(makeRequest(`Bearer ${k.plaintext}`), 'leads:write')
    await new Promise((r) => setImmediate(r))
    expect(updateCalls).toHaveLength(0)
  })
})
