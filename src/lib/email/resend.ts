import { Resend } from 'resend'

let resendClient: Resend | null = null

export function getResend(): Resend {
  if (!resendClient) {
    const key = process.env.RESEND_API_KEY
    if (!key) throw new Error('RESEND_API_KEY not set')
    resendClient = new Resend(key)
  }
  return resendClient
}

export interface SendEmailParams {
  to: string | string[]
  subject: string
  html: string
  from?: string
  replyTo?: string
  tags?: { name: string; value: string }[]
}

export async function sendEmail(params: SendEmailParams) {
  const resend = getResend()
  const fromAddress = params.from || process.env.RESEND_FROM_EMAIL || 'GrowthOS <noreply@updates.growthos.app>'

  const { data, error } = await resend.emails.send({
    from: fromAddress,
    to: Array.isArray(params.to) ? params.to : [params.to],
    subject: params.subject,
    html: params.html,
    replyTo: params.replyTo,
    tags: params.tags,
  })

  if (error) throw new Error(error.message)
  return data
}

/** Send an email template to a subscriber, track in email_sends */
export async function sendTemplateToSubscriber(opts: {
  templateId: string
  subscriberId: string
  subscriberEmail: string
  subscriberName?: string
  subject: string
  bodyHtml: string
  userId: string
  sequenceId?: string
  supabase: ReturnType<typeof import('@/lib/supabase/server').createServiceClient>
}) {
  // Replace placeholders
  let html = opts.bodyHtml
  html = html.replace(/\{\{name\}\}/g, opts.subscriberName || 'there')
  html = html.replace(/\{\{email\}\}/g, opts.subscriberEmail)

  let subject = opts.subject
  subject = subject.replace(/\{\{name\}\}/g, opts.subscriberName || 'there')

  // Create send record
  const { data: send } = await opts.supabase.from('email_sends').insert({
    user_id: opts.userId,
    template_id: opts.templateId,
    subscriber_id: opts.subscriberId,
    sequence_id: opts.sequenceId || null,
    status: 'queued',
  }).select('id').single()

  try {
    const result = await sendEmail({
      to: opts.subscriberEmail,
      subject,
      html,
      tags: [
        { name: 'send_id', value: send?.id || '' },
        { name: 'template_id', value: opts.templateId },
      ],
    })

    // Update status to sent
    if (send) {
      await opts.supabase.from('email_sends').update({
        status: 'sent',
        sent_at: new Date().toISOString(),
        metadata: { resend_id: result?.id },
      }).eq('id', send.id)
    }

    return { success: true, sendId: send?.id, resendId: result?.id }
  } catch (err) {
    // Update status to failed
    if (send) {
      await opts.supabase.from('email_sends').update({
        status: 'failed',
        metadata: { error: err instanceof Error ? err.message : 'Unknown' },
      }).eq('id', send.id)
    }
    throw err
  }
}
