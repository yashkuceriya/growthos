// Unified marketing memory.
//
// One canonical context bundle for every generator (ad, social, email, blog,
// landing, launch agents, video script). Pulls the project's brand voice,
// classification, blueprint, launch insights, ad insights, founder voice,
// and platform-specific style references, then renders a single prompt block
// each generator can paste into its system prompt.
//
// Goal: every AI surface speaks for the same brand with the same memory.
// Today the contexts disagree (ad pipeline knows ad_insights, social pipeline
// only knows style_references, email pipeline only knows founder_voice). This
// kills "brand consistency" and silently wastes the insights we've already paid
// to extract. Memory fixes that.
import { buildMarketingBlueprint, type MarketingBlueprint } from '@/lib/marketing/blueprint'

// Loose duck-typed client. The real Supabase client's query builders are
// thenables (PromiseLike) rather than full Promises, and they differ across
// versions, so we keep this intentionally open. Tests pass a structural
// stub; production passes `createClient()` / `createServiceClient()`.
//
// We `await` builder terminals inside the fetchers — both PromiseLike and
// Promise satisfy `await`, so no runtime difference.
export type MemorySupabaseClient = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any
}

export type MemorySurface =
  | 'launch_strategy'
  | 'ad_copy'
  | 'social_post'
  | 'email'
  | 'blog'
  | 'landing_page'
  | 'video'
  | 'image'

export interface MemoryProject {
  id: string
  name: string
  website: string | null
  description: string | null
}

export interface MemoryBrand {
  tagline: string | null
  valueProp: string | null
  audience: string | null
  tone: string | null
  features: string[]
  differentiators: string[]
  pricing: string | null
  primaryColor: string | null
  heroImageUrl: string | null
  capturedScreenshotUrl: string | null
  designTokens: Record<string, unknown> | null
}

export interface MemoryClassification {
  vertical: string | null
  verticalConfidence: number | null
  businessModel: string | null
  targetMarket: string | null
  stage: string | null
  primaryGoal: string | null
  pricingTier: string | null
  icp: string | null
  competitors: string[]
  complianceFlags: string[]
}

export interface MemoryAdInsight {
  text: string
  type: string | null
  dimension: string | null
  audienceSegment: string | null
  campaignGoal: string | null
}

export interface MemoryLaunchInsights {
  lastUpdated: string | null
  lastCampaignId: string | null
  current: unknown | null
  recentHistory: Array<{ campaignId?: string; timestamp?: string; insights: unknown }>
}

export interface MemoryStyleReference {
  kind: string
  content: string
  whyGood: string | null
  metricProof: unknown | null
}

export interface MemoryFounderVoice {
  samples: string[]
  styleNotes: string | null
}

export interface MarketingMemory {
  project: MemoryProject
  brand: MemoryBrand
  classification: MemoryClassification
  blueprint: MarketingBlueprint
  launchInsights: MemoryLaunchInsights
  adInsights: MemoryAdInsight[]
  founderVoice: MemoryFounderVoice
  styleReferences: MemoryStyleReference[]
  assetKind: string | null
  channel: string | null
}

export interface MarketingMemoryArgs {
  supabase: MemorySupabaseClient
  userId: string
  projectId: string
  // Asset kind for style-reference lookup. Examples: 'twitter_post',
  // 'linkedin_post', 'email_template', 'ad_copy', 'blog_post'. When omitted,
  // style references are skipped.
  assetKind?: string | null
  // Optional channel label so the prompt builder can call it out by name.
  channel?: string | null
}

const EMPTY_FOUNDER_VOICE: MemoryFounderVoice = { samples: [], styleNotes: null }

