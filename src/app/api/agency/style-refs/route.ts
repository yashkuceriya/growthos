import { createClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  const url = new URL(request.url)
  const kind = url.searchParams.get('kind')
  let query = supabase.from('style_references').select('*').eq('user_id', user.id).order('created_at', { ascending: false })
  if (kind) query = query.eq('asset_kind', kind)
  const { data } = await query.limit(50)
  return Response.json({ refs: data ?? [] })
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  const { projectId, asset_kind, asset_content, why_good, metric_proof } = await request.json()
  if (!asset_kind || !asset_content) return Response.json({ error: 'asset_kind and asset_content required' }, { status: 400 })
  const { data } = await supabase.from('style_references').insert({
    user_id: user.id,
    project_id: projectId ?? null,
    asset_kind,
    asset_content: String(asset_content).slice(0, 8000),
    why_good: why_good ?? null,
    metric_proof: metric_proof ?? null,
  }).select('id').single()
  return Response.json({ id: data?.id })
}

export async function DELETE(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await request.json()
  await supabase.from('style_references').delete().eq('user_id', user.id).eq('id', id)
  return Response.json({ ok: true })
}
