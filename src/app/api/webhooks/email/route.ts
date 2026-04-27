import { createServiceClient } from '@/lib/supabase/server'
import { Webhook } from 'svix'
import { wrapHandler } from '@/lib/api-error'
import { emitEvent } from '@/lib/webhooks/dispatch'
import type { EmailBouncedPayload } from '@/lib/webhooks/payloads'

export const runtime = 'nodejs'

/**
 * Resend webhook handler.
 * Configure in Resend dashboard: https://resend.com/webhooks
 * Events: email.delivered, email.opened, email.clicked, email.bounced, email.complained
 *
 * Signatures verified via Svix (Resend's signing provider). Requires RESEND_WEBHOOK_SECRET env.
 */
async function handlePost(request: Request) {
  const rawBody = await request.text()
  const secret = process.env.RESEND_WEBHOOK_SECRET

  if (secret) {
    try {
      const wh = new Webhook(secret)
      wh.verify(rawBody, {
        'svix-id': request.headers.get('svix-id') ?? '',
        'svix-timestamp': request.headers.get('svix-timestamp') ?? '',
        'svix-signature': request.headers.get('svix-signature') ?? '',
      })
    } catch {
      return Response.json({ error: 'Invalid signature' }, { status: 401 })
    }
  } else if (process.env.NODE_ENV === 'production') {
    // In prod we never want to accept unsigned webhooks — without the secret
    // any unauthenticated POST could mark sends opened/clicked/bounced.
    return Response.json({ error: 'Webhook secret not configured' }, { status: 500 })
  } else {
    console.warn('[webhooks/email] RESEND_WEBHOOK_SECRET not set — accepting unverified webhook (dev only)')
  }

  const body = JSON.parse(rawBody)
  const { type, data } = body

  if (!type || !data) {
    return Response.json({ error: 'Invalid webhook payload' }, { status: 400 })
  }

  const supabase = createServiceClient()

  const sendId = data.tags?.find((t: { name: string; value: string }) => t.name === 'send_id')?.value
  if (!sendId) {
    return Response.json({ status: 'ignored', reason: 'no send_id tag' })
  }

  const now = new Date().toISOString()

  switch (type) {
    case 'email.delivered':
      await supabase.from('email_sends').update({ status: 'delivered' }).eq('id', sendId)
      break

    case 'email.opened':
      await supabase.from('email_sends').update({ status: 'opened', opened_at: now }).eq('id', sendId)
      break

    case 'email.clicked':
      await supabase.from('email_sends').update({ status: 'clicked', clicked_at: now }).eq('id', sendId)
      break

    case 'email.bounced': {
      await supabase.from('email_sends').update({ status: 'bounced' }).eq('id', sendId)
      // Pull user_id (for emitEvent fan-out) and template_id (so we can look
      // up project_id) alongside subscriber_id. email_sends doesn't carry
      // project_id directly — it lives on the parent template.
      const { data: send } = await supabase
        .from('email_sends')
        .select('user_id, subscriber_id, template_id')
        .eq('id', sendId)
        .maybeSingle() as { data: { user_id: string; subscriber_id: string | null; template_id: string | null } | null }
      if (send?.subscriber_id) {
        await supabase.from('email_subscribers').update({ status: 'bounced' }).eq('id', send.subscriber_id)
      }
      if (send?.user_id) {
        let projectId: string | null = null
        if (send.template_id) {
          const { data: tpl } = await supabase
            .from('email_templates')
            .select('project_id')
            .eq('id', send.template_id)
            .maybeSingle() as { data: { project_id: string } | null }
          projectId = tpl?.project_id ?? null
        }
        const bouncedPayload: EmailBouncedPayload = {
          send_id: sendId,
          project_id: projectId,
          subscriber_id: send.subscriber_id,
          template_id: send.template_id,
          bounced_at: now,
        }
        // A null projectId fans out only to all-projects subscriptions —
        // see emitEvent's filter rule. Right semantics for an email event
        // whose template has been deleted.
        await emitEvent({
          supabase,
          userId: send.user_id,
          projectId,
          eventType: 'email.bounced',
          payload: bouncedPayload as unknown as Record<string, unknown>,
        })
      }
      break
    }

    case 'email.complained': {
      const { data: spamSend } = await supabase.from('email_sends').select('subscriber_id').eq('id', sendId).maybeSingle()
      if (spamSend?.subscriber_id) {
        await supabase.from('email_subscribers').update({
          status: 'unsubscribed',
          unsubscribed_at: now,
        }).eq('id', spamSend.subscriber_id)
      }
      break
    }
  }

  return Response.json({ status: 'ok', type })
}

export const POST = wrapHandler(handlePost, 'webhooks/email')
