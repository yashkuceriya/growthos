// Engagement sync dispatcher. Mirrors deploy/index.ts but for the read path:
// load post + account, decrypt token, call platform puller, write metrics
// back to social_posts.engagement.

import type { SupabaseClient } from '@supabase/supabase-js'
import { decryptToken } from './encryption'
import { fetchTweetEngagement } from './twitter-engagement'
import { fetchLinkedInEngagement } from './linkedin-engagement'
import type { NormalizedEngagement } from './engagement-types'
import type { SocialAccountRow, SocialPostRow } from './types'

export interface SyncOutcome {
  ok: boolean
  engagement?: NormalizedEngagement
  error?: string
}

interface PostWithMetadata extends SocialPostRow {
  metadata?: { thread_ids?: string[]; partial_thread_ids?: string[] } | null
}

async function loadAccount(
  supabase: SupabaseClient,
  projectId: string,
  platform: string,
): Promise<SocialAccountRow | null> {
  const { data } = await supabase
    .from('social_accounts')
    .select('*')
    .eq('project_id', projectId)
    .eq('platform', platform)
    .maybeSingle()
  return (data as SocialAccountRow | null) ?? null
}

async function callPuller(
  account: SocialAccountRow,
  post: PostWithMetadata,
): Promise<NormalizedEngagement> {
  if (!account.access_token_encrypted) {
    throw new Error(`No access token on connected ${account.platform} account`)
  }
  const token = decryptToken(account.access_token_encrypted)

  switch (post.platform) {
    case 'twitter':
    case 'x': {
      // Threads have ids in metadata.thread_ids; standalone tweets only have external_id.
      const ids = post.metadata?.thread_ids ?? (post.external_id ? [post.external_id] : [])
      if (ids.length === 0) throw new Error('No tweet ids on post')
      return fetchTweetEngagement(token, ids)
    }
    case 'linkedin': {
      if (!post.external_id) throw new Error('No share URN on post')
      return fetchLinkedInEngagement(token, post.external_id)
    }
    default:
      throw new Error(`Engagement sync not supported for platform: ${post.platform}`)
  }
}

export async function syncPostEngagement(
  supabase: SupabaseClient,
  post: SocialPostRow,
): Promise<SyncOutcome> {
  if (post.status !== 'published' || !post.external_id) {
    return { ok: false, error: 'Post is not published or has no external_id' }
  }

  const account = await loadAccount(supabase, post.project_id, post.platform)
  if (!account) {
    const msg = `No connected ${post.platform} account`
    await supabase
      .from('social_posts')
      .update({ engagement_synced_at: new Date().toISOString(), engagement_sync_error: msg })
      .eq('id', post.id)
    return { ok: false, error: msg }
  }

  try {
    const engagement = await callPuller(account, post as PostWithMetadata)
    await supabase
      .from('social_posts')
      .update({
        engagement,
        engagement_synced_at: new Date().toISOString(),
        engagement_sync_error: null,
      })
      .eq('id', post.id)
    return { ok: true, engagement }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown sync error'
    // Stamp engagement_synced_at even on failure so we don't hammer the API
    // for a permanently-broken row every tick. The error column tells the UI.
    await supabase
      .from('social_posts')
      .update({
        engagement_synced_at: new Date().toISOString(),
        engagement_sync_error: msg,
      })
      .eq('id', post.id)
    return { ok: false, error: msg }
  }
}
