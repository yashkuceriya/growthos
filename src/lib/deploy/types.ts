export interface PublishResult {
  externalId: string
  externalUrl: string | null
  metadata: Record<string, unknown>
}

export interface SocialAccountRow {
  id: string
  user_id: string
  project_id: string
  platform: string
  account_name: string | null
  access_token_encrypted: string | null
  refresh_token_encrypted: string | null
  external_account_id: string | null
  scopes: string[]
  expires_at: string | null
  metadata: Record<string, unknown>
}

export interface SocialPostRow {
  id: string
  user_id: string
  project_id: string
  platform: string
  content: string
  media_urls: string[]
  status: string
  scheduled_at: string | null
  published_at: string | null
  attempts: number
  external_id: string | null
  external_url: string | null
  last_error: string | null
  metadata?: { thread_ids?: string[]; partial_thread_ids?: string[]; [k: string]: unknown } | null
  engagement?: Record<string, unknown> | null
  engagement_synced_at?: string | null
  engagement_sync_error?: string | null
  is_winner?: boolean
  winner_score?: number | null
  winner_promoted_at?: string | null
}
