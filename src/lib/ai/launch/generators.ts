import { generateObject } from 'ai'
import { openrouter } from '@/lib/ai/openrouter'
import { modelFor, modelLabel, MODEL_GEMINI_PRODUCTION } from '@/lib/ai/models'
import { PLATFORM_SPECS, pickSubreddits } from './specs'
import { trackGen, type TrackOpts } from './utils'
import {
  MetaAdSchema, LinkedInAssetsSchema, TikTokAssetsSchema, TwitterThreadSchema,
  RedditPostsSchema, EmailSequenceSchema, BlogPostSchema, LandingPageSchema,
  MetaAdVariantsSchema, LinkedInVariantsSchema,
} from './schemas'

const MODEL = MODEL_GEMINI_PRODUCTION
const STRATEGIC = () => modelFor('strategic')

export interface LaunchContext {
  productName: string
  tagline: string
  valueProp: string
  audience: string
  features: string[]
  differentiators: string[]
  pricing: string
  tone: string
  primaryColor: string
  heroImageUrl: string | null
  website: string | null
}

function contextBlock(ctx: LaunchContext) {
  return `PRODUCT: ${ctx.productName}
TAGLINE: ${ctx.tagline}
VALUE PROP: ${ctx.valueProp}
AUDIENCE: ${ctx.audience}
FEATURES: ${ctx.features.join(' · ')}
DIFFERENTIATORS: ${ctx.differentiators.join(' · ')}
PRICING: ${ctx.pricing}
TONE: ${ctx.tone}
WEBSITE: ${ctx.website ?? ''}`
}

export async function genMetaAd(ctx: LaunchContext, track?: TrackOpts) {
  const startedAt = Date.now()
  const res = await generateObject({
    model: openrouter(MODEL),
    schema: MetaAdSchema,
    system: `You are a Meta performance marketer. Generate ONE high-converting Meta feed ad. Follow these platform constraints strictly:\n${PLATFORM_SPECS.meta.constraints}`,
    messages: [{ role: 'user', content: `${contextBlock(ctx)}\n\nGenerate a Meta ad that drives signups. Lead with a specific transformation for the audience.` }],
  })
  await trackGen(track, 'launch_meta', MODEL, res.usage, startedAt)
  return res.object
}

export async function genMetaAdVariants(ctx: LaunchContext, track?: TrackOpts) {
  const startedAt = Date.now()
  const res = await generateObject({
    model: openrouter(MODEL),
    schema: MetaAdVariantsSchema,
    system: `You are a Meta performance marketer writing 3 A/B variants for testing. Each variant MUST use a DIFFERENT hook_framework from this library:
- stat_shock: Lead with a surprising statistic
- micro_story: 1-2 sentence vignette that shows the pain or result
- direct_callout: Name the audience specifically ("If you're a [x]...")
- contrarian: Challenge a common belief or best-practice
- before_after: Frame the life-changing shift
- question_agitate: Ask a pointed question that exposes the pain

Follow platform constraints strictly:\n${PLATFORM_SPECS.meta.constraints}`,
    messages: [{ role: 'user', content: `${contextBlock(ctx)}\n\nGenerate 3 distinct Meta ad variants that all drive the same signup outcome but use three different hook_frameworks from the list. Headlines should feel completely different from each other — no shared phrases.` }],
  })
  await trackGen(track, 'launch_meta_variants', MODEL, res.usage, startedAt)
  return res.object.variants
}

export async function genLinkedInVariants(ctx: LaunchContext, track?: TrackOpts) {
  const startedAt = Date.now()
  const res = await generateObject({
    model: openrouter(MODEL),
    schema: LinkedInVariantsSchema,
    system: `You are a LinkedIn B2B marketer writing 3 A/B sponsored-post variants plus 2 organic posts. Each sponsored variant MUST use a different hook_framework: stat_shock, micro_story, direct_callout, contrarian, before_after, or question_agitate. Follow constraints strictly:\n${PLATFORM_SPECS.linkedin.constraints}`,
    messages: [{ role: 'user', content: `${contextBlock(ctx)}\n\nGenerate 3 sponsored variants (different hook_frameworks each) + 2 organic posts. Organic posts: stat-driven professional tone, no emojis in first line.` }],
  })
  await trackGen(track, 'launch_linkedin_variants', MODEL, res.usage, startedAt)
  return res.object
}

export async function genLinkedInAssets(ctx: LaunchContext, track?: TrackOpts) {
  const startedAt = Date.now()
  const res = await generateObject({
    model: openrouter(MODEL),
    schema: LinkedInAssetsSchema,
    system: `You are a LinkedIn B2B marketer. Generate one sponsored ad + two organic posts. Follow these constraints strictly:\n${PLATFORM_SPECS.linkedin.constraints}`,
    messages: [{ role: 'user', content: `${contextBlock(ctx)}\n\nGenerate LinkedIn assets. Organic posts should be stat-driven, professional, no emojis in first line.` }],
  })
  await trackGen(track, 'launch_linkedin', MODEL, res.usage, startedAt)
  return res.object
}

