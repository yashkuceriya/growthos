// Email template winner cron. Every 12h.
//
// For each project with templates, build send/open/click counts per template
// over the rolling window, score them, mark top performers, demote losers,
// and mirror winners into style_references. Idempotent via the partial
// unique index on style_references.source_template_id.

export const runtime = 'nodejs'
export const maxDuration = 300

import { createServiceClient } from '@/lib/supabase/server'
import { wrapHandler } from '@/lib/api-error'
import { selectTemplateWinners, DEFAULT_WINNER_OPTS, type TemplateStats } from '@/lib/ai/email/winner'
import { htmlToText } from '@/lib/ai/email/html-to-text'

interface ProjectRow { id: string; user_id: string }
interface TemplateRow {
  id: string
  user_id: string
  project_id: string
  name: string
  subject: string
  body_html: string | null
  is_winner: boolean
}

// Status state machine: queued → sent → delivered → opened → clicked. Each
// terminal status implies the prior ones, so we bucket monotonically.
//   bounced — counts as a "send" attempt for denominator purposes (it left
//             our SMTP) but not as delivered/opened/clicked.
//   failed  — pre-send error (rejected by Resend, malformed address). NOT
//             counted in any bucket: it was never a real send opportunity,
//             so including it would either penalize or reward the template
//             based on infrastructure issues rather than copy quality.
const CLICKED_LIKE = ['clicked'] as const
const OPENED_LIKE = ['opened', 'clicked'] as const
const DELIVERED_LIKE = ['delivered', 'opened', 'clicked'] as const
const SENT_LIKE = ['sent', 'delivered', 'opened', 'clicked', 'bounced'] as const

async function buildStatsForProject(
  supabase: ReturnType<typeof createServiceClient>,
  templates: TemplateRow[],
  windowStart: string,
): Promise<TemplateStats[]> {
  if (templates.length === 0) return []
  const ids = templates.map((t) => t.id)

  // One query, group in code. We pull only the columns we need.
  const { data: sends } = await supabase
    .from('email_sends')
    .select('template_id, status, created_at')
    .in('template_id', ids)
    .gte('created_at', windowStart) as { data: Array<{ template_id: string | null; status: string }> | null }

  const stats = new Map<string, TemplateStats>()
  for (const t of templates) {
    stats.set(t.id, { template_id: t.id, sends: 0, delivered: 0, opens: 0, clicks: 0 })
  }

  for (const row of sends ?? []) {
    if (!row.template_id) continue
    const s = stats.get(row.template_id)
    if (!s) continue
    if ((SENT_LIKE as readonly string[]).includes(row.status)) s.sends += 1
    if ((DELIVERED_LIKE as readonly string[]).includes(row.status)) s.delivered += 1
    if ((OPENED_LIKE as readonly string[]).includes(row.status)) s.opens += 1
    if ((CLICKED_LIKE as readonly string[]).includes(row.status)) s.clicks += 1
  }

  return [...stats.values()]
}

async function promoteToStyleRef(
  supabase: ReturnType<typeof createServiceClient>,
  template: TemplateRow,
  score: number,
  stats: TemplateStats,
) {
  const { data: existing } = await supabase
    .from('style_references')
    .select('id')
    .eq('source_template_id', template.id)
    .maybeSingle()
  if (existing) return

  const reach = stats.delivered > 0 ? stats.delivered : stats.sends
  const metricProof = JSON.stringify({
    sends: stats.sends,
    delivered: stats.delivered,
    opens: stats.opens,
    clicks: stats.clicks,
    open_rate: reach > 0 ? +(stats.opens / reach).toFixed(3) : 0,
    click_rate: reach > 0 ? +(stats.clicks / reach).toFixed(3) : 0,
    score: +score.toFixed(4),
  })

  const openPct = reach > 0 ? Math.round((stats.opens / reach) * 100) : 0
  const clickPct = reach > 0 ? Math.round((stats.clicks / reach) * 100) : 0
  const whyGood = `Top template — ${openPct}% open rate, ${clickPct}% click rate over ${reach} delivered`

  // Style ref content: SUBJECT + plaintext body. Storing raw HTML here would
  // truncate mid-tag at the slice() boundary, leaving malformed markup that
  // pollutes future prompts. The ML model only needs the words + paragraph
  // structure to emulate the pattern, not <table>/<style> scaffolding.
  const bodyText = htmlToText(template.body_html ?? '')
  const assetContent = `SUBJECT: ${template.subject}\n\n${bodyText}`.slice(0, 4000)

  const { error } = await supabase.from('style_references').insert({
    user_id: template.user_id,
    project_id: template.project_id,
    asset_kind: 'email_template',
    asset_content: assetContent,
    why_good: whyGood,
    metric_proof: metricProof,
    source_template_id: template.id,
  })
  // 23505 = unique violation, race against a sibling cron instance. Ignore.
  if (error && error.code !== '23505') throw new Error(error.message)
}