export async function getMarketingMemory(args: MarketingMemoryArgs): Promise<MarketingMemory> {
  const { supabase, userId, projectId, assetKind, channel } = args

  // Fan-out reads — every branch is wrapped so one slow/broken table never
  // breaks generation. Memory is a best-effort bundle; missing pieces just
  // collapse to empty arrays / nulls. The prompt builder skips empties.
  const [projectRow, founderVoiceRow, styleRefsRow, adInsightsRow] = await Promise.all([
    fetchProject(supabase, projectId),
    fetchFounderVoice(supabase, userId),
    assetKind ? fetchStyleReferences(supabase, userId, assetKind) : Promise.resolve([] as MemoryStyleReference[]),
    fetchAdInsights(supabase, projectId),
  ])

  const project = projectRow ?? { id: projectId, name: '', website: null, description: null, brand_voice: {} as Record<string, unknown> }
  const brandVoice = asRecord(project.brand_voice)

  const brand = readBrand(brandVoice)
  const classification = readClassification(brandVoice)
  const blueprint = buildMarketingBlueprint({
    name: project.name,
    website: project.website,
    brand_voice: project.brand_voice,
  })
  const launchInsights = readLaunchInsights(brandVoice)

  return {
    project: {
      id: project.id,
      name: project.name,
      website: project.website,
      description: project.description,
    },
    brand,
    classification,
    blueprint,
    launchInsights,
    adInsights: adInsightsRow,
    founderVoice: founderVoiceRow,
    styleReferences: styleRefsRow,
    assetKind: assetKind ?? null,
    channel: channel ?? null,
  }
}

// ---- Prompt builder ----------------------------------------------------

// Compose the canonical "memory" prompt block. Skips empty sections so a
// brand-new project with no insights still gets a clean prompt.
export function marketingMemoryPrompt(memory: MarketingMemory, surface: MemorySurface): string {
  const blocks: string[] = []

  blocks.push(brandBlock(memory))

  const classBlock = classificationBlock(memory)
  if (classBlock) blocks.push(classBlock)

  const bpBlock = blueprintBlock(memory, surface)
  if (bpBlock) blocks.push(bpBlock)

  const insightsBlock = strategyInsightsBlock(memory, surface)
  if (insightsBlock) blocks.push(insightsBlock)

  const voiceBlock = founderVoiceBlock(memory)
  if (voiceBlock) blocks.push(voiceBlock)

  const styleBlock = styleReferencesBlock(memory)
  if (styleBlock) blocks.push(styleBlock)

  const surfaceNote = surfaceGuidance(memory, surface)
  if (surfaceNote) blocks.push(surfaceNote)

  return blocks.join('\n\n')
}

// ---- Individual fetchers -----------------------------------------------

interface ProjectRow {
  id: string
  name: string
  website: string | null
  description: string | null
  brand_voice: unknown
}

async function fetchProject(supabase: MemorySupabaseClient, projectId: string): Promise<ProjectRow | null> {
  try {
    const { data, error } = await supabase
      .from('projects')
      .select('id, name, website, description, brand_voice')
      .eq('id', projectId)
      .maybeSingle()
    if (error || !data) return null
    return data as ProjectRow
  } catch {
    return null
  }
}

async function fetchFounderVoice(supabase: MemorySupabaseClient, userId: string): Promise<MemoryFounderVoice> {
  try {
    const { data, error } = await supabase
      .from('founder_voice')
      .select('samples, style_notes')
      .eq('user_id', userId)
      .maybeSingle()
    if (error || !data) return EMPTY_FOUNDER_VOICE
    const row = data as { samples?: unknown; style_notes?: unknown }
    return {
      samples: Array.isArray(row.samples) ? (row.samples as unknown[]).filter((s): s is string => typeof s === 'string').slice(0, 8) : [],
      styleNotes: typeof row.style_notes === 'string' ? row.style_notes : null,
    }
  } catch {
    return EMPTY_FOUNDER_VOICE
  }
}

