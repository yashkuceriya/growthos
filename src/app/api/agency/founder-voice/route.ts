import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  const { data } = await supabase.from('founder_voice').select('*').eq('user_id', user.id).maybeSingle()
  return Response.json({ samples: data?.samples ?? [], style_notes: data?.style_notes ?? '' })
}

export async function POST(request: Request) {
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
