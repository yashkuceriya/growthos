// Dispatcher for publishing a `social_posts` row to its platform.
//
// Resolves the connected account for (project, platform), decrypts the OAuth
// access token, calls the platform publisher, and writes the result back to
// the post row. Encapsulates the status state machine so callers (cron,
// manual-publish API) only need a post id.

import type { SupabaseClient } from '@supabase/supabase-js'
import { decryptToken } from './encryption'
import { publishTweet } from './twitter'
import { publishLinkedInPost } from './linkedin'
import type { PublishResult, SocialAccountRow, SocialPostRow } from './types'

export const MAX_PUBLISH_ATTEMPTS = 3

export interface DispatchOutcome {
  ok: boolean
  externalId?: string
  externalUrl?: string | null
  error?: string
  finalStatus: 'published' | 'failed' | 'scheduled'
}

interface PublishContext {
  supabase: SupabaseClient
  post: SocialPostRow
  account: SocialAccountRow
}

async function callPublisher({ post, account }: PublishContext): Promise<PublishResult> {
  if (!account.access_token_encrypted) {
    throw new Error(`No access token on connected ${account.platform} account`)
  }
  const token = decryptToken(account.access_token_encrypted)

  switch (post.platform) {
    case 'twitter':
    case 'x':
      return publishTweet(token, post.content, account.external_account_id)
    case 'linkedin':
      return publishLinkedInPost(token, post.content, account.external_account_id)
    case 'instagram':
      // Meta Graph requires container-based publishing + media; not in this bundle.
      throw new Error('Instagram publishing not yet supported — coming soon')
    default:
      throw new Error(`Unsupported platform: ${post.platform}`)
  }
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

/**
 * Publish a single post. Caller has already loaded the row. Updates the row
 * (status, attempts, external_id, last_error). Idempotent on `published`:
 * if the post is already published this no-ops.
 */
export async function dispatchPost(
  supabase: SupabaseClient,
  post: SocialPostRow,
): Promise<DispatchOutcome> {
  if (post.status === 'published' && post.external_id) {
    return { ok: true, externalId: post.external_id, externalUrl: post.external_url, finalStatus: 'published' }
  }

  // Mark in-flight so a retry-tick that fires before this one finishes
  // doesn't double-send. Increment attempts in the same write.
  const nextAttempts = post.attempts + 1
  await supabase
    .from('social_posts')
    .update({
      status: 'publishing',
      attempts: nextAttempts,
      last_attempt_at: new Date().toISOString(),
    })
    .eq('id', post.id)

  const account = await loadAccount(supabase, post.project_id, post.platform)
  if (!account) {
    const msg = `No connected ${post.platform} account for this project`
    await supabase
      .from('social_posts')
      .update({ status: 'failed', last_error: msg })
      .eq('id', post.id)
    return { ok: false, error: msg, finalStatus: 'failed' }
  }

  if (account.expires_at && new Date(account.expires_at).getTime() < Date.now()) {
    const msg = `${post.platform} access token expired — reconnect the account`
    await supabase
      .from('social_posts')
      .update({ status: 'failed', last_error: msg })
      .eq('id', post.id)
    await supabase
      .from('social_accounts')
      .update({ last_error: msg })
      .eq('id', account.id)
    return { ok: false, error: msg, finalStatus: 'failed' }
  }

  try {
    const result = await callPublisher({ supabase, post: { ...post, attempts: nextAttempts }, account })
    await supabase
      .from('social_posts')
      .update({
        status: 'published',
        published_at: new Date().toISOString(),
        external_id: result.externalId,
        external_url: result.externalUrl,
        last_error: null,
        metadata: result.metadata,
      })
      .eq('id', post.id)
    await supabase
      .from('social_accounts')
      .update({ last_publish_at: new Date().toISOString(), last_error: null })
      .eq('id', account.id)
    return {
      ok: true,
      externalId: result.externalId,
      externalUrl: result.externalUrl,
      finalStatus: 'published',
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown publish error'
    const giveUp = nextAttempts >= MAX_PUBLISH_ATTEMPTS
    await supabase
      .from('social_posts')
      .update({
        status: giveUp ? 'failed' : 'scheduled',
        last_error: msg,
      })
      .eq('id', post.id)
    return { ok: false, error: msg, finalStatus: giveUp ? 'failed' : 'scheduled' }
  }
}
