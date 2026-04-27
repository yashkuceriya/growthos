// Typed payload shapes for each event GrowthOS emits. The `emitEvent` call
// site casts to Record<string, unknown>, but we constrain the input shape
// here so callers can't accidentally drop a field that downstream
// receivers will look for. Treat these types as the public contract — bump
// to `*.v2` and add a new event name if you need to break compatibility.

export interface IngestCompletedPayload {
  job_id: string
  project_id: string
  url: string
  brand: Record<string, unknown>
}

export interface IngestFailedPayload {
  job_id: string
  project_id: string
  url: string
  error: string
  attempts: number
  permanent: boolean
}

export interface LeadCreatedPayload {
  lead_id: string
  project_id: string
  email: string
  name: string | null
  source: string
  source_id: string | null
  campaign_id: string | null
  utm: {
    source: string | null
    medium: string | null
    campaign: string | null
    content: string | null
    term: string | null
  }
  score: number
  created_at: string
}

export interface SocialPublishedPayload {
  post_id: string
  project_id: string
  platform: string
  external_id: string
  external_url: string | null
  published_at: string
}

export interface EmailBouncedPayload {
  send_id: string
  project_id: string | null
  subscriber_id: string | null
  template_id: string | null
  bounced_at: string
}
