import { createClient } from '@/lib/supabase/server'
import { generateObject } from 'ai'
import { modelFor } from '@/lib/ai/models'
import { z } from 'zod'
import { trackAICost } from '@/lib/cost-tracker'
import type { Vertical } from '@/lib/ai/intelligence/classifier'
import { wrapHandler } from '@/lib/api-error'
import { checkBudget, budgetExceededResponse } from '@/lib/budget-guard'

export const maxDuration = 120

const CreativeBriefSchema = z.object({
  project_name: z.string(),
  deliverable_type: z.string(),
  single_minded_proposition: z.string().describe('The one takeaway. If the viewer remembers one thing.'),
  target_audience: z.string(),
  what_they_currently_think: z.string(),
  what_we_want_them_to_think: z.string(),
  what_we_want_them_to_do: z.string(),
  tone_words: z.array(z.string()).min(3).max(6),
  reference_inspo: z.array(z.string()).min(3).max(5).describe('Examples of work/brands to study'),
  mandatories: z.array(z.string()).describe('Must-have elements (logo, legal, etc.)'),
  out_of_scope: z.array(z.string()).describe('Do NOT include'),
  success_metric: z.string(),
  deadline_guidance: z.string(),
})

const TestingMatrixSchema = z.object({
  matrix: z.array(z.object({
    hook_type: z.enum(['stat_shock', 'story', 'contrarian', 'before_after', 'question_agitate', 'direct_callout']),
    format: z.enum(['static_image', 'carousel', 'short_video_9_16', 'short_video_1_1', 'long_video_16_9', 'ugc_talking_head', 'text_only']),
    concept: z.string(),
    hook_copy: z.string(),
    primary_visual_direction: z.string(),
    expected_audience: z.string(),
  })).length(8).describe('4 hooks x 2 formats = 8 concepts'),
  testing_plan: z.array(z.object({
    week: z.number(),
    budget_usd: z.number(),
    objectives: z.array(z.string()),
    kill_rules: z.array(z.string()),
  })).min(3).max(5),
  winning_combo_protocol: z.string().describe('What to do once a winner emerges'),
  creative_fatigue_signals: z.array(z.string()),
})

const VideoScriptSchema = z.object({
  format: z.enum(['short_9_16', 'reel_1_1', 'tutorial_16_9', 'explainer_16_9', 'testimonial']),
  duration_seconds: z.number(),
  hook_0_3s: z.string().describe('First 2-3 seconds — must stop the scroll'),
  beats: z.array(z.object({
    time_start_s: z.number(),
    time_end_s: z.number(),
    visual: z.string(),
    voiceover_or_text: z.string(),
    b_roll_or_overlay: z.string(),
    sound_cue: z.string(),
  })).min(4).max(8),
  on_screen_captions_full: z.string().describe('Full captions file (SRT-like format)'),
  cta_end: z.string(),
  shot_list_for_production: z.array(z.string()),
  storyboard_image_prompts: z.array(z.string()).min(4).max(8).describe('AI image prompts for each beat for storyboarding'),
  music_direction: z.string(),
  production_notes: z.string(),
})

const LpWireframeSchema = z.object({
  template_name: z.string(),
  sections_ordered: z.array(z.object({
    section: z.enum(['nav', 'hero', 'social_proof_logos', 'problem', 'solution', 'features', 'how_it_works', 'social_proof_quotes', 'pricing', 'faq', 'final_cta', 'footer']),
    order: z.number(),
    content_direction: z.string(),
    conversion_intent: z.string(),
    key_element: z.string(),
  })).min(6).max(10),
  hero: z.object({
    headline: z.string(),
    subheadline: z.string(),
    primary_cta: z.string(),
    secondary_cta: z.string(),
    hero_visual_direction: z.string(),
  }),
  copy_blocks: z.array(z.object({ section: z.string(), heading: z.string(), body: z.string(), cta: z.string().optional() })).min(4).max(8),
  form_fields_recommendation: z.array(z.string()).max(4),
  trust_signals_placement: z.array(z.string()),
  above_fold_checklist: z.array(z.string()),
  mobile_considerations: z.array(z.string()),
  conversion_rate_benchmarks: z.object({ poor: z.string(), median: z.string(), top_quartile: z.string() }),
})

const AdVariantPackSchema = z.object({
  brief_summary: z.string(),
  variants: z.array(z.object({
    name: z.string(),
    primary_text: z.string(),
    headline: z.string(),
    description: z.string(),
    cta_button: z.string(),
    visual_direction: z.string(),
    audience_hypothesis: z.string(),
    testing_priority: z.number().min(1).max(10),
  })).min(6).max(10),
  rotation_schedule: z.array(z.object({ week: z.number(), variants_to_run: z.array(z.string()) })).min(3).max(4),
  success_criteria: z.array(z.string()),
})

