export const runtime = 'nodejs'
export const maxDuration = 300

import { createClient } from '@/lib/supabase/server'
import {
  genMetaAdVariants, genLinkedInVariants, genTikTokAssets, genTwitterThread,
  genRedditPosts, genEmailSequence, genBlogPost, genLandingPage,
  type LaunchContext,
} from '@/lib/ai/launch/generators'
import { cmoStrategist, seoSpecialist, directorReview, analyticsAgent } from '@/lib/ai/launch/agents'
import { getPlaybook } from '@/lib/ai/playbooks/registry'
import type { Vertical } from '@/lib/ai/intelligence/classifier'
import { getFounderVoiceContext } from '@/lib/ai/voice/founder-voice'
import { withRetries, generateAdImagesForCopy, brandContextFromCtx, type TrackOpts } from '@/lib/ai/launch/utils'
import { extractLaunchInsights, type LaunchInsights } from '@/lib/ai/launch/insight-extractor'
import { mergeBrandVoice } from '@/lib/brand-voice'
import { checkBudget, budgetExceededResponse } from '@/lib/budget-guard'
import { isLaunchChannel, LAUNCH_CHANNELS } from '@/lib/launch/plan'
import { learningSummaryToPrompt } from '@/lib/campaigns/learning'

// Channel ids the UI renders — must match keys below
const ALL_CHANNELS = LAUNCH_CHANNELS
type Channel = typeof ALL_CHANNELS[number]

interface LaunchRequestBody {
  projectId?: string
  // Optional overrides. Operator-selected channels take precedence over the
  // playbook recommendation when present. Goal + angle thread through the
  // launch context so generators speak to the chosen narrative.
  channels?: unknown
  goal?: unknown
  angle?: unknown
  campaignId?: unknown
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const body = (await request.json()) as LaunchRequestBody
  const { projectId } = body
  if (!projectId) return Response.json({ error: 'projectId required' }, { status: 400 })

  // Validate operator overrides up-front so a bad request fails before we
  // grab the launch mutex or burn AI budget.
  let overrideChannels: Channel[] | null = null
  if (body.channels !== undefined) {
    if (!Array.isArray(body.channels) || body.channels.length === 0) {
      return Response.json({ error: 'channels must be a non-empty array' }, { status: 400 })
    }
    const invalid = body.channels.filter((c) => !isLaunchChannel(c))
    if (invalid.length) {
      return Response.json(
        { error: `Unsupported channels: ${invalid.join(', ')}. Supported: ${ALL_CHANNELS.join(', ')}` },
        { status: 400 },
      )
    }
    overrideChannels = Array.from(new Set(body.channels as Channel[]))
  }
  const overrideGoal = typeof body.goal === 'string' && body.goal.trim().length > 0 ? body.goal.trim() : null
  const overrideAngle = typeof body.angle === 'string' && body.angle.trim().length > 0 ? body.angle.trim() : null
  const reuseCampaignId = typeof body.campaignId === 'string' && body.campaignId.trim().length > 0 ? body.campaignId.trim() : null

  const { data: project } = await supabase
    .from('projects')
    .select('id, name, description, website, brand_voice, slug')
    .eq('id', projectId)
    .maybeSingle()

  if (!project) return Response.json({ error: 'Project not found' }, { status: 404 })

  const budget = await checkBudget(supabase, projectId)
  if (!budget.ok) return budgetExceededResponse(budget)

  // Per-project launch mutex. Atomically claim the slot — a concurrent
  // run (second browser tab, accidental double-click) sees zero rows
  // updated and gets 409. Stale claim (>10min, presumed dead worker)
  // can be overwritten. We clear the flag in a finally{} at end of run.
  const staleCutoff = new Date(Date.now() - 10 * 60_000).toISOString()
  const { data: claimed } = await supabase
    .from('projects')
    .update({ launch_running_at: new Date().toISOString() })
    .eq('id', projectId)
    .or(`launch_running_at.is.null,launch_running_at.lt.${staleCutoff}`)
    .select('id')
    .maybeSingle() as { data: { id: string } | null }

  if (!claimed) {
    return Response.json(
      {
        error: 'A launch is already running for this project. Wait for it to finish, or try again in a few minutes if it appears stuck.',
        retry_after_seconds: 60,
      },
      { status: 409 },
    )
  }

