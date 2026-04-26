// Promote a single ad_copy as the winner of its variant_group. Marks it
// human_approved + is_best=true, and sets all sibling variants in the same
// variant_group to 'rejected' so they don't keep appearing in review queues.
// Safe to call on ads without a variant_group (no-op on siblings).

import { createClient } from '@/lib/supabase/server'
import { wrapHandler } from '@/lib/api-error'

async function handlePost(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { adCopyId } = await request.json()
  if (!adCopyId) return Response.json({ error: 'adCopyId required' }, { status: 400 })

  // Load the ad to get its variant_group + ensure the caller owns it
  const { data: ad } = await supabase
    .from('ad_copies')
    .select('id, user_id, variant_group')
    .eq('id', adCopyId)
    .maybeSingle()

  if (!ad) return Response.json({ error: 'Ad copy not found' }, { status: 404 })
  if (ad.user_id !== user.id) return Response.json({ error: 'Forbidden' }, { status: 403 })

  // Promote the winner
  const { error: promoteErr } = await supabase
    .from('ad_copies')
    .update({
      status: 'human_approved',
      is_best: true,
      approved_at: new Date().toISOString(),
    })
    .eq('id', adCopyId)

  if (promoteErr) return Response.json({ error: promoteErr.message }, { status: 500 })

  // Archive losers within the same variant_group
  let lostCount = 0
  if (ad.variant_group) {
    const { data: losers } = await supabase
      .from('ad_copies')
      .update({ status: 'rejected', is_best: false })
      .eq('variant_group', ad.variant_group)
      .neq('id', adCopyId)
      .select('id')

    lostCount = losers?.length ?? 0
  }

  return Response.json({ promoted: adCopyId, archived: lostCount })
}

export const POST = wrapHandler(handlePost, 'ad-copies/promote-winner')
