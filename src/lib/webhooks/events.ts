// Single source of truth for outbound webhook events. Producer code,
// the create-form picker, and the API Reference docs page all read from
// this registry — adding a new event means editing exactly this file
// (plus wiring an emitEvent call at the producer).
//
// When you add an event:
//   1. Add a payload type to lib/webhooks/payloads.ts
//   2. Add an entry below with label/hint/payload-field-list
//   3. Wire the emitEvent('event.name', payload) call at the producer
// The settings UI picker and /settings → API Reference auto-update.

export interface PayloadField {
  name: string
  /** Display type — keep loose, like 'string', 'string | null', '{...}' */
  type: string
  description?: string
}

export interface WebhookEventDef {
  /** Wire-format event name. Used in the `event` field of the delivered
   *  payload and as the subscription key on `webhook_endpoints.events`. */
  name: string
  /** Short label for UI lists. */
  label: string
  /** One-line description shown next to the picker checkbox. */
  hint: string
  /** Source: which producer code path emits this event. */
  source: string
  /** Field-by-field schema, rendered in the API Reference table. */
  payload: PayloadField[]
}

export const WEBHOOK_EVENTS: WebhookEventDef[] = [
  {
    name: 'ingest.completed',
    label: 'Ingest completed',
    hint: 'Project crawl finished — payload includes the merged brand_voice patch.',
    source: 'lib/jobs/ingest-queue.ts → runIngestJob (success path)',
    payload: [
      { name: 'job_id', type: 'string', description: 'ingest_jobs row id' },
      { name: 'project_id', type: 'string' },
      { name: 'url', type: 'string', description: 'URL that was crawled' },
      { name: 'brand', type: '{ ... }', description: 'Brand info merged into projects.brand_voice' },
    ],
  },
  {
    name: 'ingest.failed',
    label: 'Ingest failed',
    hint: 'Crawl gave up after retries — payload includes error reason.',
    source: 'lib/jobs/ingest-queue.ts → runIngestJob (failure / exhausted path)',
    payload: [
      { name: 'job_id', type: 'string' },
      { name: 'project_id', type: 'string' },
      { name: 'url', type: 'string' },
      { name: 'error', type: 'string', description: 'Last error message' },
      { name: 'attempts', type: 'number', description: 'Total attempts before giving up' },
      { name: 'permanent', type: 'boolean', description: 'true = bot wall / 4xx; false = exhausted retries' },
    ],
  },
  {
    name: 'lead.created',
    label: 'Lead created',
    hint: 'New lead captured (not fired on dedup-touched existing leads).',
    source: 'app/api/leads/capture/route.ts (after new-lead insert)',
    payload: [
      { name: 'lead_id', type: 'string' },
      { name: 'project_id', type: 'string' },
      { name: 'email', type: 'string' },
      { name: 'name', type: 'string | null' },
      { name: 'source', type: 'string' },
      { name: 'source_id', type: 'string | null' },
      { name: 'campaign_id', type: 'string | null' },
      { name: 'utm', type: '{ source, medium, campaign, content, term }', description: 'All UTM fields, each string | null' },
      { name: 'score', type: 'number' },
      { name: 'created_at', type: 'string (ISO 8601)' },
    ],
  },
  {
    name: 'social.published',
    label: 'Social published',
    hint: 'Post went live on a platform — payload includes the external_url.',
    source: 'lib/deploy/index.ts → dispatchPost (success path)',
    payload: [
      { name: 'post_id', type: 'string' },
      { name: 'project_id', type: 'string' },
      { name: 'platform', type: 'string', description: 'twitter | linkedin' },
      { name: 'external_id', type: 'string', description: 'Platform-side id (tweet id, LinkedIn URN)' },
      { name: 'external_url', type: 'string | null' },
      { name: 'published_at', type: 'string (ISO 8601)' },
    ],
  },
  {
    name: 'email.bounced',
    label: 'Email bounced',
    hint: 'Resend reported a bounce — subscriber has been auto-flagged.',
    source: 'app/api/webhooks/email/route.ts (Resend bounce handler)',
    payload: [
      { name: 'send_id', type: 'string' },
      { name: 'project_id', type: 'string | null', description: 'null if the template has been deleted' },
      { name: 'subscriber_id', type: 'string | null' },
      { name: 'template_id', type: 'string | null' },
      { name: 'bounced_at', type: 'string (ISO 8601)' },
    ],
  },
]

/** Wire-format event names. Derived; never edit independently. */
export const SUPPORTED_EVENTS: ReadonlyArray<string> = WEBHOOK_EVENTS.map((e) => e.name)

export function isSupportedEvent(s: string): boolean {
  return SUPPORTED_EVENTS.includes(s)
}

export function findEvent(name: string): WebhookEventDef | undefined {
  return WEBHOOK_EVENTS.find((e) => e.name === name)
}
