// Normalized engagement shape we store on social_posts.engagement (jsonb).
// Per-platform pullers map their native response into this. `platform_raw`
// keeps the original payload around for debugging without polluting the
// canonical fields we surface in the UI.

export interface NormalizedEngagement {
  likes: number
  replies: number
  shares: number
  impressions: number | null  // X reports it; LinkedIn doesn't (without org admin)
  bookmarks?: number          // X-only
  synced_at: string
  platform_raw: Record<string, unknown>
}

export const EMPTY_ENGAGEMENT: NormalizedEngagement = {
  likes: 0,
  replies: 0,
  shares: 0,
  impressions: null,
  synced_at: new Date(0).toISOString(),
  platform_raw: {},
}
