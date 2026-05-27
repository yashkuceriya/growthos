import { createClient } from '@/lib/supabase/server'
import { runAdPipeline } from '@/lib/ai/ad-studio/iterator'
import { extractInsights, saveInsights } from '@/lib/ai/ad-studio/insight-extractor'
import { trackAICost, estimateCost } from '@/lib/cost-tracker'
import { modeBlock } from '@/lib/ai/creative/modes'
import { getMarketingMemory, marketingMemoryPrompt } from '@/lib/marketing/memory'

export async function POST(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const {
    projectId,
    platform,
    audienceSegment,
    productOffer,
    campaignGoal,
    tone,
    creativeMode,
    campaignId: rawCampaignId,
  } = body

  if (!projectId || !audienceSegment || !productOffer || !campaignGoal) {
    return Response.json({ error: 'Missing required fields' }, { status: 400 })
  }

  let resolvedCampaignId: string | null = null
  if (rawCampaignId != null && String(rawCampaignId).trim() !== '') {
    if (typeof rawCampaignId !== 'string') {
      return Response.json({ error: 'Invalid campaignId' }, { status: 400 })
    }
    const cid = rawCampaignId.trim()
    const { data: camp } = await supabase
      .from('campaigns')
      .select('id')
      .eq('id', cid)
      .eq('user_id', user.id)
      .eq('project_id', projectId)
      .maybeSingle()
    if (!camp) {
      return Response.json({ error: 'Campaign not found' }, { status: 404 })
    }
    resolvedCampaignId = cid
  }

  // Normalize goal to match DB check constraint (awareness | conversion | engagement)
  function normalizeGoal(g: string): 'awareness' | 'conversion' | 'engagement' {
    const s = g.toLowerCase()
    if (s.includes('aware')) return 'awareness'
    if (s.includes('engage')) return 'engagement'
    return 'conversion' // default: lead gen, conversion, signup, purchase
  }
  const normalizedGoal = normalizeGoal(campaignGoal)

  // Unified marketing memory — one bundle covering brand, classification,
  // blueprint, launch insights, ad insights, founder voice, and proven
  // style references for ad copy. Replaces ad-hoc fetches that each route
  // used to do on its own (and disagreed on what to include).
  const memory = await getMarketingMemory({
    supabase,
    userId: user.id,
    projectId,
    assetKind: 'ad_copy',
  })

  // System-prompt block: brand + blueprint + insights + founder voice +
  // style refs. Append the creative-mode directive so a "funny ad" still
  // gets the funny angle baked into the same prompt.
  const brandVoice = marketingMemoryPrompt(memory, 'ad_copy') + modeBlock(creativeMode, 'copy')

  // Ad insights are inside the prompt block via memory, but the iterator
  // also threads them through `insights` so the user message reinforces
  // them next to the brief. Kept for backward compat with the generator
  // signature.
  const insightTexts = memory.adInsights.map((i) => i.text)

  // Stream progress via SSE
  const encoder = new TextEncoder()
  let closed = false
  const stream = new ReadableStream({
    async start(controller) {
      function sendProgress(message: string) {
        if (closed) return
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ progress: message })}\n\n`))
        } catch { closed = true }
      }
      function safeClose() {
        if (closed) return
        closed = true
        try { controller.close() } catch { /* already closed */ }
      }

      try {
        // Create brief record
        const briefRes = await supabase
          .from('ad_briefs')
          .insert({
            user_id: user.id,
            project_id: projectId,
            campaign_id: resolvedCampaignId,
            platform: platform || 'meta',
            audience_segment: audienceSegment,
            product_offer: productOffer,
            campaign_goal: normalizedGoal,
            tone: tone || null,
            creative_mode: creativeMode || null,
          })
          .select()
          .single()

        const brief = briefRes.data
        if (!brief) {
          sendProgress(`Error: Failed to create brief — ${briefRes.error?.message ?? 'unknown'}`)
          if (!closed) { try { controller.enqueue(encoder.encode('data: [DONE]\n\n')) } catch {} }
          safeClose()
          return
        }

        sendProgress('Brief created. Starting AI pipeline...')

        // Run the pipeline
        const result = await runAdPipeline({
          audienceSegment,
          productOffer,
          campaignGoal,
          tone,
          brandVoice,
          insights: insightTexts,
          platform: platform || 'meta',
          onProgress: sendProgress,
        })

        // Save all iterations to DB
        for (const iter of result.iterations) {
          const isBest = iter === result.bestIteration
          const status = isBest
            ? result.compliance.passes
              ? 'compliance_pass'
              : 'evaluator_pass'
            : iter.evaluation.passesThreshold
              ? 'evaluator_pass'
              : 'below_threshold'

          await supabase.from('ad_copies').insert({
            user_id: user.id,
            brief_id: brief.id,
            iteration_number: iter.iterationNumber,
            primary_text: iter.adCopy.primary_text,
            headline: iter.adCopy.headline,
            description: iter.adCopy.description,
            cta_button: iter.adCopy.cta_button,
            status,
            evaluation_scores: iter.evaluation.scores,
            weighted_average: iter.evaluation.weightedAverage,
            compliance: isBest ? result.compliance : null,
            is_best: isBest,
            early_stopped: result.earlyStopped && iter === result.bestIteration,
            early_stop_reason: result.earlyStopped && iter === result.bestIteration ? result.earlyStopReason : null,
          })
        }

        // Track AI cost
        const model = 'google/gemini-2.0-flash-001'
        await trackAICost({
          userId: user.id,
          projectId,
          module: 'ad_studio',
          stepName: 'full_pipeline',
          model,
          inputTokens: result.totalInputTokens,
          outputTokens: result.totalOutputTokens,
          costUsd: estimateCost(model, result.totalInputTokens, result.totalOutputTokens),
        })

        // Extract insights from this run
        if (result.iterations.length >= 2) {
          sendProgress('Extracting insights from this run...')
          try {
            const adData = result.iterations.map((iter) => ({
              primary_text: iter.adCopy.primary_text,
              headline: iter.adCopy.headline,
              description: iter.adCopy.description,
              cta_button: iter.adCopy.cta_button,
              evaluation_scores: iter.evaluation.scores as Record<string, { score: number; rationale: string }>,
              weighted_average: iter.evaluation.weightedAverage,
              audience_segment: audienceSegment,
              campaign_goal: campaignGoal,
            }))

            const insightResult = await extractInsights(adData, `${audienceSegment} / ${campaignGoal}`)

            if (insightResult.insights.length > 0) {
              await saveInsights(supabase as Parameters<typeof saveInsights>[0], user.id, projectId, audienceSegment, campaignGoal, insightResult.insights)
              sendProgress(`Extracted ${insightResult.insights.length} insights for future runs`)
            }
          } catch {
            // Non-critical — don't fail the pipeline
            sendProgress('Insight extraction skipped (non-critical)')
          }
        }

        sendProgress(
          `Done! Generated ${result.iterations.length} iterations. Best score: ${result.bestIteration.evaluation.weightedAverage.toFixed(1)}/10`,
        )
        if (!closed) {
          try { controller.enqueue(encoder.encode('data: [DONE]\n\n')) } catch {}
        }
      } catch (err) {
        console.error('[generate-ad] pipeline error:', err)
        const msg = err instanceof Error ? `${err.message}${err.stack ? '\n' + err.stack.split('\n').slice(0, 3).join('\n') : ''}` : 'Unknown error'
        sendProgress(`Error: ${msg}`)
        if (!closed) {
          try { controller.enqueue(encoder.encode('data: [DONE]\n\n')) } catch {}
        }
      } finally {
        safeClose()
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
