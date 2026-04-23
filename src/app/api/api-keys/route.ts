// Authenticated UI endpoints for minting/listing/revoking API keys.
// Plaintext key is ONLY returned on POST (mint); it's never re-readable from
// the DB after that. List/revoke are safe to call repeatedly.

import { createClient } from '@/lib/supabase/server'
import { wrapHandler } from '@/lib/api-error'
import { generateApiKey, type Scope } from '@/lib/api-auth'

const VALID_SCOPES: Scope[] = ['leads:write', 'projects:ingest', 'projects:read']

async function handleGet() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { data } = await supabase
    .from('api_keys')
    .select('id, name, prefix, scopes, last_used_at, expires_at, revoked_at, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  return Response.json({ keys: data ?? [] })
}

async function handlePost(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { name, scopes, expires_in_days } = await request.json()
  if (!name || typeof name !== 'string') {
    return Response.json({ error: 'name required' }, { status: 400 })
  }
  const requestedScopes: Scope[] = Array.isArray(scopes)
    ? scopes.filter((s): s is Scope => VALID_SCOPES.includes(s as Scope))
    : []
  if (requestedScopes.length === 0) {
    return Response.json({ error: `At least one scope required: ${VALID_SCOPES.join(', ')}` }, { status: 400 })
  }

  const { plaintext, prefix, hash } = generateApiKey()
  const expires_at = typeof expires_in_days === 'number' && expires_in_days > 0
    ? new Date(Date.now() + expires_in_days * 24 * 60 * 60 * 1000).toISOString()
    : null

  const { data, error } = await supabase.from('api_keys').insert({
    user_id: user.id,
    name,
    prefix,
    key_hash: hash,
    scopes: requestedScopes,
    expires_at,
  }).select('id, name, prefix, scopes, expires_at, created_at').single()

  if (error) return Response.json({ error: error.message }, { status: 500 })

  // Only time plaintext is ever returned
  return Response.json({ key: plaintext, record: data })
}

async function handleDelete(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await request.json()
  if (!id) return Response.json({ error: 'id required' }, { status: 400 })

  const { error } = await supabase
    .from('api_keys')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ ok: true })
}

export const GET = wrapHandler(async () => handleGet(), 'api-keys')
export const POST = wrapHandler(handlePost, 'api-keys')
export const DELETE = wrapHandler(handleDelete, 'api-keys')