export async function genTikTokAssets(ctx: LaunchContext, track?: TrackOpts) {
  const startedAt = Date.now()
  const res = await generateObject({
    model: openrouter(MODEL),
    schema: TikTokAssetsSchema,
    system: `You are a TikTok creator who writes viral scripts. Generate 3 short-form reels. Follow these constraints strictly:\n${PLATFORM_SPECS.tiktok.constraints}`,
    messages: [{ role: 'user', content: `${contextBlock(ctx)}\n\nGenerate 3 TikTok reel scripts with different hooks: pattern-interrupt, before/after, and day-in-life. Native creator energy only — never corporate.` }],
  })
  await trackGen(track, 'launch_tiktok', MODEL, res.usage, startedAt)
  return res.object
}

export async function genTwitterThread(ctx: LaunchContext, track?: TrackOpts) {
  const startedAt = Date.now()
  const res = await generateObject({
    model: openrouter(MODEL),
    schema: TwitterThreadSchema,
    system: `You write Twitter threads that go viral in indie hacker and creator circles. Follow these constraints strictly:\n${PLATFORM_SPECS.twitter.constraints}`,
    messages: [{ role: 'user', content: `${contextBlock(ctx)}\n\nGenerate a 5-7 tweet thread and 2 standalone tweets. Thread pattern: hook → problem → solution → CTA. Hook tweet must work standalone.` }],
  })
  await trackGen(track, 'launch_twitter', MODEL, res.usage, startedAt)
  return res.object
}

export async function genRedditPosts(ctx: LaunchContext, founderVoice?: string, track?: TrackOpts) {
  const subs = pickSubreddits(ctx.audience, ctx.valueProp)
  const startedAt = Date.now()
  const first = await generateObject({
    model: openrouter(MODEL),
    schema: RedditPostsSchema,
    system: `You write Reddit posts that get upvoted without looking promotional. Follow these constraints strictly:\n${PLATFORM_SPECS.reddit.constraints}\n\nAvailable subreddits: ${subs.join(', ')}\n\n${founderVoice ? 'FOUNDER VOICE — match this tone:\n' + founderVoice.slice(0, 3000) : ''}`,
    messages: [{ role: 'user', content: `${contextBlock(ctx)}\n\nGenerate 3 Reddit posts for 3 different subreddits from the list. Vary post type (story, value, question). Product mention only at the bottom of the body, if at all. Title must be non-promotional.` }],
  })
  await trackGen(track, 'launch_reddit_draft', MODEL, first.usage, startedAt)

  const critiqueStart = Date.now()
  const critique = await generateObject({
    model: openrouter(MODEL),
    schema: RedditPostsSchema,
    system: `You are a Reddit mod. Reject posts that: (1) have promotional titles, (2) read like marketing copy, (3) lack personal story/specificity, (4) mention product in first half, (5) use hype words, (6) have hashtags, (7) feel AI-generated. REWRITE any flagged post in first-person human voice with specific details. Output the full 3-post set.`,
    messages: [{ role: 'user', content: `${contextBlock(ctx)}\n\nDRAFT POSTS (critique and rewrite to pass a Reddit mod):\n${JSON.stringify(first.object).slice(0, 6000)}` }],
  })
  await trackGen(track, 'launch_reddit_critique', MODEL, critique.usage, critiqueStart)

  return critique.object
}

export async function genEmailSequence(ctx: LaunchContext, track?: TrackOpts) {
  const startedAt = Date.now()
  const res = await generateObject({
    model: openrouter(MODEL),
    schema: EmailSequenceSchema,
    system: `You write welcome email sequences that feel personal, not corporate. Follow these constraints strictly:\n${PLATFORM_SPECS.email.constraints}`,
    messages: [{ role: 'user', content: `${contextBlock(ctx)}\n\nGenerate a 3-email welcome sequence:\n- Email 1 (0hr): warm welcome + quickstart\n- Email 2 (24hr): one killer feature walkthrough\n- Email 3 (72hr): story of best result + upgrade CTA\nWrite like a friend, not a brand.` }],
  })
  await trackGen(track, 'launch_email', MODEL, res.usage, startedAt)
  return res.object
}

export async function genBlogPost(ctx: LaunchContext, track?: TrackOpts) {
  const startedAt = Date.now()
  const res = await generateObject({
    model: STRATEGIC(),
    schema: BlogPostSchema,
    system: `You write SEO-optimized blog posts that rank. Follow these constraints strictly:\n${PLATFORM_SPECS.blog.constraints}`,
    messages: [{ role: 'user', content: `${contextBlock(ctx)}\n\nGenerate a 1500-word blog post targeting a keyword the audience searches for. Structure: Problem → Why it matters → Concrete solution → Examples → CTA. Natural keyword density 1-2%.` }],
  })
  await trackGen(track, 'launch_blog', modelLabel('strategic'), res.usage, startedAt)
  return res.object
}

export async function genLandingPage(ctx: LaunchContext, track?: TrackOpts) {
  const startedAt = Date.now()
  const res = await generateObject({
    model: openrouter(MODEL),
    schema: LandingPageSchema,
    system: `You write high-converting landing pages. Follow these constraints strictly:\n${PLATFORM_SPECS.landing.constraints}`,
    messages: [{ role: 'user', content: `${contextBlock(ctx)}\n\nGenerate a landing page with a single conversion goal (email signup). Headline must be a clear outcome, not a feature.` }],
  })
  await trackGen(track, 'launch_landing', MODEL, res.usage, startedAt)
  return res.object
}
