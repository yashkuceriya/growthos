// API key auth for /api/v1/* routes. Expects `Authorization: Bearer gos_live_<secret>`
// Keys are stored as SHA-256 hashes; we hash the incoming bearer and look it up.
//
// Usage in a route:
//   const auth = await authenticateApiKey(request, 'leads:write')
//   if (!auth.ok) return auth.response
//   // auth.userId is available, do the work

import { createServiceClient } from '@/lib/supabase/server'
import { createHash, randomBytes } from 'crypto'

export type Scope = 'leads:write' | 'projects:ingest' | 'projects:read' | 'webhooks:write'

export interface ApiAuthSuccess {
  ok: true
  userId: string
  keyId: string
  scopes: Scope[]
}

export interface ApiAuthFailure {
  ok: false
  response: Response
}

export function hashKey(plaintext: string): string {
  return createHash('sha256').update(plaintext).digest('hex')
}

export function generateApiKey(): { plaintext: string; prefix: string; hash: string } {
  const secret = randomBytes(24).toString('base64url') // 32 chars of url-safe entropy
  const plaintext = `gos_live_${secret}`
  return {
    plaintext,
    prefix: plaintext.slice(0, 17), // "gos_live_" + 8 chars
    hash: hashKey(plaintext),
  }
}

export async function authenticateApiKey(
  request: Request,
  requiredScope: Scope,
): Promise<ApiAuthSuccess | ApiAuthFailure> {
  const auth = request.headers.get('authorization')
  if (!auth?.startsWith('Bearer ')) {
    return {
      ok: false,
      response: Response.json({ error: 'Missing bearer token' }, { status: 401 }),
    }
  }

  const plaintext = auth.slice('Bearer '.length).trim()
  if (!plaintext.startsWith('gos_live_')) {
    return {
      ok: false,
      response: Response.json({ error: 'Invalid token format' }, { status: 401 }),
    }
  }

  const hash = hashKey(plaintext)
  const supabase = createServiceClient()
  const { data: key } = await supabase
    .from('api_keys')
    .select('id, user_id, scopes, revoked_at, expires_at')
    .eq('key_hash', hash)
    .maybeSingle() as { data: { id: string; user_id: string; scopes: string[]; revoked_at: string | null; expires_at: string | null } | null }

  if (!key) {
    return {
      ok: false,
      response: Response.json({ error: 'Invalid API key' }, { status: 401 }),
    }
  }

  if (key.revoked_at) {
    return {
      ok: false,
      response: Response.json({ error: 'API key revoked' }, { status: 401 }),
    }
  }

  if (key.expires_at && new Date(key.expires_at).getTime() < Date.now()) {
    return {
      ok: false,
      response: Response.json({ error: 'API key expired' }, { status: 401 }),
    }
  }

  if (!key.scopes.includes(requiredScope)) {
    return {
      ok: false,
      response: Response.json({ error: `Scope '${requiredScope}' not granted on this key` }, { status: 403 }),
    }
  }

  // Touch last_used_at without blocking the auth response. Supabase
  // builders are lazy — they only fire the HTTP request when `.then()` is
  // called (or the value is awaited). A bare `void builder.eq(...)` looks
  // fire-and-forget but actually discards the builder before it runs, so
  // we explicitly subscribe with a no-op then() to trigger the request and
  // swallow errors.
  supabase
    .from('api_keys')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', key.id)
    .then(() => {}, () => {})

  return {
    ok: true,
    userId: key.user_id,
    keyId: key.id,
    scopes: key.scopes as Scope[],
  }
}
