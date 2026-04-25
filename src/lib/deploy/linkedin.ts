// LinkedIn publishing via the UGC Posts API.
//
// LinkedIn requires the author to be specified as a `urn:li:person:<id>` (or
// `urn:li:organization:<id>`). We expect that URN in social_accounts.external_account_id
// — set during account connection. Posts are public for v1 (lifecycleState=PUBLISHED,
// visibility=PUBLIC). Media posts and document attachments are out of scope for now.

import type { PublishResult } from './types'

interface UgcPostResponse {
  id?: string
  message?: string
  status?: number
  errorDetailType?: string
}

export async function publishLinkedInPost(
  accessToken: string,
  content: string,
  authorUrn: string | null,
): Promise<PublishResult> {
  if (!authorUrn) {
    throw new Error('LinkedIn account is missing author URN — reconnect the account')
  }

  const body = {
    author: authorUrn,
    lifecycleState: 'PUBLISHED',
    specificContent: {
      'com.linkedin.ugc.ShareContent': {
        shareCommentary: { text: content },
        shareMediaCategory: 'NONE',
      },
    },
    visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' },
  }

  const res = await fetch('https://api.linkedin.com/v2/ugcPosts', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'X-Restli-Protocol-Version': '2.0.0',
    },
    body: JSON.stringify(body),
  })

  // LinkedIn returns the post URN in the x-restli-id header on 201, but also
  // includes it in the body for v2. Read both.
  const headerId = res.headers.get('x-restli-id')
  const json = (await res.json().catch(() => ({}))) as UgcPostResponse

  if (!res.ok) {
    const msg = json.message || `HTTP ${res.status}`
    throw new Error(`LinkedIn API: ${msg}`)
  }

  const externalId = headerId || json.id
  if (!externalId) throw new Error('LinkedIn API: response had no post id')

  // ugcPost URNs look like `urn:li:share:6993...` or `urn:li:ugcPost:6993...`.
  // Public URL needs the trailing numeric id. Don't fabricate a URL if the
  // shape isn't what we expect — better to skip the backlink than to point
  // somewhere broken.
  const tail = externalId.split(':').pop() ?? ''
  const externalUrl = /^\d+$/.test(tail)
    ? `https://www.linkedin.com/feed/update/urn:li:share:${tail}/`
    : null

  return {
    externalId,
    externalUrl,
    metadata: { author_urn: authorUrn },
  }
}
