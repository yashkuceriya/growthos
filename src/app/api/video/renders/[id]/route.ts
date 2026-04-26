// Delete a video render row. We don't try to cancel upstream — fal/openai/xai
// charge on completion regardless, so deleting our row just hides it from the
// gallery. If the user wants the URL back later they can poll the provider's
// dashboard directly.

export const runtime = 'nodejs'

import { createClient } from '@/lib/supabase/server'
import { wrapHandler } from '@/lib/api-error'

async function handleDelete(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const url = new URL(request.url)
  const parts = url.pathname.split('/').filter(Boolean)
  const renderId = parts[parts.length - 1]
  if (!renderId) return Response.json({ error: 'Missing render id' }, { status: 400 })

  const { error } = await supabase
    .from('video_renders')
    .delete()
    .eq('id', renderId)
    .eq('user_id', user.id)
  if (error) return Response.json({ error: error.message }, { status: 500 })

  return Response.json({ ok: true })
}

export const DELETE = wrapHandler(handleDelete, 'video/renders/:id')