async function fetchStyleReferences(supabase: MemorySupabaseClient, userId: string, assetKind: string): Promise<MemoryStyleReference[]> {
  try {
    const { data, error } = await supabase
      .from('style_references')
      .select('asset_kind, asset_content, why_good, metric_proof')
      .eq('user_id', userId)
      .eq('asset_kind', assetKind)
      .order('created_at', { ascending: false })
      .limit(5)
    if (error || !Array.isArray(data)) return []
    return (data as Array<{ asset_kind?: string; asset_content?: string; why_good?: string | null; metric_proof?: unknown }>)
      .filter((r) => typeof r.asset_content === 'string')
      .map((r) => ({
        kind: typeof r.asset_kind === 'string' ? r.asset_kind : assetKind,
        content: (r.asset_content ?? '').slice(0, 500),
        whyGood: typeof r.why_good === 'string' ? r.why_good : null,
        metricProof: r.metric_proof ?? null,
      }))
  } catch {
    return []
  }
}

async function fetchAdInsights(supabase: MemorySupabaseClient, projectId: string): Promise<MemoryAdInsight[]> {
  try {
    const { data, error } = await supabase
      .from('ad_insights')
      .select('insight_text, insight_type, dimension, audience_segment, campaign_goal')
      .eq('project_id', projectId)
      .eq('active', true)
      .limit(5)
    if (error || !Array.isArray(data)) return []
    return (data as Array<{ insight_text?: string; insight_type?: string; dimension?: string | null; audience_segment?: string | null; campaign_goal?: string | null }>)
      .filter((r) => typeof r.insight_text === 'string')
      .map((r) => ({
        text: r.insight_text!,
        type: typeof r.insight_type === 'string' ? r.insight_type : null,
        dimension: typeof r.dimension === 'string' ? r.dimension : null,
        audienceSegment: typeof r.audience_segment === 'string' ? r.audience_segment : null,
        campaignGoal: typeof r.campaign_goal === 'string' ? r.campaign_goal : null,
      }))
  } catch {
    return []
  }
}

// ---- Field readers (brand_voice JSONB) ---------------------------------

function readBrand(brandVoice: Record<string, unknown>): MemoryBrand {
  return {
    tagline: str(brandVoice.tagline),
    valueProp: str(brandVoice.value_proposition),
    audience: str(brandVoice.target_audience),
    tone: str(brandVoice.tone_of_voice ?? brandVoice.tone),
    features: stringArray(brandVoice.key_features ?? brandVoice.features),
    differentiators: stringArray(brandVoice.differentiators),
    pricing: str(brandVoice.pricing),
    primaryColor: str(brandVoice.primary_color),
    heroImageUrl: str(brandVoice.hero_image_url),
    capturedScreenshotUrl: capturedScreenshotUrl(brandVoice.captured_screenshot),
    designTokens: asRecordOrNull(brandVoice.design_tokens),
  }
}

function readClassification(brandVoice: Record<string, unknown>): MemoryClassification {
  const c = asRecord(brandVoice.classification)
  return {
    vertical: str(c.vertical),
    verticalConfidence: typeof c.vertical_confidence === 'number' ? c.vertical_confidence : null,
    businessModel: str(c.business_model),
    targetMarket: str(c.target_market),
    stage: str(c.stage),
    primaryGoal: str(c.primary_goal),
    pricingTier: str(c.pricing_tier),
    icp: str(c.ideal_customer_profile),
    competitors: stringArray(c.key_competitors),
    complianceFlags: stringArray(c.compliance_flags).filter((f) => f !== 'none'),
  }
}

function readLaunchInsights(brandVoice: Record<string, unknown>): MemoryLaunchInsights {
  const ins = asRecord(brandVoice.insights)
  const history = Array.isArray(ins.history) ? (ins.history as unknown[]) : []
  return {
    lastUpdated: str(ins.last_updated),
    lastCampaignId: str(ins.last_campaign_id),
    current: ins.current ?? null,
    recentHistory: history
      .filter((h): h is Record<string, unknown> => !!h && typeof h === 'object')
      .slice(-3)
      .map((h) => ({
        campaignId: typeof h.campaign_id === 'string' ? h.campaign_id : undefined,
        timestamp: typeof h.timestamp === 'string' ? h.timestamp : undefined,
        insights: h.insights ?? null,
      })),
  }
}

function capturedScreenshotUrl(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null
  const url = (value as Record<string, unknown>).url
  return typeof url === 'string' ? url : null
}

