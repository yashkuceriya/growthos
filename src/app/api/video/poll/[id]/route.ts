// Poll a single video_renders row. Idempotent — returns current state, and
// hits the upstream provider only if the row is still in flight.

export const runtime = 'nodejs'
export const maxDuration = 30

import { createClient, createServiceClient } from '@/lib/supabase/server'
import { wrapHandler } from '@/lib/api-error'
import { pollVideoRender } from '@/lib/video'

async function handle(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const url = new URL(request.url)
  const parts = url.pathname.split('/').filter(Boolean)
  const renderId = parts[parts.length - 1]
  if (!renderId) return Response.json({ error: 'Missing render id' }, { status: 400 })

  // Ownership gate via session client (RLS scopes to user)
  const { data: row } = await supabase
    .from('video_renders')
    .select('id')
    .eq('id', renderId)
    .maybeSingle()
  if (!row) return Response.json({ error: 'Render not found' }, { status: 404 })

  // Use service client for the actual poll + write so we don't fight RLS on
  // the cascading attached_to updates.
  const service = createServiceClient()
  const result = await pollVideoRender(service, renderId)

  return Response.json({
    renderId: result.renderId,
    status: result.status,
    videoUrl: result.videoUrl,
    error: result.error,
  })
}

export const GET = wrapHandler(handle, 'video/poll')
export const POST = wrapHandler(handle, 'video/poll')