  const bv = (project.brand_voice as Record<string, unknown>) ?? {}
  const ctx: LaunchContext = {
    productName: project.name,
    tagline: (bv.tagline as string) ?? project.name,
    valueProp: (bv.value_proposition as string) ?? project.description ?? '',
    audience: (bv.target_audience as string) ?? '',
    features: (bv.key_features as string[]) ?? [],
    differentiators: (bv.differentiators as string[]) ?? [],
    pricing: (bv.pricing as string) ?? 'Not specified',
    tone: (bv.tone_of_voice as string) ?? 'professional',
    primaryColor: (bv.primary_color as string) ?? '#10b981',
    heroImageUrl: (bv.hero_image_url as string) ?? null,
    website: project.website ?? null,
  }

  // SSE stream
  const encoder = new TextEncoder()
  let closed = false
  const stream = new ReadableStream({
    async start(controller) {
      function send(type: string, payload: unknown) {
        if (closed) return
        try { controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type, ...((payload as object) ?? {}) })}\n\n`)) } catch { closed = true }
      }
      function close() { if (closed) return; closed = true; try { controller.close() } catch {} }

      // Release the per-project launch mutex no matter how the run
      // ends — success, error, or budget-exceeded mid-flight. Without
      // this, a crashed launch would leave the mutex held until the
      // 10-minute stale-claim window passes, blocking legitimate
      // re-attempts in the meantime.
      async function releaseLock() {
        try {
          await supabase.from('projects')
            .update({ launch_running_at: null })
            .eq('id', projectId)
        } catch (e) {
          console.error('[launch] failed to release mutex:', e instanceof Error ? e.message : e)
        }
      }

      try {
      // Determine which channels to run. Operator override wins; otherwise
      // fall back to the playbook recommendation. We still fall through to
      // ALL_CHANNELS only if the playbook produces nothing AND no override
      // was sent — true safety net rather than a routine path.
      const classification = (bv.classification as { vertical?: Vertical } | undefined)
      const playbook = getPlaybook(classification?.vertical)
      const playbookChannels = ALL_CHANNELS.filter((c) =>
        playbook.primary_channels.includes(c) || playbook.secondary_channels.includes(c)
      )
      const CHANNELS = overrideChannels && overrideChannels.length > 0
        ? overrideChannels
        : (playbookChannels.length > 0 ? playbookChannels : [...ALL_CHANNELS])

      send('start', {
        channels: CHANNELS,
        vertical: classification?.vertical ?? 'other',
        playbook: { kpis: playbook.kpis, launch_tactics: playbook.launch_tactics },
        overrides: {
          channels: overrideChannels !== null,
          goal: overrideGoal !== null,
          angle: overrideAngle !== null,
          campaign_reused: reuseCampaignId !== null,
        },
      })

      const track: TrackOpts = { userId: user.id, projectId }

      // When re-launching the same campaign, inject the persisted learning
      // summary so CMO / SEO / channel generators build on what worked.
      const launchCtx: LaunchContext = { ...ctx }
      if (reuseCampaignId) {
        const { data: preCamp } = await supabase
          .from('campaigns')
          .select('metadata')
          .eq('id', reuseCampaignId)
          .eq('user_id', user.id)
          .maybeSingle() as { data: { metadata: Record<string, unknown> | null } | null }
        const raw = preCamp?.metadata?.learning_summary
        const text = learningSummaryToPrompt(raw)
        if (text) launchCtx.priorCampaignLearnings = text
      }

      // —————— AGENT CHAIN ——————
      // Step 1: CMO produces the strategic brief
      send('agent_status', { agent: 'cmo', status: 'working', label: 'CMO setting strategy…' })
      const brief = await withRetries(() => cmoStrategist(launchCtx, track), 'cmo')
      send('agent_status', { agent: 'cmo', status: 'done', output: brief })

      // Step 2: SEO specialist designs keyword plan off the brief
      send('agent_status', { agent: 'seo', status: 'working', label: 'SEO researching keywords…' })
      const seoPlan = await withRetries(() => seoSpecialist(launchCtx, brief, track), 'seo')
      send('agent_status', { agent: 'seo', status: 'done', output: seoPlan })

      // Step 3: Analytics sets experiments + UTM scheme (parallel with channels)
      const analyticsPromise = withRetries(() => analyticsAgent(launchCtx, brief, track), 'analytics').catch((e) => {
        console.error('[launch][analytics]', e); return null
      })

      // Create a campaign row to tie everything together, OR reuse an
      // existing campaign if the operator passed campaignId (lets the
      // Campaign Command Center re-run a launch and keep all assets stitched
      // to the same campaign id rather than orphaning them under a fresh row).
      let campaignId: string | null = null
      if (reuseCampaignId) {
        const { data: existing } = await supabase
          .from('campaigns')
          .select('id, metadata')
          .eq('id', reuseCampaignId)
          .eq('user_id', user.id)
          .maybeSingle() as { data: { id: string; metadata: Record<string, unknown> | null } | null }
        if (existing) {
          campaignId = existing.id
          await supabase.from('campaigns').update({
            metadata: {
              ...(existing.metadata ?? {}),
              launch_run: true,
              started_at: new Date().toISOString(),
              brief,
              seo_plan: seoPlan,
              goal_override: overrideGoal,
              angle_override: overrideAngle,
              channels_override: overrideChannels,
            },
          }).eq('id', existing.id)
        }
      }
      if (!campaignId) {
        const { data: campaign } = await supabase.from('campaigns').insert({
          user_id: user.id, project_id: projectId,
          name: `Launch · ${new Date().toISOString().slice(0, 10)}`,
          status: 'draft',
          channels: CHANNELS as unknown as string[],
          kpis: {},
          metadata: {
            launch_run: true,
            started_at: new Date().toISOString(),
            brief,
            seo_plan: seoPlan,
            goal_override: overrideGoal,
            angle_override: overrideAngle,
            channels_override: overrideChannels,
          },
        }).select().single()
        campaignId = campaign?.id ?? null
      }

      // Enhance context with brief + SEO + market intel for every channel
      const marketIntel = bv.market_intel as Record<string, unknown> | undefined
      const marketContext = marketIntel
        ? `\n\nMARKET PULSE (past 7 days):
- Sentiment: ${marketIntel.sentiment_summary ?? ''}
- Top trending themes: ${Array.isArray(marketIntel.trending_themes) ? (marketIntel.trending_themes as Array<{ theme: string }>).slice(0, 3).map((t) => t.theme).join(' · ') : ''}
- Hottest pain points: ${Array.isArray(marketIntel.pain_points_surfacing) ? (marketIntel.pain_points_surfacing as Array<{ pain: string }>).slice(0, 3).map((p) => p.pain).join(' · ') : ''}
- Recommended content hooks: ${Array.isArray(marketIntel.recommended_content_hooks) ? (marketIntel.recommended_content_hooks as Array<{ hook: string }>).slice(0, 4).map((h) => h.hook).join(' | ') : ''}
- Avoid: ${Array.isArray(marketIntel.avoid_topics) ? (marketIntel.avoid_topics as string[]).join(' · ') : ''}`
        : ''

      // Splice operator overrides into the value-prop block that every
      // channel generator sees. Keeps the existing single-string brand-context
      // contract instead of growing the LaunchContext schema across 8 generators.
      const operatorBlock = (overrideGoal || overrideAngle)
        ? `\n\nOPERATOR DIRECTIVES (treat as highest priority):${overrideGoal ? `\n- Campaign goal: ${overrideGoal}` : ''}${overrideAngle ? `\n- Narrative angle: ${overrideAngle}` : ''}`
        : ''

      const enrichedCtx: LaunchContext = {
        ...launchCtx,
        valueProp: `${launchCtx.valueProp}\n\nCAMPAIGN NARRATIVE: ${brief.core_narrative}\nAUDIENCE INSIGHT: ${brief.audience_insight}\nTOP THEMES: ${brief.top_3_themes.join(' · ')}\nSEO FOCUS: ${seoPlan.cluster_pillar}${marketContext}${operatorBlock}`,
      }

      // Step 4: Run all channels in parallel, each saves its own rows
      // Cost tracking happens inside each gen* via the track opts — no fixed-rate stub here
      const channelOutputs: Record<string, string> = {}
      const jobs: Array<Promise<void>> = CHANNELS.map(async (channel) => {
        const startedAt = Date.now()
        send('channel_status', { channel, status: 'generating' })
        try {
          const summary = await runChannel(channel, enrichedCtx, project.id, user.id, campaignId, supabase, project.slug, track)
          channelOutputs[channel] = summary
          send('channel_status', { channel, status: 'ready', ms: Date.now() - startedAt })
        } catch (err) {
          console.error(`[launch][${channel}]`, err)
          send('channel_status', { channel, status: 'failed', error: err instanceof Error ? err.message : 'Unknown' })
        }
      })

      await Promise.allSettled(jobs)

      // Step 5: Analytics result
      const analyticsPlan = await analyticsPromise
      if (analyticsPlan) send('agent_status', { agent: 'analytics', status: 'done', output: analyticsPlan })

      // Step 6: Director reviews the whole campaign
      send('agent_status', { agent: 'director', status: 'working', label: 'Director reviewing campaign…' })
      let review = null
      try {
        review = await withRetries(() => directorReview(launchCtx, brief, seoPlan, channelOutputs, track), 'director')
        send('agent_status', { agent: 'director', status: 'done', output: review })
      } catch (err) {
        console.error('[launch][director]', err)
        send('agent_status', { agent: 'director', status: 'failed', error: err instanceof Error ? err.message : 'Unknown' })
      }

      // Step 7: Extract durable insights and write back to brand_voice so the next launch is smarter
      let insights: LaunchInsights | null = null
      try {
        send('agent_status', { agent: 'insights', status: 'working', label: 'Distilling launch insights…' })
        insights = await extractLaunchInsights({
          brief, seoPlan, directorReview: review,
          channelOutputs, productName: ctx.productName, audience: ctx.audience,
        })
        send('agent_status', { agent: 'insights', status: 'done', output: insights })

        // Merge insights atomically (keep last 5 in history). History needs deep-merge
        // semantics which the RPC doesn't do, so we read → compute → merge just the
        // insights subtree. Still atomic at the brand_voice top level.
        const prev = (bv.insights as { history?: unknown[] } | undefined)
        const history = Array.isArray(prev?.history) ? prev.history.slice(-4) : []
        await mergeBrandVoice(supabase, projectId, {
          insights: {
            last_updated: new Date().toISOString(),
            last_campaign_id: campaignId,
            current: insights,
            history: [...history, { campaign_id: campaignId, timestamp: new Date().toISOString(), insights }],
          },
        })
      } catch (err) {
        console.error('[launch][insights]', err)
        send('agent_status', { agent: 'insights', status: 'failed', error: err instanceof Error ? err.message : 'Unknown' })
      }

      // Persist agent outputs to campaign metadata
      if (campaignId) {
        const { data: curRow } = await supabase
          .from('campaigns')
          .select('metadata')
          .eq('id', campaignId)
          .maybeSingle() as { data: { metadata: Record<string, unknown> | null } | null }
        const prevMeta = (curRow?.metadata && typeof curRow.metadata === 'object')
          ? (curRow.metadata as Record<string, unknown>)
          : {}
        await supabase.from('campaigns').update({
          status: 'active',
          metadata: {
            ...prevMeta,
            launch_run: true,
            brief,
            seo_plan: seoPlan,
            analytics_plan: analyticsPlan,
            director_review: review,
            insights,
            finished_at: new Date().toISOString(),
          },
        }).eq('id', campaignId)
      }

      send('done', { campaignId })
      } catch (err) {
        // The orchestrator wraps each step in try/catch already, but a
        // top-level throw (DB connection drop, OOM) lands here. Surface
        // and continue to release the mutex.
        console.error('[launch] orchestrator threw:', err instanceof Error ? err.message : err)
        send('agent_status', { agent: 'orchestrator', status: 'failed', error: err instanceof Error ? err.message : 'Unknown' })
      } finally {
        await releaseLock()
        close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}

async function runChannel(
  channel: Channel,
  ctx: LaunchContext,
  projectId: string,
  userId: string,
  campaignId: string | null,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  projectSlug: string,
  track: TrackOpts,
): Promise<string> {
  const brandContext = brandContextFromCtx(ctx)

  switch (channel) {
    case 'meta': {
      const variants = await withRetries(() => genMetaAdVariants(ctx, track), 'meta')
      const { data: brief } = await supabase.from('ad_briefs').insert({
        user_id: userId, project_id: projectId, campaign_id: campaignId,
        platform: 'meta', audience_segment: ctx.audience, product_offer: ctx.valueProp,
        campaign_goal: 'conversion', tone: ctx.tone,
      }).select().single()
      const variantGroup = crypto.randomUUID()
      const LABELS = ['A', 'B', 'C']
      if (brief) {
        for (const [idx, ad] of variants.entries()) {
          const { data: adCopy } = await supabase.from('ad_copies').insert({
            user_id: userId, brief_id: brief.id, iteration_number: 1,
            primary_text: ad.primary_text, headline: ad.headline,
            description: ad.description, cta_button: ad.cta_button,
            status: 'evaluator_pass',
            variant_group: variantGroup, variant_label: LABELS[idx], hook_framework: ad.hook_framework,
            metadata: { launch_run: true, image_prompt: ad.image_prompt, hook_framework: ad.hook_framework },
          }).select().single()
          if (adCopy && idx === 0) {
            // Image only for variant A — variants test copy, not creative. User can regen for B/C.
            await generateAdImagesForCopy({
              adCopyId: adCopy.id,
              headline: ad.headline, description: ad.description, primaryText: ad.primary_text,
              platform: 'meta', brandContext, referenceImageUrl: ctx.heroImageUrl,
              aspects: ['1:1', '9:16', '1.91:1'],
            }, supabase, userId, projectId).catch((e) => console.error('[launch][meta][image]', e))
          }
        }
      }
      return `3 Meta variants (${variants.map((v) => v.hook_framework).join(' / ')}): ${variants.map((v) => v.headline).join(' | ')}`
    }
    case 'linkedin': {
      const assets = await withRetries(() => genLinkedInVariants(ctx, track), 'linkedin')
      const { data: brief } = await supabase.from('ad_briefs').insert({
        user_id: userId, project_id: projectId, campaign_id: campaignId,
        platform: 'linkedin', audience_segment: ctx.audience,
        product_offer: ctx.valueProp, campaign_goal: 'conversion', tone: ctx.tone,
      }).select().single()
      const variantGroup = crypto.randomUUID()
      const LABELS = ['A', 'B', 'C']
      if (brief) {
        for (const [idx, v] of assets.variants.entries()) {
          const { data: adCopy } = await supabase.from('ad_copies').insert({
            user_id: userId, brief_id: brief.id, iteration_number: 1,
            primary_text: v.text, headline: v.headline,
            status: 'evaluator_pass',
            variant_group: variantGroup, variant_label: LABELS[idx], hook_framework: v.hook_framework,
            metadata: { launch_run: true, image_prompt: v.image_prompt, hook_framework: v.hook_framework, organic_posts: assets.organic_posts },
          }).select().single()
          if (adCopy && idx === 0) {
            await generateAdImagesForCopy({
              adCopyId: adCopy.id,
              headline: v.headline, primaryText: v.text,
              platform: 'linkedin', brandContext, referenceImageUrl: ctx.heroImageUrl,
              aspects: ['1.91:1', '1:1'],
            }, supabase, userId, projectId).catch((e) => console.error('[launch][linkedin][image]', e))
          }
        }
      }
      // Organic posts go to social_posts with the campaign_id so the
      // Campaign Command Center can aggregate them by campaign.
      for (const p of assets.organic_posts) {
        await supabase.from('social_posts').insert({
          user_id: userId, project_id: projectId, campaign_id: campaignId, platform: 'linkedin',
          content: `${p.text}\n\n${p.hashtags.map((h) => `#${h}`).join(' ')}`,
          status: 'draft', ai_generated: true,
          metadata: { launch_run: true },
        })
      }
      return `3 LinkedIn variants (${assets.variants.map((v) => v.hook_framework).join(' / ')}) + ${assets.organic_posts.length} organic posts`
    }
    case 'tiktok': {
      const { reels } = await withRetries(() => genTikTokAssets(ctx, track), 'tiktok')
      for (const reel of reels) {
        await supabase.from('social_posts').insert({
          user_id: userId, project_id: projectId, campaign_id: campaignId, platform: 'tiktok',
          content: `HOOK: ${reel.hook}\n\nSCRIPT:\n${reel.script}\n\nCAPTION:\n${reel.caption}\n\n${reel.hashtags.map((h) => `#${h}`).join(' ')}`,
          status: 'draft', ai_generated: true,
          metadata: { launch_run: true, thumbnail_prompt: reel.thumbnail_prompt },
        })
      }
      return `${reels.length} reels. Top hooks: ${reels.map((r) => r.hook).join(' | ')}`
    }
    case 'twitter': {
      const thread = await withRetries(() => genTwitterThread(ctx, track), 'twitter')
      await supabase.from('social_posts').insert({
        user_id: userId, project_id: projectId, campaign_id: campaignId, platform: 'twitter',
        content: thread.thread.sort((a, b) => a.position - b.position).map((t, i) => `[${i + 1}/${thread.thread.length}] ${t.text}`).join('\n\n'),
        status: 'draft', ai_generated: true,
        metadata: { launch_run: true, type: 'thread' },
      })
      for (const t of thread.standalone_tweets) {
        await supabase.from('social_posts').insert({
          user_id: userId, project_id: projectId, campaign_id: campaignId, platform: 'twitter',
          content: t.text, status: 'draft', ai_generated: true,
          metadata: { launch_run: true, image_prompt: t.image_prompt ?? null },
        })
      }
      return `Thread hook: ${thread.thread[0]?.text ?? ''}\nStandalone: ${thread.standalone_tweets.map((t) => t.text).join(' || ')}`
    }
    case 'reddit': {
      const voice = await getFounderVoiceContext(userId, 'reddit').catch(() => '')
      const { posts } = await withRetries(() => genRedditPosts(ctx, voice, track), 'reddit')
      for (const p of posts) {
        await supabase.from('social_posts').insert({
          user_id: userId, project_id: projectId, campaign_id: campaignId, platform: 'reddit',
          content: `r/${p.subreddit}\n\nTITLE: ${p.title}\n\n${p.body_markdown}`,
          status: 'draft', ai_generated: true,
          metadata: { launch_run: true, subreddit: p.subreddit, post_type: p.post_type, title: p.title },
        })
      }
      return `3 subreddit posts: ${posts.map((p) => `r/${p.subreddit} — "${p.title}"`).join(' | ')}`
    }
    case 'email': {
      const { emails } = await withRetries(() => genEmailSequence(ctx, track), 'email')
      // Create a sequence + 3 templates + 3 steps
      const { data: seq } = await supabase.from('email_sequences').insert({
        user_id: userId, project_id: projectId,
        name: `${ctx.productName} Welcome Sequence`,
        trigger_type: 'signup', status: 'draft',
      }).select().single()
      for (const [idx, email] of emails.entries()) {
        const { data: tmpl } = await supabase.from('email_templates').insert({
          user_id: userId, project_id: projectId,
          name: `Welcome ${idx + 1}: ${email.subject.slice(0, 40)}`,
          subject: email.subject,
          body_html: email.body_html,
          category: 'welcome',
          metadata: { preview_text: email.preview_text, cta: { text: email.cta_text, url: email.cta_url } },
        }).select().single()
        if (seq && tmpl) {
          await supabase.from('email_sequence_steps').insert({
            sequence_id: seq.id, template_id: tmpl.id,
            step_order: email.position, delay_hours: email.delay_hours,
          })
        }
      }
      return `${emails.length}-email welcome sequence. Subjects: ${emails.map((e) => e.subject).join(' | ')}`
    }
    case 'blog': {
      const post = await withRetries(() => genBlogPost(ctx, track), 'blog')
      await supabase.from('content_pieces').insert({
        user_id: userId, project_id: projectId, campaign_id: campaignId,
        title: post.title, slug: post.slug,
        body_markdown: post.body_markdown,
        content_type: 'blog_post', status: 'drafting',
        target_keywords: post.target_keywords,
        word_count: post.body_markdown.split(/\s+/).filter(Boolean).length,
        metadata: { launch_run: true, meta_description: post.meta_description },
      })
      return `Blog: "${post.title}" (${post.body_markdown.split(/\s+/).length} words) targeting ${post.target_keywords.join(', ')}`
    }
    case 'landing': {
      const page = await withRetries(() => genLandingPage(ctx, track), 'landing')
      const slug = `${projectSlug}-${Date.now().toString(36).slice(-4)}`
      await supabase.from('landing_pages').insert({
        user_id: userId, project_id: projectId, campaign_id: campaignId,
        name: `${ctx.productName} Launch Page`,
        slug,
        template: {
          headline: page.headline,
          subheadline: page.subheadline,
          bodyText: page.body_sections.map((s) => `## ${s.heading}\n${s.content}`).join('\n\n'),
          ctaText: page.cta_text,
          ctaColor: ctx.primaryColor,
        },
        published: true,
      })
      return `Landing: "${page.headline}" → /p/${slug}, CTA: ${page.cta_text}`
    }
  }
  return ''
}
