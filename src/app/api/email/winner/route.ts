// Manual promote / demote a single email template from the email page.
// Mirrors /api/social/winner. Authenticated via session, ownership-checked.
// The cron may overwrite on its next run — manual promotion is a strong
// signal but not eternal.

export const runtime = 'nodejs'

import { createClient, createServiceClient } from '@/lib/supabase/server'
import { wrapHandler } from '@/lib/api-error'
import { htmlToText } from '@/lib/ai/email/html-to-text'

interface TemplateRow {
  id: string
  user_id: string
  project_id: string
  name: string
  subject: string
  body_html: string | null
}

async function loadOwnedTemplate(request: Request): Promise<{ template: TemplateRow } | { error: Response }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: Response.json({ error: 'Unauthorized' }, { status: 401 }) }

  const { id } = await request.json().catch(() => ({})) as { id?: string }
  if (!id) return { error: Response.json({ error: 'id required' }, { status: 400 }) }

  const { data: template } = await supabase
    .from('email_templates')
    .select('id, user_id, project_id, name, subject, body_html')
    .eq('id', id)
    .eq('user_id', user.id)
    .maybeSingle() as { data: TemplateRow | null }

  if (!template) return { error: Response.json({ error: 'Template not found' }, { status: 404 }) }
  return { template }
}

async function handlePost(request: Request) {
  const r = await loadOwnedTemplate(request)
  if ('error' in r) return r.error
  const { template } = r

  const service = createServiceClient()

  // Manual promotion doesn't have a computed score — the cron will assign one
  // on its next run. Stamp a sentinel so the UI shows "Top performer" now.
  await service
    .from('email_templates')
    .update({
      is_winner: true,
      winner_promoted_at: new Date().toISOString(),
    })
    .eq('id', template.id)

  const { data: existing } = await service
    .from('style_references')
    .select('id')
    .eq('source_template_id', template.id)
    .maybeSingle()

  if (!existing) {
    const bodyText = htmlToText(template.body_html ?? '')
    const assetContent = `SUBJECT: ${template.subject}\n\n${bodyText}`.slice(0, 4000)
    const { error } = await service.from('style_references').insert({
      user_id: template.user_id,
      project_id: template.project_id,
      asset_kind: 'email_template',
      asset_content: assetContent,
      why_good: `Manually promoted as a top-performing template`,
      source_template_id: template.id,
    })
    // 23505 = unique violation, race against the cron. Treat as success.
    if (error && error.code !== '23505') {
      return Response.json({ error: error.message }, { status: 500 })
    }
  }

  return Response.json({ ok: true })
}

async function handleDelete(request: Request) {
  const r = await loadOwnedTemplate(request)
  if ('error' in r) return r.error
  const { template } = r

  const service = createServiceClient()
  await service
    .from('email_templates')
    .update({ is_winner: false, winner_promoted_at: null })
    .eq('id', template.id)
  await service.from('style_references').delete().eq('source_template_id', template.id)

  return Response.json({ ok: true })
}

export const POST = wrapHandler(handlePost, 'email/winner')
export const DELETE = wrapHandler(handleDelete, 'email/winner')