// ---- Prompt sub-builders -----------------------------------------------

function brandBlock(memory: MarketingMemory): string {
  const { project, brand } = memory
  const lines: string[] = []
  lines.push('BRAND CONTEXT')
  lines.push(`Product: ${project.name || 'Unnamed product'}`)
  if (project.website) lines.push(`Website: ${project.website}`)
  if (brand.tagline) lines.push(`Tagline: ${brand.tagline}`)
  if (brand.valueProp) lines.push(`Value proposition: ${brand.valueProp}`)
  if (brand.audience) lines.push(`Audience: ${brand.audience}`)
  if (brand.tone) lines.push(`Tone of voice: ${brand.tone}`)
  if (brand.features.length) lines.push(`Key features: ${brand.features.slice(0, 6).join(' · ')}`)
  if (brand.differentiators.length) lines.push(`Differentiators: ${brand.differentiators.slice(0, 5).join(' · ')}`)
  if (brand.pricing) lines.push(`Pricing: ${brand.pricing}`)
  if (brand.primaryColor) lines.push(`Primary color: ${brand.primaryColor}`)
  return lines.join('\n')
}

function classificationBlock(memory: MarketingMemory): string | null {
  const c = memory.classification
  const lines: string[] = []
  if (c.vertical) lines.push(`Vertical: ${c.vertical}`)
  if (c.businessModel) lines.push(`Business model: ${c.businessModel}`)
  if (c.targetMarket) lines.push(`Market: ${c.targetMarket}`)
  if (c.stage) lines.push(`Stage: ${c.stage}`)
  if (c.primaryGoal) lines.push(`Primary goal: ${c.primaryGoal}`)
  if (c.icp) lines.push(`ICP: ${c.icp}`)
  if (c.competitors.length) lines.push(`Known competitors: ${c.competitors.slice(0, 4).join(' · ')}`)
  if (c.complianceFlags.length) lines.push(`Compliance: ${c.complianceFlags.join(' · ')}`)
  if (!lines.length) return null
  return ['PRODUCT CLASSIFICATION', ...lines].join('\n')
}

function blueprintBlock(memory: MarketingMemory, surface: MemorySurface): string | null {
  const bp = memory.blueprint
  const lines: string[] = []
  lines.push(`Primary KPI: ${bp.primaryKpi}`)
  if (bp.primaryChannels.length) lines.push(`Primary channels: ${bp.primaryChannels.join(' · ')}`)
  if (bp.secondaryChannels.length) lines.push(`Secondary channels: ${bp.secondaryChannels.join(' · ')}`)
  if (surface === 'launch_strategy' || surface === 'ad_copy' || surface === 'landing_page') {
    if (bp.launchTactics.length) lines.push(`Launch tactics: ${bp.launchTactics.join(' · ')}`)
  }
  if (surface === 'landing_page' || surface === 'ad_copy') {
    if (bp.croFocus.length) lines.push(`CRO focus: ${bp.croFocus.join(' · ')}`)
  }
  if (surface === 'email') {
    if (bp.lifecycleEmails.length) lines.push(`Lifecycle emails: ${bp.lifecycleEmails.join(' · ')}`)
  }
  if (surface === 'blog' || surface === 'social_post') {
    const mix = bp.contentMix.map((m) => `${m.label} ${m.pct}%`).join(' · ')
    if (mix) lines.push(`Content mix: ${mix}`)
  }
  return ['MARKETING BLUEPRINT', ...lines].join('\n')
}

function strategyInsightsBlock(memory: MarketingMemory, surface: MemorySurface): string | null {
  const lines: string[] = []
  const current = memory.launchInsights.current
  if (current && typeof current === 'object') {
    const summary = summarizeLaunchInsights(current as Record<string, unknown>)
    if (summary) {
      lines.push('Last launch lessons:')
      lines.push(summary)
    }
  }
  if (memory.adInsights.length && (surface === 'ad_copy' || surface === 'launch_strategy' || surface === 'landing_page' || surface === 'social_post')) {
    lines.push('Ad performance insights:')
    for (const ins of memory.adInsights.slice(0, 5)) {
      lines.push(`- ${ins.text}`)
    }
  }
  if (!lines.length) return null
  return ['MARKETING MEMORY (use these lessons)', ...lines].join('\n')
}

