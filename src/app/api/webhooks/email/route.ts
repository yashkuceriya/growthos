import { createServiceClient } from '@/lib/supabase/server'
import { Webhook } from 'svix'
import { wrapHandler } from '@/lib/api-error'

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
  } else {
    console.warn('[webhooks/email] RESEND_WEBHOOK_SECRET not set — accepting unverified webhook')
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
      const { data: send } = await supabase.from('email_sends').select('subscriber_id').eq('id', sendId).single()
      if (send?.subscriber_id) {
        await supabase.from('email_subscribers').update({ status: 'bounced' }).eq('id', send.subscriber_id)
      }
      break
    }

    case 'email.complained': {
      const { data: spamSend } = await supabase.from('email_sends').select('subscriber_id').eq('id', sendId).single()
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
