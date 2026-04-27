// Email sequence executor. Intended to be invoked by Vercel Cron every few minutes.
// Two jobs:
//   1. Auto-enroll new subscribers into active 'signup' sequences (using
//      trigger_config.list_id to scope).
//   2. Process enrollments whose next_send_at has elapsed — send the step
//      template, advance to the next step, or mark completed.
//
// Auth: Vercel Cron includes `Authorization: Bearer $CRON_SECRET` on scheduled
// invocations. We reject anything without a matching secret so the route can't
// be triggered publicly.

export const runtime = 'nodejs'
export const maxDuration = 300

import { createServiceClient } from '@/lib/supabase/server'
import { sendTemplateToSubscriber } from '@/lib/email/resend'
import { wrapHandler } from '@/lib/api-error'

const BATCH_LIMIT = 100 // hard cap per tick so one run can't explode

interface SequenceRow {
  id: string
  user_id: string
  project_id: string
  name: string
  trigger_type: 'signup' | 'tag_added' | 'manual' | 'event'
  trigger_config: { list_id?: string } | null
  status: string
}

interface StepRow {
  id: string
  sequence_id: string
  template_id: string | null
  step_order: number
  delay_hours: number
}

interface EnrollmentRow {
  id: string
  user_id: string
  sequence_id: string
  subscriber_id: string
  next_step_order: number
  next_send_at: string | null
  status: string
}

async function backfillSignupEnrollments(supabase: ReturnType<typeof createServiceClient>) {
  // Find all active 'signup' sequences with a list_id in trigger_config
  const { data: seqs } = await supabase
    .from('email_sequences')
    .select('id, user_id, project_id, trigger_config, status')
    .eq('status', 'active')
    .eq('trigger_type', 'signup') as { data: SequenceRow[] | null }

  if (!seqs || seqs.length === 0) return { enrolled: 0 }

  let enrolled = 0

  for (const seq of seqs) {
    const listId = seq.trigger_config?.list_id
    if (!listId) continue

    // Only look at subscribers from the last 30 days — avoids backfilling
    // ancient subscribers into a newly-activated sequence.
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

    const { data: subs } = await supabase
      .from('email_subscribers')
      .select('id, subscribed_at')
      .eq('list_id', listId)
      .eq('status', 'active')
      .gte('subscribed_at', thirtyDaysAgo)
      .limit(BATCH_LIMIT) as { data: Array<{ id: string; subscribed_at: string }> | null }

    if (!subs || subs.length === 0) continue

    // Get first step to know initial delay
    const { data: firstStep } = await supabase
      .from('email_sequence_steps')
      .select('delay_hours')
      .eq('sequence_id', seq.id)
      .order('step_order', { ascending: true })
      .limit(1)
      .maybeSingle() as { data: { delay_hours: number } | null }

    if (!firstStep) continue

    for (const sub of subs) {
      // Skip if already enrolled
      const { data: existing } = await supabase
        .from('email_sequence_enrollments')
        .select('id')
        .eq('sequence_id', seq.id)
        .eq('subscriber_id', sub.id)
        .maybeSingle()

      if (existing) continue

      const nextSendAt = new Date(
        new Date(sub.subscribed_at).getTime() + firstStep.delay_hours * 60 * 60 * 1000,
      ).toISOString()

      const { error } = await supabase.from('email_sequence_enrollments').insert({
        user_id: seq.user_id,
        sequence_id: seq.id,
        subscriber_id: sub.id,
        enrolled_at: sub.subscribed_at,
        next_step_order: 1,
        next_send_at: nextSendAt,
        status: 'active',
      })

      if (!error) enrolled += 1
    }
  }

  return { enrolled }
}

