// CRUD for connected social accounts. v1 uses a "paste token" flow — the user
// generates an OAuth access token in the platform's developer console (or via
// a one-shot OAuth helper outside GrowthOS) and pastes it here. We encrypt it
// with SOCIAL_TOKEN_ENC_KEY before persisting. Full 3-legged OAuth handshake
// can come in a later bundle once we have a public callback URL.

export const runtime = 'nodejs'

import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { wrapHandler } from '@/lib/api-error'
import { encryptToken } from '@/lib/deploy/encryption'

const PLATFORMS = ['twitter', 'linkedin', 'instagram'] as const

const PostSchema = z.object({
  project_id: z.string().uuid(),
  platform: z.enum(PLATFORMS),
  access_token: z.string().min(10),
  refresh_token: z.string().optional(),
  external_account_id: z.string().optional(),
  account_name: z.string().optional(),
  scopes: z.array(z.string()).optional(),
  expires_at: z.string().datetime().optional(),
})

async function handleGet(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const projectId = new URL(request.url).searchParams.get('project_id')
  let query = supabase
    .from('social_accounts')
    .select('id, project_id, platform, account_name, external_account_id, scopes, expires_at, last_publish_at, last_error, connected_at')
    .eq('user_id', user.id)
    .order('connected_at', { ascending: false })

  if (projectId) query = query.eq('project_id', projectId)

  const { data, error } = await query
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ accounts: data ?? [] })
}

async function handlePost(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = PostSchema.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? 'Invalid body' }, { status: 400 })
  }
  const body = parsed.data

  const access_token_encrypted = encryptToken(body.access_token)
  const refresh_token_encrypted = body.refresh_token ? encryptToken(body.refresh_token) : null

  const { data, error } = await supabase
    .from('social_accounts')
    .upsert({
      user_id: user.id,
      project_id: body.project_id,
      platform: body.platform,
      access_token_encrypted,
      refresh_token_encrypted,
      external_account_id: body.external_account_id ?? null,
      account_name: body.account_name ?? null,
      scopes: body.scopes ?? [],
      expires_at: body.expires_at ?? null,
      last_error: null,
    }, { onConflict: 'project_id,platform' })
    .select('id, platform, account_name, external_account_id, expires_at')
    .single()

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ account: data })
}

async function handleDelete(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await request.json().catch(() => ({})) as { id?: string }
  if (!id) return Response.json({ error: 'id required' }, { status: 400 })

  const { error } = await supabase
    .from('social_accounts')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ ok: true })
}

export const GET = wrapHandler(handleGet, 'social/accounts')
export const POST = wrapHandler(handlePost, 'social/accounts')
export const DELETE = wrapHandler(handleDelete, 'social/accounts')
