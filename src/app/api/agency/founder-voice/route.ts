import { createClient } from '@/lib/supabase/server'
import { wrapHandler, wrapHandlerNoArgs } from '@/lib/api-error'

async function handleGet() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  const { data } = await supabase.from('founder_voice').select('*').eq('user_id', user.id).maybeSingle()
  return Response.json({ samples: data?.samples ?? [], style_notes: data?.style_notes ?? '' })
}

async function handlePost(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  const { samples, style_notes } = await request.json()
  await supabase.from('founder_voice').upsert({
    user_id: user.id,
    samples: Array.isArray(samples) ? samples.slice(0, 30) : [],
    style_notes: typeof style_notes === 'string' ? style_notes.slice(0, 2000) : null,
    updated_at: new Date().toISOString(),
  })
  return Response.json({ ok: true })
}

export const GET = wrapHandlerNoArgs(handleGet, 'agency/founder-voice')
export const POST = wrapHandler(handlePost, 'agency/founder-voice')