async function processProject(
  supabase: ReturnType<typeof createServiceClient>,
  project: ProjectRow,
): Promise<{ winners: number; demoted: number; promoted: number }> {
  const cutoff = new Date(Date.now() - DEFAULT_WINNER_OPTS.windowDays * 24 * 60 * 60 * 1000).toISOString()

  const { data: templates } = await supabase
    .from('email_templates')
    .select('id, user_id, project_id, name, subject, body_html, is_winner')
    .eq('project_id', project.id) as { data: TemplateRow[] | null }

  if (!templates || templates.length === 0) return { winners: 0, demoted: 0, promoted: 0 }

  const stats = await buildStatsForProject(supabase, templates, cutoff)
  const currentlyFlagged = new Set(templates.filter((t) => t.is_winner).map((t) => t.id))
  const { winners, demote } = selectTemplateWinners(stats, currentlyFlagged)

  // Demote first, then delete style refs for fallen winners — same rationale
  // as Bundle K: orphaned style refs keep flowing into prompts otherwise.
  for (const id of demote) {
    await supabase.from('email_templates').update({ is_winner: false }).eq('id', id)
    await supabase.from('style_references').delete().eq('source_template_id', id)
  }

  let promoted = 0
  const tplById = new Map(templates.map((t) => [t.id, t]))
  for (const w of winners) {
    const tpl = tplById.get(w.template_id)
    if (!tpl) continue
    await supabase
      .from('email_templates')
      .update({
        is_winner: true,
        winner_score: w.score,
        winner_promoted_at: new Date().toISOString(),
      })
      .eq('id', tpl.id)
    try {
      await promoteToStyleRef(supabase, tpl, w.score, w.stats)
      promoted += 1
    } catch (err) {
      console.error('[email-winner-tick][promote]', tpl.id, err)
    }
  }

  return { winners: winners.length, demoted: demote.length, promoted }
}

async function handleRequest(request: Request) {
  const auth = request.headers.get('authorization')
  const expected = process.env.CRON_SECRET
  if (!expected || auth !== `Bearer ${expected}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServiceClient()

  const { data: projects } = await supabase
    .from('projects')
    .select('id, user_id') as { data: ProjectRow[] | null }

  if (!projects || projects.length === 0) {
    return Response.json({ tick_at: new Date().toISOString(), projects: 0 })
  }

  let totalWinners = 0
  let totalDemoted = 0
  let totalPromoted = 0
  const errors: Array<{ project_id: string; error: string }> = []

  for (const project of projects) {
    try {
      const r = await processProject(supabase, project)
      totalWinners += r.winners
      totalDemoted += r.demoted
      totalPromoted += r.promoted
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown'
      errors.push({ project_id: project.id, error: msg })
    }
  }

  return Response.json({
    tick_at: new Date().toISOString(),
    projects: projects.length,
    winners: totalWinners,
    demoted: totalDemoted,
    promoted: totalPromoted,
    errors: errors.slice(0, 10),
  })
}

export const GET = wrapHandler(handleRequest, 'email/winner-tick')
export const POST = wrapHandler(handleRequest, 'email/winner-tick')