type Tool = 'creative_brief' | 'testing_matrix' | 'video_script' | 'lp_wireframe' | 'ad_variant_pack'

async function handlePost(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { projectId, tool, input } = await request.json() as { projectId: string; tool: Tool; input?: Record<string, unknown> }
  if (!projectId || !tool) return Response.json({ error: 'projectId and tool required' }, { status: 400 })

  const budget = await checkBudget(supabase, projectId)
  if (!budget.ok) return budgetExceededResponse(budget)

  const { data: project } = await supabase.from('projects').select('name, description, brand_voice, website').eq('id', projectId).single()
  if (!project) return Response.json({ error: 'Not found' }, { status: 404 })

  const bv = (project.brand_voice as Record<string, unknown>) ?? {}
  const vertical = (bv.classification as { vertical?: Vertical } | undefined)?.vertical

  const ctx = `PRODUCT: ${project.name}
VERTICAL: ${vertical ?? 'unknown'}
VALUE PROP: ${bv.value_proposition ?? project.description ?? ''}
AUDIENCE: ${bv.target_audience ?? ''}
DIFFERENTIATORS: ${Array.isArray(bv.differentiators) ? (bv.differentiators as string[]).join(' · ') : ''}
TONE: ${bv.tone_of_voice ?? 'professional'}
WEBSITE: ${project.website ?? ''}`

  const startedAt = Date.now()
  let result: unknown = null

  switch (tool) {
    case 'creative_brief': {
      const deliverable = input?.deliverable ?? 'Meta ad campaign'
      const res = await generateObject({
        model: modelFor('strategic'),
        schema: CreativeBriefSchema,
        system: `You write creative briefs in the BBDO / Wieden+Kennedy tradition — single-minded proposition, what they think now vs after, clear audience. Short, ruthless, actionable.`,
        messages: [{ role: 'user', content: `${ctx}\nDELIVERABLE: ${deliverable}\n\nWrite the creative brief.` }],
      })
      result = res.object
      break
    }
    case 'testing_matrix': {
      const res = await generateObject({
        model: modelFor('strategic'),
        schema: TestingMatrixSchema,
        system: `You design creative testing matrices — hooks x formats. 8 concepts total. Include testing plan with budgets, kill rules, and fatigue signals.`,
        messages: [{ role: 'user', content: `${ctx}\n\nDesign the creative testing matrix.` }],
      })
      result = res.object
      break
    }
    case 'video_script': {
      const format = input?.format ?? 'short_9_16'
      const concept = input?.concept ?? ''
      const res = await generateObject({
        model: modelFor('strategic'),
        schema: VideoScriptSchema,
        system: `You write short-form video scripts. First 2-3 seconds must stop scroll. Beat-by-beat with timing, visuals, voiceover, b-roll, sound. Include shot list and storyboard image prompts.`,
        messages: [{ role: 'user', content: `${ctx}\nFORMAT: ${format}\nCONCEPT: ${concept}\n\nWrite the video script.` }],
      })
      result = res.object
      break
    }
    case 'lp_wireframe': {
      const goal = input?.goal ?? 'email signup'
      const res = await generateObject({
        model: modelFor('strategic'),
        schema: LpWireframeSchema,
        system: `You design landing page wireframes and copy. Pick section order based on audience sophistication. Include copy blocks ready to paste. Define above-fold essentials and mobile considerations.`,
        messages: [{ role: 'user', content: `${ctx}\nCONVERSION GOAL: ${goal}\n\nDesign the landing page.` }],
      })
      result = res.object
      break
    }
    case 'ad_variant_pack': {
      const res = await generateObject({
        model: modelFor('production'),
        schema: AdVariantPackSchema,
        system: `You produce 6-10 ad variants for testing. Each hypothesizes a distinct audience / angle. Rank by testing priority. Include a rotation schedule and success criteria.`,
        messages: [{ role: 'user', content: `${ctx}\n\nProduce the ad variant pack.` }],
      })
      result = res.object
      break
    }
    default:
      return Response.json({ error: `Unknown tool: ${tool}` }, { status: 400 })
  }

  await trackAICost({ userId: user.id, projectId, module: `creative_${tool}`, costUsd: 0.07, latencyMs: Date.now() - startedAt })

  return Response.json({ tool, vertical, result })
}

export const POST = wrapHandler(handlePost, 'agency/creative-lab')
