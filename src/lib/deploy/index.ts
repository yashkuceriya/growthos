// Dispatcher for publishing a `social_posts` row to its platform.
//
// Resolves the connected account for (project, platform), decrypts the OAuth
// access token, calls the platform publisher, and writes the result back to
// the post row. Encapsulates the status state machine so callers (cron,
// manual-publish API) only need a post id.
//
// Concurrency: callers may overlap (cron tick + "Publish now" button). We
// take the row by an atomic conditional UPDATE keyed on (id, status, attempts)
// — only one writer wins, the loser sees zero rows updated and bails. This
// replaces the read-then-write claim that had a TOCTOU window.

import type { SupabaseClient } from '@supabase/supabase-js'
import { decryptToken } from './encryption'
import { publishTweet } from './twitter'
import { publishLinkedInPost } from './linkedin'
import type { PublishResult, SocialAccountRow, SocialPostRow } from './types'
import { emitEvent } from '@/lib/webhooks/dispatch'
import type { SocialPublishedPayload } from '@/lib/webhooks/payloads'

export const MAX_PUBLISH_ATTEMPTS = 3

export interface DispatchOutcome {
  ok: boolean
  externalId?: string
  externalUrl?: string | null
  error?: string
  finalStatus: 'published' | 'failed' | 'scheduled' | 'skipped'
}

interface PublishContext {
  supabase: SupabaseClient
  post: SocialPostRow
  account: SocialAccountRow
  // Tweets that were already posted in a previous attempt (thread resume)
  resumeFromIndex: number
  priorThreadIds: string[]
}

async function callPublisher({ post, account, resumeFromIndex, priorThreadIds }: PublishContext): Promise<PublishResult> {
  if (!account.access_token_encrypted) {
    throw new Error(`No access token on connected ${account.platform} account`)
  }
  const token = decryptToken(account.access_token_encrypted)

  switch (post.platform) {
    case 'twitter':
    case 'x':
      return publishTweet(token, post.content, account.external_account_id, {
        resumeFromIndex,
        priorThreadIds,
      })
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
 * Atomically claim a post row for publishing. Returns the post in its claimed
 * state (status='publishing', attempts incremented), or null if another writer
 * already claimed it. The conditional UPDATE keys on (id, status, attempts) —
 * if either field has shifted between the caller's snapshot and the write, the
 * row is considered claimed-by-someone-else and we abort.
 */
async function claimPost(
  supabase: SupabaseClient,
  post: SocialPostRow,
): Promise<SocialPostRow | null> {
  const nextAttempts = post.attempts + 1
  const { data } = await supabase
    .from('social_posts')
    .update({
      status: 'publishing',
      attempts: nextAttempts,
      last_attempt_at: new Date().toISOString(),
    })
    .eq('id', post.id)
    .eq('status', post.status)
    .eq('attempts', post.attempts)
    .select('*')
    .maybeSingle()

  if (!data) return null
  return data as SocialPostRow
}

interface PostMetadata {
  thread_ids?: string[]
  partial_thread_ids?: string[]
  [key: string]: unknown
}

function readPriorThreadIds(post: SocialPostRow): string[] {
  const meta = (post as unknown as { metadata?: PostMetadata }).metadata
  return meta?.partial_thread_ids ?? []
}

/**
 * Publish a single post. Caller has already loaded the row. Updates the row
 * (status, attempts, external_id, last_error). Idempotent on `published`:
 * if the post is already published this no-ops. Concurrency-safe: if another
 * writer claims this row first, returns finalStatus='skipped' without
 * touching the platform.
 */
export async function dispatchPost(
  supabase: SupabaseClient,
  post: SocialPostRow,
): Promise<DispatchOutcome> {
  if (post.status === 'published' && post.external_id) {
    return { ok: true, externalId: post.external_id, externalUrl: post.external_url, finalStatus: 'published' }
  }

  const claimed = await claimPost(supabase, post)
  if (!claimed) {
    return { ok: false, error: 'Post already being published by another worker', finalStatus: 'skipped' }
  }

  const account = await loadAccount(supabase, claimed.project_id, claimed.platform)
  if (!account) {
    const msg = `No connected ${claimed.platform} account for this project`
    await supabase
      .from('social_posts')
      .update({ status: 'failed', last_error: msg })
      .eq('id', claimed.id)
    return { ok: false, error: msg, finalStatus: 'failed' }
  }

  if (account.expires_at && new Date(account.expires_at).getTime() < Date.now()) {
    const msg = `${claimed.platform} access token expired — reconnect the account`
    await supabase
      .from('social_posts')
      .update({ status: 'failed', last_error: msg })
      .eq('id', claimed.id)
    await supabase
      .from('social_accounts')
      .update({ last_error: msg })
      .eq('id', account.id)
    return { ok: false, error: msg, finalStatus: 'failed' }
  }

  const priorThreadIds = readPriorThreadIds(claimed)

  try {
    const result = await callPublisher({
      supabase,
      post: claimed,
      account,
      resumeFromIndex: priorThreadIds.length,
      priorThreadIds,
    })
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
      .eq('id', claimed.id)
    await supabase
      .from('social_accounts')
      .update({ last_publish_at: new Date().toISOString(), last_error: null })
      .eq('id', account.id)

    const publishedPayload: SocialPublishedPayload = {
      post_id: claimed.id,
      project_id: claimed.project_id,
      platform: claimed.platform,
      external_id: result.externalId,
      external_url: result.externalUrl ?? null,
      published_at: new Date().toISOString(),
    }
    await emitEvent({
      supabase,
      userId: claimed.user_id,
      projectId: claimed.project_id,
      eventType: 'social.published',
      payload: publishedPayload as unknown as Record<string, unknown>,
    })

    return {
      ok: true,
      externalId: result.externalId,
      externalUrl: result.externalUrl,
      finalStatus: 'published',
    }
  } catch (err) {
    // For Twitter threads, the publisher attaches partial_thread_ids to the
    // error so we can resume on the next attempt instead of duplicating.
    const partialIds = (err as { partialThreadIds?: string[] })?.partialThreadIds ?? []
    const msg = err instanceof Error ? err.message : 'Unknown publish error'
    const giveUp = claimed.attempts >= MAX_PUBLISH_ATTEMPTS

    const update: Record<string, unknown> = {
      status: giveUp ? 'failed' : 'scheduled',
      last_error: msg,
    }
    if (partialIds.length > 0) {
      // Persist what we got out so the next dispatch picks up where we stopped.
      update.metadata = { partial_thread_ids: partialIds }
    }

    await supabase.from('social_posts').update(update).eq('id', claimed.id)
    return { ok: false, error: msg, finalStatus: giveUp ? 'failed' : 'scheduled' }
  }
}
