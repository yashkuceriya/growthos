import { createClient, createServiceClient } from '@/lib/supabase/server'
import { sendTemplateToSubscriber } from '@/lib/email/resend'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { templateId, listId, subscriberIds } = body

  if (!templateId) return Response.json({ error: 'templateId required' }, { status: 400 })
  if (!listId && !subscriberIds?.length) return Response.json({ error: 'listId or subscriberIds required' }, { status: 400 })

  // Fetch template
  const { data: template } = await supabase
    .from('email_templates')
    .select('*')
    .eq('id', templateId)
    .maybeSingle()

  if (!template) return Response.json({ error: 'Template not found' }, { status: 404 })

  // Fetch subscribers
  let subscribers: { id: string; email: string; name: string | null }[] = []
  if (subscriberIds?.length) {
    const { data } = await supabase
      .from('email_subscribers')
      .select('id, email, name')
      .in('id', subscriberIds)
      .eq('status', 'active')
    subscribers = data ?? []
  } else if (listId) {
    const { data } = await supabase
      .from('email_subscribers')
      .select('id, email, name')
      .eq('list_id', listId)
      .eq('status', 'active')
    subscribers = data ?? []
  }

  if (subscribers.length === 0) {
    return Response.json({ error: 'No active subscribers found' }, { status: 400 })
  }

  const serviceClient = createServiceClient()
  const results: { email: string; status: string; error?: string }[] = []

  // Send to each subscriber (batched in sequence to respect rate limits)
  for (const sub of subscribers) {
    try {
      await sendTemplateToSubscriber({
        templateId,
        subscriberId: sub.id,
        subscriberEmail: sub.email,
        subscriberName: sub.name || undefined,
        subject: template.subject,
        bodyHtml: template.body_html || '<p>No content</p>',
        userId: user.id,
        supabase: serviceClient,
      })
      results.push({ email: sub.email, status: 'sent' })
    } catch (err) {
      results.push({ email: sub.email, status: 'failed', error: err instanceof Error ? err.message : 'Unknown' })
    }
  }

  const sent = results.filter((r) => r.status === 'sent').length
  const failed = results.filter((r) => r.status === 'failed').length

  return Response.json({ sent, failed, total: subscribers.length, results })
}
