// Optional Supabase Storage mirror for completed video renders.
//
// fal / openai / xai serve videos from signed CDN URLs that expire 24-48h
// later. If the user wants their library to survive long-term, set
// VIDEO_STORAGE_BUCKET and we'll fetch the clip on completion and upload
// it to Supabase Storage — the public URL replaces the upstream URL on the
// video_renders row.
//
// If the env var is unset OR the upload fails, we leave the upstream URL
// in place. The feature is opt-in and never blocks completion.

import type { SupabaseClient } from '@supabase/supabase-js'

export interface MirrorResult {
  mirrored: boolean
  newUrl?: string
  error?: string
}

export async function mirrorToStorage(
  supabase: SupabaseClient,
  args: { renderId: string; userId: string; sourceUrl: string },
): Promise<MirrorResult> {
  const bucket = process.env.VIDEO_STORAGE_BUCKET
  if (!bucket) return { mirrored: false }

  try {
    const res = await fetch(args.sourceUrl)
    if (!res.ok) throw new Error(`Source fetch HTTP ${res.status}`)
    const buf = await res.arrayBuffer()

    // Path: <user_id>/<render_id>.mp4 — keeps user data segregated and is
    // trivially RLS-able if the bucket has per-user policies.
    const path = `${args.userId}/${args.renderId}.mp4`

    const { error: uploadErr } = await supabase.storage
      .from(bucket)
      .upload(path, buf, {
        contentType: 'video/mp4',
        upsert: true,
      })
    if (uploadErr) throw new Error(uploadErr.message)

    const { data } = supabase.storage.from(bucket).getPublicUrl(path)
    if (!data?.publicUrl) throw new Error('No public URL returned')
    return { mirrored: true, newUrl: data.publicUrl }
  } catch (err) {
    return {
      mirrored: false,
      error: err instanceof Error ? err.message : 'mirror failed',
    }
  }
}
