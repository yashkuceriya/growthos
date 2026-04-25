// LinkedIn engagement is fragmented across endpoints:
//
// - /v2/socialActions/{urn}                  → likesSummary.totalLikes,
//                                              commentsSummary.totalFirstLevelComments
// - /v2/organizationalEntityShareStatistics  → impressions/clicks (org admin only)
//
// For v1 we hit socialActions only — works for personal posts and gives us
// likes + replies. Impressions stays null (will require org-admin connection
// to backfill, which we don't have in the paste-token flow yet).

import type { NormalizedEngagement } from './engagement-types'

interface SocialActionsResponse {
  likesSummary?: { totalLikes?: number; aggregatedTotalLikes?: number }
  commentsSummary?: { totalFirstLevelComments?: number; aggregatedTotalComments?: number }
  message?: string
  status?: number
}

export async function fetchLinkedInEngagement(
  accessToken: string,
  shareUrn: string,
): Promise<NormalizedEngagement> {
  if (!shareUrn) throw new Error('Missing share URN')

  // LinkedIn requires URL-encoded URN in the path
  const encoded = encodeURIComponent(shareUrn)
  const url = `https://api.linkedin.com/v2/socialActions/${encoded}`

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'X-Restli-Protocol-Version': '2.0.0',
    },
  })

  const json = (await res.json().catch(() => ({}))) as SocialActionsResponse
  if (!res.ok) {
    const msg = json.message || `HTTP ${res.status}`
    throw new Error(`LinkedIn engagement: ${msg}`)
  }

  const likes = json.likesSummary?.aggregatedTotalLikes ?? json.likesSummary?.totalLikes ?? 0
  const replies =
    json.commentsSummary?.aggregatedTotalComments ?? json.commentsSummary?.totalFirstLevelComments ?? 0

  return {
    likes,
    replies,
    shares: 0, // socialActions doesn't expose share count
    impressions: null,
    synced_at: new Date().toISOString(),
    platform_raw: { social_actions: json },
  }
}