async function processDueEnrollments(supabase: ReturnType<typeof createServiceClient>) {
  const now = new Date().toISOString()

  const { data: due } = await supabase
    .from('email_sequence_enrollments')
    .select('id, user_id, sequence_id, subscriber_id, next_step_order, next_send_at, status')
    .eq('status', 'active')
    .lte('next_send_at', now)
    .limit(BATCH_LIMIT) as { data: EnrollmentRow[] | null }

  if (!due || due.length === 0) return { sent: 0, failed: 0, completed: 0 }

  let sent = 0
  let failed = 0
  let completed = 0

  for (const enrollment of due) {
    const { data: step } = await supabase
      .from('email_sequence_steps')
      .select('id, sequence_id, template_id, step_order, delay_hours')
      .eq('sequence_id', enrollment.sequence_id)
      .eq('step_order', enrollment.next_step_order)
      .maybeSingle() as { data: StepRow | null }

    // No matching step for this order — likely sequence was edited. Complete gracefully.
    if (!step || !step.template_id) {
      await supabase.from('email_sequence_enrollments').update({
        status: 'completed',
        next_send_at: null,
      }).eq('id', enrollment.id)
      completed += 1
      continue
    }

    // Load template + subscriber
    const [tmplRes, subRes] = await Promise.all([
      supabase.from('email_templates').select('id, subject, body_html').eq('id', step.template_id).maybeSingle(),
      supabase.from('email_subscribers').select('id, email, name, status').eq('id', enrollment.subscriber_id).maybeSingle(),
    ])

    const tmpl = tmplRes.data as { id: string; subject: string; body_html: string } | null
    const sub = subRes.data as { id: string; email: string; name: string | null; status: string } | null

    // Subscriber bounced / unsubscribed — cancel enrollment
    if (!sub || sub.status !== 'active') {
      await supabase.from('email_sequence_enrollments').update({
        status: 'cancelled',
        next_send_at: null,
        metadata: { reason: 'subscriber_inactive' },
      }).eq('id', enrollment.id)
      continue
    }

    if (!tmpl) {
      await supabase.from('email_sequence_enrollments').update({
        status: 'failed',
        next_send_at: null,
        metadata: { reason: 'template_missing' },
      }).eq('id', enrollment.id)
      failed += 1
      continue
    }

    try {
      await sendTemplateToSubscriber({
        templateId: tmpl.id,
        subscriberId: sub.id,
        subscriberEmail: sub.email,
        subscriberName: sub.name ?? undefined,
        subject: tmpl.subject,
        bodyHtml: tmpl.body_html,
        userId: enrollment.user_id,
        sequenceId: enrollment.sequence_id,
        supabase,
      })
      sent += 1

      // Look up the next step to schedule
      const nextOrder = enrollment.next_step_order + 1
      const { data: nextStep } = await supabase
        .from('email_sequence_steps')
        .select('step_order, delay_hours')
        .eq('sequence_id', enrollment.sequence_id)
        .eq('step_order', nextOrder)
        .maybeSingle() as { data: { step_order: number; delay_hours: number } | null }

      if (!nextStep) {
        await supabase.from('email_sequence_enrollments').update({
          status: 'completed',
          last_sent_at: new Date().toISOString(),
          next_send_at: null,
        }).eq('id', enrollment.id)
        completed += 1
      } else {
        const newNextSendAt = new Date(Date.now() + nextStep.delay_hours * 60 * 60 * 1000).toISOString()
        await supabase.from('email_sequence_enrollments').update({
          next_step_order: nextOrder,
          next_send_at: newNextSendAt,
          last_sent_at: new Date().toISOString(),
        }).eq('id', enrollment.id)
      }
    } catch (err) {
      failed += 1
      // Defer the next attempt by 30 min so a single broken enrollment
      // doesn't get re-tried every cron tick. Without this, a transient
      // upstream failure or a bad template caused the cron to spin on
      // the same row forever, racking up failure counts but never
      // actually advancing.
      const retryAt = new Date(Date.now() + 30 * 60_000).toISOString()
      await supabase.from('email_sequence_enrollments').update({
        next_send_at: retryAt,
        metadata: { last_error: err instanceof Error ? err.message : 'Unknown', last_failed_at: new Date().toISOString() },
      }).eq('id', enrollment.id)
      console.error('[sequence-tick][send]', err)
    }
  }

  return { sent, failed, completed }
}

async function handleRequest(request: Request) {
  const auth = request.headers.get('authorization')
  const expected = process.env.CRON_SECRET
  if (!expected || auth !== `Bearer ${expected}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Bail early if Resend isn't configured. Without this, every due
  // enrollment tries to send, throws "RESEND_API_KEY not set", increments
  // a failed counter — but next_send_at doesn't move, so the cron retries
  // the same broken enrollment forever. Better to no-op loudly.
  if (!process.env.RESEND_API_KEY) {
    return Response.json({
      tick_at: new Date().toISOString(),
      error: 'RESEND_API_KEY missing — email sequences cannot send. Set the env var to resume.',
      backfill: { enrolled: 0 },
      processed: { sent: 0, failed: 0, completed: 0 },
    }, { status: 503 })
  }

  const supabase = createServiceClient()

  const backfill = await backfillSignupEnrollments(supabase)
  const processed = await processDueEnrollments(supabase)

  return Response.json({
    backfill,
    processed,
    tick_at: new Date().toISOString(),
  })
}

export const GET = wrapHandler(handleRequest, 'email/sequence-tick')
export const POST = wrapHandler(handleRequest, 'email/sequence-tick')
