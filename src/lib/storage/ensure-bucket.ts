// Self-healing bucket helper. If a Storage bucket doesn't exist when we
// first try to use it, create it. Without this, the system silently
// stores data: URLs in DB rows (bloat) or upstream signed URLs that
// expire in 24-48h (broken assets after the cache miss).
//
// Memoized per-process: the listBuckets/createBucket round-trip happens
// once per bucket per process, then we just remember it's good.
//
// Buckets are created public by default — every consumer of these
// (ad images displayed in Meta ads, screenshots shown in webhook
// payloads, videos embedded on social posts) needs anonymous reach.
// If a project has stricter requirements, create the bucket manually
// with custom policies and ensureBucket will skip the create.

import type { SupabaseClient } from '@supabase/supabase-js'

const memo = new Map<string, Promise<boolean>>()

/**
 * Make sure `name` exists as a public bucket. Returns true if the bucket
 * is usable (existed already, or we created it). Returns false on
 * permanent failure (no permission, etc).
 *
 * Pass a service-role client — anon role can't create buckets.
 */
export function ensureBucket(supabase: SupabaseClient, name: string): Promise<boolean> {
  const cached = memo.get(name)
  if (cached) return cached
  const work = (async () => {
    try {
      const { data: buckets, error: listErr } = await supabase.storage.listBuckets()
      if (listErr) {
        console.error(`[storage] listBuckets failed for "${name}":`, listErr.message)
        return false
      }
      if (buckets?.some((b) => b.name === name)) return true

      const { error: createErr } = await supabase.storage.createBucket(name, {
        public: true,
      })
      if (createErr) {
        // 23505-ish: another concurrent caller may have just made it.
        // Re-check.
        const { data: bucketsAgain } = await supabase.storage.listBuckets()
        if (bucketsAgain?.some((b) => b.name === name)) return true
        console.error(`[storage] createBucket failed for "${name}":`, createErr.message)
        return false
      }
      console.log(`[storage] auto-created public bucket "${name}"`)
      return true
    } catch (err) {
      console.error(`[storage] ensureBucket("${name}") threw:`, err instanceof Error ? err.message : err)
      return false
    }
  })()
  memo.set(name, work)
  return work
}

/** Test-only: clear memoization between tests. */
export function __resetEnsureBucketCache() {
  memo.clear()
}
