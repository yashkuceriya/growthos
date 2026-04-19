import { createServiceClient } from '@/lib/supabase/server'

/**
 * Resend webhook handler.
 * Configure in Resend dashboard: https://resend.com/webhooks
 * Events: email.delivered, email.opened, email.clicked, email.bounced, email.complained
 */
export async function POST(request: Request) {
  const body = await request.json()
  const { type, data } = body

  if (!type || !data) {
    return Response.json({ error: 'Invalid webhook payload' }, { status: 400 })
  }

  const supabase = createServiceClient()

  // Extract send_id from tags
  const sendId = data.tags?.find((t: { name: string; value: string }) => t.name === 'send_id')?.value

  if (!sendId) {
    // No tracking tag — ignore
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

    case 'email.bounced':
      await supabase.from('email_sends').update({ status: 'bounced' }).eq('id', sendId)
      // Mark subscriber as bounced
      const { data: send } = await supabase.from('email_sends').select('subscriber_id').eq('id', sendId).single()
      if (send?.subscriber_id) {
        await supabase.from('email_subscribers').update({ status: 'bounced' }).eq('id', send.subscriber_id)
      }
      break

    case 'email.complained':
      // Treat spam complaints as unsubscribe
      const { data: spamSend } = await supabase.from('email_sends').select('subscriber_id').eq('id', sendId).single()
      if (spamSend?.subscriber_id) {
        await supabase.from('email_subscribers').update({
          status: 'unsubscribed',
          unsubscribed_at: now,
        }).eq('id', spamSend.subscriber_id)
      }
      break
  }

  return Response.json({ status: 'ok', type })
}
