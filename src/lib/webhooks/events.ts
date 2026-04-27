// Centralized event-name constant. Both the v1 webhook CRUD route and the
// dashboard endpoint use this so they can't drift. Add new events here when
// the producer side starts emitting them — endpoints subscribed to an
// unknown event won't be filtered out, but the create endpoints reject
// subscriptions to unknown events to give immediate feedback.

export const SUPPORTED_EVENTS = [
  'ingest.completed',
  'ingest.failed',
  'lead.created',
  'social.published',
  'email.bounced',
] as const

export type SupportedEvent = (typeof SUPPORTED_EVENTS)[number]

export function isSupportedEvent(s: string): s is SupportedEvent {
  return (SUPPORTED_EVENTS as readonly string[]).includes(s)
}