function summarizeLaunchInsights(current: Record<string, unknown>): string | null {
  const lines: string[] = []
  const winning = stringArray(current.winning_hooks ?? current.winning_patterns)
  if (winning.length) lines.push(`Winning hooks: ${winning.slice(0, 4).join(' · ')}`)
  const weak = stringArray(current.weak_areas ?? current.things_to_avoid)
  if (weak.length) lines.push(`Avoid: ${weak.slice(0, 4).join(' · ')}`)
  const channelNotes = current.channel_notes
  if (channelNotes && typeof channelNotes === 'object' && !Array.isArray(channelNotes)) {
    const entries = Object.entries(channelNotes as Record<string, unknown>).slice(0, 4)
    for (const [ch, note] of entries) {
      if (typeof note === 'string') lines.push(`  ${ch}: ${note}`)
    }
  }
  const next = stringArray(current.next_experiments ?? current.recommended_next)
  if (next.length) lines.push(`Next experiments: ${next.slice(0, 3).join(' · ')}`)
  return lines.length ? lines.join('\n') : null
}

function founderVoiceBlock(memory: MarketingMemory): string | null {
  const { samples, styleNotes } = memory.founderVoice
  if (!samples.length && !styleNotes) return null
  const lines: string[] = ['FOUNDER VOICE (match this tone, phrasing, cadence)']
  if (styleNotes) lines.push(`Style notes: ${styleNotes}`)
  if (samples.length) {
    lines.push('Samples:')
    for (const [i, s] of samples.slice(0, 4).entries()) {
      lines.push(`[${i + 1}] ${s}`)
    }
  }
  return lines.join('\n')
}

function styleReferencesBlock(memory: MarketingMemory): string | null {
  if (!memory.styleReferences.length) return null
  const surface = memory.assetKind ?? 'this asset'
  const lines: string[] = [`PROVEN STYLE REFERENCES for ${surface} (emulate what worked)`]
  memory.styleReferences.slice(0, 5).forEach((ref, i) => {
    const why = ref.whyGood ? ` (why it worked: ${ref.whyGood})` : ''
    lines.push(`[${i + 1}]${why}`)
    lines.push(ref.content)
  })
  return lines.join('\n')
}

function surfaceGuidance(memory: MarketingMemory, surface: MemorySurface): string | null {
  // Light-touch reminders so the generator stays anchored on the right surface.
  // Keeping it short — heavier guidance lives in the per-generator system prompt.
  switch (surface) {
    case 'launch_strategy':
      return 'TASK: produce a strategic plan grounded in the blueprint above. Ensure recommendations align with the primary KPI and stated channels.'
    case 'ad_copy':
      return 'TASK: produce ad copy that respects platform conventions, leans into the winning hooks above, and avoids the patterns listed under "Avoid".'
    case 'social_post':
      return 'TASK: produce a social post that sounds native to the platform and matches the founder voice samples. Use proven style references as inspiration.'
    case 'email':
      return 'TASK: produce an email that maps to the lifecycle stage above and reuses subject/body patterns from proven references where appropriate.'
    case 'blog':
      return 'TASK: produce a long-form post aligned with the content mix above. Lead with the primary keyword and ground claims in the product context.'
    case 'landing_page':
      return 'TASK: produce landing-page sections that map onto the CRO focus above and convert toward the primary goal.'
    case 'video':
      return 'TASK: produce a video script grounded in the brand, audience, and proven hooks. Keep duration appropriate for the channel.'
    case 'image':
      return 'TASK: produce an image prompt grounded in the brand, product, and audience. Respect design tokens / primary color when specified.'
    default: {
      const _exhaustive: never = surface
      void _exhaustive
      return null
    }
  }
}

// ---- Helpers ------------------------------------------------------------

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function asRecordOrNull(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
}
