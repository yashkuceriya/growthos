@AGENTS.md

# GrowthOS — Marketing Command Center

## What This Is
Internal marketing & customer acquisition platform for managing campaigns, AI-generated ads, email, social media, content/SEO, leads, analytics, and budgets across multiple projects. Built to market SubTracker, Bookmarker, and any future product.

## Tech Stack
- **Framework**: Next.js 16.2.3 + React 19 + TypeScript (App Router)
- **Database**: Supabase (PostgreSQL + Auth + Storage)
- **UI**: shadcn/ui (base-nova style, uses `@base-ui/react` — NO `asChild` prop, use children instead) + Tailwind CSS 4 + Lucide icons
- **AI**: Vercel AI SDK v6 (`ai` + `@ai-sdk/openai`) via OpenRouter. Token usage fields: `usage.inputTokens` / `usage.outputTokens` (NOT promptTokens/completionTokens)
- **State**: React Context (ProjectProvider) + TanStack React Query
- **Charts**: Recharts
- **Email**: Resend (Phase 2)

## Critical Build Notes
- Supabase clients are **untyped** (`createServerClient()` / `createBrowserClient()` without `<Database>` generic). This avoids `never` type errors. Will add proper types via `supabase gen types typescript` once DB is live.
- shadcn base-nova uses `@base-ui/react` — `DialogTrigger`, `DropdownMenuTrigger` etc do NOT support `asChild`. Just wrap children directly.
- `Select` `onValueChange` can return `null` — always guard: `onValueChange={(v) => v && setState(v)}`
- Vercel AI SDK v6 `generateObject` returns `{ object, usage }` where `usage.inputTokens` / `usage.outputTokens`

## Architecture
- Route groups: `(auth)` for login/signup, `(app)` for protected routes
- Auth guard in `(app)/layout.tsx` — redirects to `/login` if no user
- Everything is scoped to **projects** — each project = a product being marketed
- `ProjectProvider` context (`hooks/use-project.tsx`) wraps all `(app)` routes, persists active project to localStorage key `growthos-active-project`
- `ProjectSwitcher` in sidebar for switching between projects
- Supabase RLS: all tables have `auth.uid() = user_id` policy
- Server client: `lib/supabase/server.ts`, Browser client: `lib/supabase/client.ts`
- AI calls use `lib/ai/openrouter.ts` shared OpenRouter client config
- Cost tracking via `lib/cost-tracker.ts` → `ai_cost_ledger` table
- Emerald green accent color (bg-emerald-600), dark theme (bg-slate-900)

## Key Patterns
- **Client components**: Direct Supabase client calls for CRUD (no server actions for client-side mutations)
- **AI structured output**: `generateObject({ model: openrouter('model-id'), schema: ZodSchema, system, messages })`
- **SSE streaming**: API routes return `ReadableStream` with `data: JSON\n\n` format for progress updates
- **Page structure**: Each page is `'use client'` with `useProject()` hook, fetches data in `useEffect` on `activeProject.id` change

## Directory Layout
```
src/
  app/(auth)/              — login, signup, callback (Supabase auth)
  app/(app)/               — ALL protected routes:
    dashboard/page.tsx     — Module grid + quick stats
    projects/page.tsx      — CRUD with Dialog form
    campaigns/page.tsx     — Campaign list + create Dialog
    ad-studio/page.tsx     — Ad library + review queue (tabs: Review/Approved/All)
    ad-studio/generate/page.tsx — Brief form → SSE pipeline → redirect
    email/page.tsx         — Placeholder
    social/page.tsx        — Placeholder
    content/page.tsx       — Placeholder
    leads/page.tsx         — Placeholder
    analytics/page.tsx     — Placeholder
    budget/page.tsx        — Placeholder
    settings/page.tsx      — Placeholder
  app/api/ai/
    generate-ad/route.ts   — POST: creates brief, runs iterator pipeline, streams SSE, saves to DB
  lib/supabase/
    server.ts              — createClient() (cookies), createServiceClient() (service role)
    client.ts              — createClient() (browser)
    types.ts               — Database interface (kept for reference, NOT used in clients)
  lib/ai/
    openrouter.ts          — Shared OpenRouter client config
    ad-studio/
      schemas.ts           — Zod: AdCopySchema, DimensionScoreSchema, BatchedEvaluationSchema + TS interfaces
      rubrics.ts           — DIMENSION_WEIGHTS, thresholds, HOOK_FRAMEWORKS, buildSystemPrompt, buildEvaluationPrompt, buildRefinementPrompt
      generator.ts         — generateAdCopy(), refineAdCopy() using generateObject
      evaluator.ts         — evaluateAdCopy() — batched 5-dimension scoring in 1 LLM call
      compliance.ts        — checkCompliance() — rule-based, zero LLM cost, Meta/Google/LinkedIn limits
      iterator.ts          — runAdPipeline() — full generate→evaluate→refine loop with early stopping
  lib/cost-tracker.ts      — trackAICost(), estimateCost() with model cost table
  components/
    layout/AppSidebar.tsx  — Nav links for all 8 modules + settings + sign out
    layout/ProjectSwitcher.tsx — Dropdown to switch active project
    providers/QueryProvider.tsx — TanStack React Query wrapper
    ui/                    — 18 shadcn components (button, card, dialog, input, etc.)
  hooks/use-project.tsx    — ProjectProvider context + useProject() hook
supabase/migrations/
  001_core_schema.sql      — profiles, projects, campaigns, campaign_metrics, ad_briefs, ad_copies, ad_insights, ai_cost_ledger (all with RLS)
```

## Ad Studio Pipeline (ported from Nerdy Ad Engine Python→TypeScript)
- 6 hook frameworks: stat shock, micro-story, direct callout, contrarian, before/after, question+agitate
- 5 evaluation dimensions: clarity (20%), value_proposition (25%), cta_strength (20%), brand_voice (15%), emotional_resonance (20%)
- Quality threshold: 7.0, early stop: 9.0+, max iterations: 5
- Compliance checker: character limits per platform, valid CTA buttons, prohibited content, warning patterns, caps/emoji checks
- Model: `google/gemini-2.0-flash-001` for all steps (draft, refine, evaluate)
- Brand voice stored per-project in `projects.brand_voice` JSONB column

## Database Tables (Phase 1 — all in 001_core_schema.sql)
- `profiles` — auto-created on signup via trigger
- `projects` — name, slug, brand_voice, target_audiences, competitors, settings (all JSONB)
- `campaigns` — project_id, status, channels[], budget, dates, kpis
- `campaign_metrics` — daily per-channel: impressions, clicks, conversions, spend, revenue
- `ad_briefs` — platform, audience, offer, goal, tone
- `ad_copies` — iteration_number, primary_text, headline, description, cta_button, status, evaluation_scores, weighted_average, compliance
- `ad_insights` — insight_type, insight_text, evidence, sample_count
- `ai_cost_ledger` — module, model, tokens, cost_usd, latency

### Phase 2 Tables (002_email_engine.sql + 003_social_scheduler.sql)
- `email_templates` — name, subject, body_html, body_json, category
- `email_lists` — name, description, subscriber_count (auto-updated via trigger)
- `email_subscribers` — list_id, email, name, metadata, status. Unique on (list_id, email)
- `email_sequences` — trigger_type (signup/tag_added/manual/event), status (draft/active/paused)
- `email_sequence_steps` — sequence_id, template_id, step_order, delay_hours, condition
- `email_sends` — template_id, subscriber_id, sequence_id, status tracking (queued→sent→delivered→opened→clicked)
- `social_accounts` — platform, account_name, encrypted tokens
- `social_posts` — platform, content, media_urls[], status (draft/scheduled/published), scheduled_at, engagement jsonb, ai_generated

## Phase 2 Features Built
- **Email Engine** (`app/(app)/email/page.tsx`): 3-tab UI (Templates / Lists / Sequences)
  - Template CRUD with HTML editor + preview modal
  - AI email generation via `/api/ai/generate-email` → populates template form
  - Subscriber list management
  - Drip sequence creation with trigger types
  - AI generator: `lib/ai/email/generator.ts` — Zod schema for subject+preview_text+body_html
- **Social Scheduler** (`app/(app)/social/page.tsx`): 2-tab UI (Calendar / All Posts)
  - Weekly calendar view with date-fns (navigable, shows posts per day)
  - Post composer with platform selector + character count + optional scheduling
  - AI post generation via `/api/ai/generate-social` → populates composer
  - AI generator: `lib/ai/social/generator.ts` — platform-aware (Twitter 280 chars, LinkedIn 3000, Instagram 2200)
  - Platform icons: MessageCircle (twitter), Briefcase (linkedin), Camera (instagram) — lucide has no brand icons
- **API Routes**: `api/ai/generate-email/route.ts`, `api/ai/generate-social/route.ts` — both track costs via ai_cost_ledger

## Phase 3 Features Built
- **Content Workshop** (`app/(app)/content/page.tsx`): Content list + inline markdown editor
  - AI blog generation via `/api/ai/generate-content` (topic + keyword → full markdown post)
  - SEO score checker (rule-based: keyword in title, density, headings, word count, intro placement)
  - Content CRUD with type (blog_post, case_study, landing_page, whitepaper) and status workflow
  - Editor view: markdown textarea + SEO score panel with pass/fail checklist
  - AI generator: `lib/ai/content/generator.ts` + `calculateSeoScore()` utility
- **Lead Pipeline** (`app/(app)/leads/page.tsx`): List + kanban views
  - Lead CRUD with score, status columns (new→contacted→qualified→nurturing→converted→lost)
  - Kanban board view with columns per status
  - Status dropdown to move leads through pipeline
  - Public capture endpoint: `POST /api/leads/capture` (no auth, uses service client)
  - Lead scoring: base 10 on capture, events tracked in `lead_events`
- **Analytics Dashboard** (`app/(app)/analytics/page.tsx`): Recharts visualizations
  - 4 stat cards (impressions, clicks, conversions, spend)
  - BarChart: spend by channel
  - LineChart: daily impressions + clicks
  - AI cost breakdown by module from `ai_cost_ledger`
  - Date range filter
- **Budget Tracker** (`app/(app)/budget/page.tsx`): Allocations + expenses
  - Summary cards: allocated, spent, remaining + PieChart by channel
  - Allocation CRUD with campaign link, channel, planned amount, period
  - Expense logging against allocations
  - Progress bars showing spend vs planned, over-budget badges

### Phase 3 Tables (004-006 migrations)
- `content_pieces` — title, slug, body_markdown, content_type, status, seo_score, target_keywords[], word_count
- `landing_pages` — name, slug (unique), template jsonb, published, visits, conversions
- `leads` — email, name, source, score, status (new→converted→lost)
- `lead_events` — lead_id, event_type, metadata
- `budget_allocations` — campaign_id, channel, planned_amount, period dates
- `budget_expenses` — allocation_id, amount, description, expense_date

## ALL PHASES + INTEGRATIONS COMPLETE (27 routes)

## Phase 4: Integrations & Polish
- **Resend email sending** (`lib/email/resend.ts`): `sendEmail()`, `sendTemplateToSubscriber()` with placeholder replacement ({{name}}, {{email}})
- **Email send API** (`api/email/send/route.ts`): POST with templateId + listId or subscriberIds, sends to all active subscribers
- **Email webhook** (`api/webhooks/email/route.ts`): Handles Resend events (delivered, opened, clicked, bounced, complained), updates email_sends status, marks bounced subscribers
- **Ad insight extraction** (`lib/ai/ad-studio/insight-extractor.ts`): `extractInsights()` analyzes completed ad runs via LLM, `saveInsights()` stores to DB. Auto-runs after ad pipeline completes (in generate-ad route). Insights injected into future generation prompts.
- **Landing page builder** (`app/(app)/leads/pages/page.tsx`): Create pages with headline/subheadline/body/CTA, publish/unpublish, copy URL
- **Public landing pages** (`app/p/[slug]/page.tsx`): Server-rendered, dark themed, lead capture form that POSTs to /api/leads/capture. Tracks visits, conversions. Client-side JS for form submission without page reload.
- **Dashboard live stats**: Fetches real counts from campaigns, ad_copies, leads, ai_cost_ledger

## Recharts type gotcha
- Tooltip `formatter` must NOT type the value param as `number` — use `(value) => [\`$\${Number(value).toFixed(2)}\`, 'label']`

## Phase 5: Agency, Launch & Intelligence (uncommitted, in-progress)
- **Agency Dashboard** (`app/(app)/agency/page.tsx`): Central hub for 21+ AI-powered department agents (brand, seo, sales, social, content, creative lab, competitive intel, etc.). Clicking a dept calls `/api/agency/<dept>` → agent runs → results merged into `projects.brand_voice` JSONB. Status tiles surface brand-book readiness, competitive intel, current sprint, launch status.
- **Launch Orchestrator** (`app/(app)/launch/page.tsx` + `api/launch/route.ts`): Multi-channel campaign generator. Runs 4 sequential strategic agents (CMO → SEO → Director review → Analytics), then parallelizes 8 channel generators (Meta, LinkedIn, TikTok, Twitter, Reddit, Email, Blog, Landing). SSE stream emits `agent_status` + `channel_status` events. Writes assets to `ad_copies`, `social_posts`, `email_sequences`/`email_templates`, `content_pieces`, `landing_pages`. Campaign metadata JSONB preserves full audit trail.
- **Project Ingest** (`api/projects/ingest/route.ts`): Crawls a URL, extracts brand info (tagline, value prop, features, testimonials, colors) via Gemini structured extraction, then runs classifier → vertical, business_model, stage, compliance flags, ICP. All stored in `projects.brand_voice`.
- **Playbook Registry** (`lib/ai/playbooks/registry.ts`): 16 vertical-specific playbooks (b2b_saas, b2c_saas, ecommerce, marketplace, dev_tool, ai_product, etc.) specifying primary/secondary/skip channels, KPIs, lifecycle templates, CRO focus, content ratios. Launch route uses this to filter channels per product.
- **Model Router** (`lib/ai/models.ts`): `modelFor('strategic'|'production')`. Strategic (CMO, Director, Brand Hub, Competitive Intel) → Claude Sonnet 4.5 if `ANTHROPIC_API_KEY` set, else Gemini Flash. Production (ads, social, email, landing) → Gemini Flash for cost/volume. Images → Gemini 3.1 Flash Image.
- **Ad Image Generation** (`api/ai/generate-ad-image/route.ts` + `lib/ai/ad-studio/image-generator.ts`): Calls OpenRouter Gemini Image model with brand-grounded visual prompts. Accepts aspect ratios (1:1, 9:16, 1.91:1). Stores URLs in `ad_copies.media_urls`. ~$0.04/image.
- **Founder Voice** (`lib/ai/voice/founder-voice.ts`): Per-user (not per-project) voice samples + style references injected into strategic agents — lets founder tone carry across products.
- **Classifier** (`lib/ai/intelligence/classifier.ts`): Auto-tags products with vertical (16 types), business model, target market, stage, compliance requirements (GDPR/HIPAA/FTC), pricing tier, ICP.
- **Brand Hub** (`lib/ai/agency/brand-hub.ts`): `generateBrandGuidelines()` — positioning, mission, 4 voice traits with we_are/we_are_not, tone-by-context, messaging matrix, taglines, elevator pitches, vocabulary, brand story.
- **JSON Viewer** (`components/ui/json-viewer.tsx`): Generic nested JSON renderer. Humanizes keys, copy-to-clipboard, renders arrays as pills, objects as definition lists. Used across agency result pages.
- **Sidebar**: `/agency` and `/launch` added before Dashboard.
- **Stub dirs** (reserved, mostly empty): `lib/ai/{benchmarks,compliance,market,seo,tools}/`, `lib/deploy/`.
- **Package**: Added `@ai-sdk/anthropic` for Claude routing.

### Phase 5 Tables (007_ad_media.sql + 008_internal_ops.sql)
- `ad_copies.media_urls text[]` — added column for generated image URLs
- `founder_voice` — per-user voice samples + style notes (RLS: `auth.uid() = user_id`)
- `style_references` — winning-asset memory (user- or project-scoped). `asset_kind`, `asset_content`, `why_good`, `metric_proof`. Index on `(user_id, asset_kind)` for fast retrieval by channel.

### Key Phase 5 patterns
- **JSONB consolidation**: Brand book, competitive intel, market intel, classification all live in `projects.brand_voice` — no schema churn per agent.
- **Playbook-driven channel selection**: `/api/launch` skips channels not in the vertical's playbook (e.g., B2B SaaS skips TikTok).
- **Model fallback**: Strategic agents prefer Claude; fall back to Gemini silently if no `ANTHROPIC_API_KEY`.
- **Founder voice is user-scoped**: lives in `founder_voice` table keyed by `user_id`, not `project_id`, so tone transfers across products.

## Social publishing (Bundle I — migration 015)
- **Token storage**: `lib/deploy/encryption.ts` AES-256-GCM (key from `SOCIAL_TOKEN_ENC_KEY`, 32 bytes hex or base64). Tokens persisted to `social_accounts.access_token_encrypted`.
- **Publishers**: `lib/deploy/twitter.ts` posts threads via X API v2 (`POST /2/tweets`, chains via `in_reply_to_tweet_id`). `lib/deploy/linkedin.ts` posts via UGC Posts API (requires `external_account_id` set to author URN). Instagram intentionally not yet supported — Meta Graph requires container-based publishing.
- **Dispatcher**: `lib/deploy/index.ts` `dispatchPost()` — owns the publish state machine. Status flow: `scheduled → publishing → published | failed`. Retries up to `MAX_PUBLISH_ATTEMPTS=3`; transient errors leave status=`scheduled` for next cron tick.
- **Cron**: `/api/social/publish-tick` runs every 5 min via `vercel.json`, drains `status='scheduled' AND scheduled_at <= now()` (up to 25/tick). Auth via `CRON_SECRET`.
- **Manual publish**: `POST /api/social/publish` `{id}` for the "Publish now" button on social page.
- **Account CRUD**: `GET/POST/DELETE /api/social/accounts` (paste-token flow). Settings → Social Accounts section manages connected accounts per project. Upsert keyed on `(project_id, platform)`.
- **UI**: social page shows a no-accounts-connected warning banner; per-post `Publish` button on draft/scheduled/failed; `external_url` link when published; inline error display with attempt count.

## Engagement sync (Bundle J — migration 017)
- **Cron**: `/api/social/engagement-tick` runs `*/30 * * * *`. Picks up to 50 published posts per tick where `engagement_synced_at IS NULL OR engagement_synced_at < now() - 1h`, ordered nulls-first so brand-new posts get their first sync ahead of refreshes.
- **Pullers**: `lib/deploy/twitter-engagement.ts` calls `GET /2/tweets?ids=<csv>&tweet.fields=public_metrics,non_public_metrics`. Sums likes/replies/shares (retweet+quote)/impressions across the entire thread (`metadata.thread_ids`). `lib/deploy/linkedin-engagement.ts` calls `GET /v2/socialActions/{urn-encoded}` for likes + first-level comments. LinkedIn impressions stay `null` (need org admin + organizationalEntityShareStatistics, not in paste-token flow).
- **Normalized shape** (`engagement-types.ts`): `{ likes, replies, shares, impressions, bookmarks?, synced_at, platform_raw }` written to `social_posts.engagement` jsonb.
- **Manual refresh**: `POST /api/social/engagement {id}` for the social-page row-level "Refresh stats" button.
- **UI**: published posts now show inline metrics row (heart/reply/repeat/eye icons); per-row spinner on manual refresh; sync errors surface as amber line ("stats unavailable: ...").
- **Backoff on failure**: `engagement_synced_at` is stamped even when the puller errors, so a permanently-broken row doesn't burn cron quota every tick. The error column tells the UI why it's stale.

## Winner detection + auto-promote (Bundle K — migration 018)
- **Scorer** (`lib/ai/social/winner.ts`): `score = (likes + 3*replies + 5*shares)`; if impressions present, blend with `weighted/impressions * 100 + weighted * 0.1` so high-rate posts beat high-volume-low-engagement ones. Returns 0 for unpublished or no-engagement posts.
- **Selector**: `selectWinners(posts)` picks top 3 per platform over a 30-day window with `minScore=5`, returns `{winners, demote}`. Demote = posts currently flagged `is_winner=true` that no longer qualify.
- **Cron**: `/api/social/winner-tick` runs `0 */6 * * *`. For each project, scores recent posts, marks new winners, demotes fallen ones, and **mirrors winners into `style_references`** (`asset_kind = '<platform>_post'`, `metric_proof = JSON of engagement, why_good = brief rationale`). Idempotent via `style_references.source_post_id` partial-unique index.
- **Manual override**: `POST/DELETE /api/social/winner {id}` for the social-page Trophy button. Demote also deletes the matching style_reference.
- **Style refs flow into generation**: `/api/ai/generate-social` now calls `getFounderVoiceContext(userId, '<platform>_post')` and injects "PROVEN STYLE REFERENCES" into the system prompt — winners feed back into future drafts. The voice loader was already wired, just unfed until now.

## Email winner detection (Bundle L — migration 019)
- Same shape as Bundle K but for `email_templates`. Cron `/api/email/winner-tick` runs `0 */12 * * *`.
- **Scorer** (`lib/ai/email/winner.ts`): `score = 0.3 × open_rate + 0.7 × click_rate` over rolling 30-day window. Click rate weighted heavier (clicks are rarer + stronger signal). `delivered` count is the denominator when Resend webhooks are wired; falls back to `sends` if not.
- **Selector**: top 2 per project, requires `minSends ≥ 20` (don't crown 1-send templates with 100% open rate) and `minScore ≥ 0.05`. Demote = previously-flagged ids that fell out.
- **Promotion**: copies `SUBJECT: ... \n\n <body_html>` (truncated to 8000 chars) into `style_references` with `asset_kind = 'email_template'`, `metric_proof` = JSON of {sends, delivered, opens, clicks, open_rate, click_rate, score}, `source_template_id` link for idempotency. Demote also deletes the matching style ref.
- **Generator injection**: `/api/ai/generate-email` now calls `getFounderVoiceContext(userId, 'email_template')` and threads it through `generateEmailCopy({ ..., styleContext })` into the system prompt.
- **UI**: email page templates now show a Trophy "Top performer" pill on `is_winner` rows.

## Attribution rollup (Bundle M — uses migration 010)
- Migration 010 added utm_* + campaign_id columns to leads/content/landing_pages but the data was invisible. Bundle M surfaces it.
- **Pure aggregator** (`lib/analytics/attribution.ts`): `rollupBySource` (prefers utm_source, falls back to free-text source, falls back to "(direct)"), `rollupByMedium`, `rollupByCampaign` (joins campaign names from a `Map<id, name>`), `rollupBySourceMedium` (cross-tab), `summarize` (totals + attribution coverage). All pure, all tested.
- **API**: `GET /api/analytics/attribution?project_id=&days=` → returns `{summary, by_source, by_medium, by_campaign, by_source_medium}`. RLS scopes leads to the user; we additionally filter by project_id for cross-project safety. Pulls campaign names only for ids that appear (one extra round-trip).
- **UI**: analytics page now renders 4 attribution KPI cards (Leads / Converted / Conversion Rate / Attribution Coverage) + Top Sources panel + Top Campaigns panel + Source × Medium table. Hidden if no leads in the window.
- **Buckets sort by lead count desc**; conversion rate is `converted / leads` (status='converted'). Conversion-rate badge tints emerald above 10%, amber between 0-10%, neutral at 0%.

## Creative modes + video generation (Bundle N — migration 020)
- **Universal mode lever** (`lib/ai/creative/modes.ts`): 8 modes (funny / shocking / trending / contrarian / heartfelt / urgent / aspirational / satirical), each with separate `copy_directive` and `visual_directive`. `modeBlock(id, surface)` returns a prompt-injection block; empty string for unknown/null so callers splice unconditionally.
- **Mode-aware generators**: `/api/ai/generate-ad` accepts `creativeMode`, splices the directive into the brand-voice context the iterator already passes through. `/api/ai/generate-social` does the same, appending it to the founder-voice + style-ref block. Persisted on `ad_briefs.creative_mode` and `social_posts.creative_mode`.
- **Multi-provider video**: `lib/video/` with three provider files (`fal.ts`, `openai.ts`, `xai.ts`) implementing a single `VideoProvider` interface. Dispatcher in `lib/video/index.ts` routes by model id. `MissingProviderKeyError` thrown cleanly when the provider's env var is unset — UI gets a "Set FAL_KEY / OPENAI_API_KEY / XAI_API_KEY" message instead of a 500.
- **Model registry** (`lib/video/models.ts`): 6 models — Kling 2.0 (default, ~$1), Veo 3 (~$2.50), Runway Gen-4 Turbo (~$0.80), Hailuo 02 (~$0.10) via fal; Sora 2 via openai; Grok Imagine via xai. Each carries `cost_usd_per_clip` and `max_seconds` (clamped at submit time).
- **Async submit + poll**: providers return a `providerRequestId`; we persist a row in `video_renders` (status: queued → rendering → completed/failed) with `attached_to_type`/`attached_to_id` for auto-attach to the parent `ad_copies` or `social_posts` row when complete. `/api/ai/generate-video` submits; `/api/video/poll/[id]` is the read-side.
- **Script generation**: `lib/ai/video/script.ts` turns `(topic, mode)` into `{visual_prompt, hook_caption, voiceover}` via Gemini Flash. Visual prompt is what feeds the video model; hook_caption is the on-screen overlay.
- **UI**: `<CreativeModePicker>` (chip grid with emoji) and `<VideoModelPicker>` (cards with $/clip + max seconds + provider). Wired into `/ad-studio/generate` — the page kicks off video render in parallel with the ad pipeline (saves 30-60s) and shows a status panel that polls `/api/video/poll/[id]` every 5s until terminal.
- **Required env**: `FAL_KEY` for Kling/Veo/Runway/Hailuo, `OPENAI_API_KEY` for Sora 2, `XAI_API_KEY` for Grok Imagine. The codebase boots fine without any of them — only the unselected providers throw.

## Video Studio (Bundle O — no migration)
- New page `/video` (`Film` icon in sidebar). Shows the gallery of past renders for the active project — polls in-flight ones live and renders the `<video>` inline once URLs land.
- "New Render" dialog has the full Creative Mode chip picker + Video Model card picker + duration / aspect ratio selects (defaults to 10s, 9:16 vertical).
- API: `GET /api/video/renders?project_id=&limit=` returns the user's renders (RLS-scoped); `DELETE /api/video/renders/[id]` removes a row (we don't try to cancel upstream — providers bill on completion regardless).
- `useVideoPolling()` hook in `hooks/use-video-polling.ts` — encapsulates the 5s polling for any active renders. Keyed on a memoized `id|status` string so the timer only restarts when the active set changes, and uses a ref-shadowed callback so the consumer can capture fresh state without resetting the interval.
- Per-post video attach on `/social` posts is the next bundle's scope; `social_posts.video_url` + `video_render_id` columns are already in place from migration 020.

## Video reliability (Bundle Q — no migration)
- **Cron `/api/video/poll-tick`**: every 2 min via `vercel.json`. Drains up to 25 renders with `status IN ('queued', 'rendering')`. Calls the same `pollVideoRender()` the UI uses, so all polling paths share one code path. Catches the "user closed the tab and the render is now orphaned" gap.
- **Stuck-job timeout**: if a render has been queued/rendering for > 30 min, the cron flips it to `failed` with a "exceeded timeout" message. Prevents the gallery from looping forever on a render the upstream silently dropped.
- **Optional Storage mirror** (`lib/video/storage.ts`): on completion, if `VIDEO_STORAGE_BUCKET` env var is set, fetch the upstream signed URL and re-upload to Supabase Storage at `<user_id>/<render_id>.mp4`. The `video_url` column is replaced with the Supabase public URL so the link survives the 24-48h CDN expiry on fal/openai/xai. No-op when unset; falls through to upstream URL on any mirror failure — never blocks completion. `metadata.mirrored_from` records the original URL for debugging.

## Per-asset video attach (Bundle P — no migration)
- New `<AttachVideoButton>` component in `components/ai/`. Drop-in for any list of ad_copies / social_posts. Manages dialog state, calls `/api/ai/generate-video` with `attachTo: {type, id}`, polls until terminal via `useVideoPolling`, surfaces 4 states inline: idle (button), in-flight (spinner pill), failed (retry pill), completed (link to video).
- Wired into:
  - **Social posts list** (`/social`): per-post button next to the Trophy / Trash actions. Inline `<video>` preview when `video_url` is set.
  - **Ad Studio detail panel** (`/ad-studio`): button next to Generate Images. Inline `<video>` preview below the image stack.
- The dispatcher's existing auto-attach (`lib/video/index.ts → attachVideoToParent`) writes `video_url` / `video_render_id` / `video_status` back to the parent row when the render completes — no extra wiring needed.

## Launch concurrency mutex (Bundle LL — migration 026)
- **Why**: deeper audit found the launch endpoint had no guard against a user clicking the button twice (or running it from two browser tabs). Each launch run spends $1-3 in OpenRouter / Anthropic credits and writes conflicting data via `mergeBrandVoice`. Two concurrent runs = 2× spend + race conditions in `projects.brand_voice.insights` (last-write-wins).
- **Migration 026**: adds `projects.launch_running_at timestamptz` + a partial index for the rare "any launches in flight?" query.
- **Atomic claim** at `/api/launch` start: conditional `UPDATE projects SET launch_running_at = now() WHERE id = $1 AND (launch_running_at IS NULL OR launch_running_at < now() - interval '10 minutes') RETURNING id`. A concurrent run sees zero rows updated and gets `409 Conflict` with a `retry_after_seconds: 60` hint. Stale claims (>10 min, presumed crashed worker) can be overwritten so a dead launch doesn't pin the mutex forever.
- **`finally{}` releases the lock** no matter how the run ends: success, top-level error, budget-exceeded mid-flight. Without this a crashed run would leave the mutex held until the 10-min stale window expires. Also wrapped the orchestrator body in try/catch so a top-level throw (DB drop, OOM) reaches finally cleanly.
- 10-minute stale window is generous: the longest legitimate run is 3-4 minutes (8 channels in parallel + 4 strategic agents serially).

## Cross-tenant + silent cost-track failure (Bundle KK — no migration)
- **Why**: deeper audit pass found two more silent-fail issues that practical testing would catch but unit tests + CI couldn't:
- **Cross-tenant in `/api/ai/generate-video`**: the route accepted `projectId` and `attachTo: { type, id }` in the body and used them with the **service client** (which bypasses RLS) without verifying ownership. Attack: any authed user could submit `projectId: <victim_project>` and `attachTo: { type: 'ad_copy', id: <victim_ad_id> }` to inject a video into the victim's ad copy AND charge cost against the victim's budget. Adjacent routes (`/api/ai/generate-ad-image`, all `/api/social/*` action routes, all agency routes) were OK because they use the session client + RLS. Fix: explicit `select('id').eq('id', body.projectId).maybeSingle()` against the session client before passing to service-client work — RLS returns null for cross-user rows, route 404s.
- **Cost tracking silently dropped from cron-driven flows**: `trackAICost` used `createClient()` (cookie-based session client). In cron contexts (`runIngestJob` → `runIngest` → `trackAICost`, video poll-tick paths, etc.) there are no cookies → anonymous client → RLS policy `auth.uid() = user_id` silently rejects the INSERT. **Every cron-driven AI call's cost was being dropped from the ledger** — the dashboard "AI Spend" panel was understating actual cost. Fix: switched to `createServiceClient()` in cost-tracker. Audit data; the caller always has the right `user_id` from auth-time; read access is still RLS-gated. Logs error if the insert fails so future drift surfaces.
- **Why service-client for cost-tracker is safe**: every caller already verified the user (or the cron loaded the row's `user_id` from a previously-auth'd record). `ai_cost_ledger` is write-only audit data — the user_id field is the source of truth. Read RLS still gates per-user dashboards.

## SSRF guard on webhook URLs (Bundle JJ — no migration)
- **Why**: webhook URL validation only checked `protocol === 'http' | 'https'`. Anyone with `webhooks:write` could register `http://169.254.169.254/latest/meta-data/iam/security-credentials/` (AWS metadata IP), the dispatcher would POST to it, and the response body (truncated to 2000 chars) would land in `webhook_deliveries.response_body` — readable via the deliveries panel. **CVE-class issue**: customers could exfiltrate cloud credentials, hit our own internal endpoints, or scan internal networks via the webhook delivery surface.
- **`lib/webhooks/url-validator.ts` (new)**: blocks
  - non-http(s) protocols (file:, ftp:, javascript:, etc.)
  - URLs with embedded credentials (`user:pass@host`)
  - cloud metadata IPs (`169.254.169.254`, `metadata.google.internal`, `metadata.azure.com`)
  - loopback (`localhost`, `127.x.x.x/8`, `::1`)
  - RFC1918 private ranges (`10/8`, `172.16-31`, `192.168/16`)
  - 0.0.0.0
  - 100.64.0.0/10 (carrier-grade NAT, often Tailscale/internal)
  - IPv6 link-local (`fe80::/10`) and ULA (`fc00::/7`)
  - `.internal` / `.local` / `.corp` / `.intranet` / `.lan` suffixes
- **Dev escape hatch**: when `NODE_ENV !== 'production'`, allows `localhost` / `127.0.0.1` / `::1` so devs can point at a local receiver without ngrok. Cloud metadata + RFC1918 stay blocked even in dev (rarely a real receiver).
- **Two-layer enforcement**:
  1. `/api/webhook-endpoints` (dashboard route) and `/api/v1/webhooks` (public API) reject bad URLs at create time with a clear 400 reason.
  2. `lib/webhooks/dispatch.ts → deliverWebhook` re-validates right before `fetch()`. Defense-in-depth — if a future migration or data-fix leaves a bad URL on a row, the dispatcher refuses to POST. Stamps the row with `error: "Refusing to deliver: <reason>"` so the operator sees why.
- **22 unit tests** in `src/lib/webhooks/url-validator.test.ts` covering every blocked vector + dev-mode exceptions.
- **Cleanup**: removed the local `isValidUrl` / `isHttpsUrl` helpers from both webhook routes — replaced by the centralized validator.

## Smoke test + cache-stale detection + email cron fixes (Bundle II — no migration)
- **Why**: continuing the practical audit. Found three more silent-fail patterns:
  1. **PostgREST schema cache stale**: every table from migrations 014+ (api_keys, webhook_endpoints, ingest_jobs, idempotency_records, etc.) is INVISIBLE to INSERTs even though SELECTs work. Returns `PGRST205` on every mutation. **Every API key mint, webhook create, ingest enqueue silently fails in production.** Migration 025 already has `notify pgrst, 'reload schema'` at the bottom that fixes this — applying it heals both the missing-RPC issue and the schema-cache issue in one shot.
  2. **Email sequence-tick busy-loop**: when `RESEND_API_KEY` is missing, every due enrollment threw "RESEND_API_KEY not set" inside the per-row loop, but `next_send_at` never got pushed forward — the cron retried the same broken row every tick *forever*. Same with `/api/email/send`.
  3. **Smoke test gap**: vitest covers unit logic, CI passes, dev server compiles — but none of that catches "the tables exist for SELECT but not INSERT" or "RPC missing in live DB". Needed a real end-to-end probe.
- **`scripts/smoke.ts`** — runnable diagnostic that exercises a live deployment:
  - Env-var inventory (required vs optional)
  - 11 table read probes
  - 4 table **write** probes (catches PGRST205 stale-cache state)
  - 3 RPC presence probes
  - Storage bucket existence checks (3 buckets)
  - 5 HTTP route 401-gate probes
  - API-key mint → /v1/health round-trip → rate-limit decrement check (verifies bundle AA actually runs)
  - HMAC sign+verify + tamper-detect round-trip (verifies bundle S algorithm matches receivers)
  - Cleans up its temp key + records when done
  - Run with: `npx tsx scripts/smoke.ts`. Exits non-zero on any failure so CI / cron can run it.
- **Cache-stale visibility on the dashboard**: `/api/dashboard/health` now also probes a write to `idempotency_records` / `webhook_endpoints`. If it gets `PGRST205`, it prepends a red "PostgREST schema cache stale" integration row pointing at migration 025. Operator now sees this on every dashboard load.
- **Email cron loud-fail**: `/api/email/sequence-tick` and `/api/email/send` now bail with a 503 if `RESEND_API_KEY` is unset, instead of iterating subscribers and failing each one. Still inside the cron loop, when an individual enrollment fails, `next_send_at` is now pushed +30 min so a single broken row can't pin the cron in a busy-loop.
- **Verified end-to-end**: ran the smoke test against the live deployment — caught all 8 issues with their root causes (3 RPCs missing + 4 stale-cache tables + 1 mint failure cascading from the stale cache). After the user applies migration 025, all 8 should clear at once.

## Self-healing storage buckets (Bundle HH — no migration)
- **Why**: continuing the practical audit, found that **zero Storage buckets existed** in the live project. Three env vars (`SCREENSHOT_STORAGE_BUCKET`, `VIDEO_STORAGE_BUCKET`, `IMAGE_STORAGE_BUCKET`) were unset AND no buckets had been created manually. Every code path that tried to upload silently fell back to a less-good behavior:
  - Ad images: stored as base64 `data:` URLs in `ad_copies.media_urls`. Found a real existing row at **1.68 MB** for one image; three images = ~5MB row. After 50-100 ads, `/ad-studio`'s `select('*')` would OOM the page.
  - Screenshots: kept the upstream signed URL (24h provider TTL) → design tokens unreachable after the cache expires.
  - Videos: same upstream URL keeping behavior → completed renders had broken video links after 24-48h.
- **`lib/storage/ensure-bucket.ts` (new)**: memoized helper that lists buckets on first call per process, creates the bucket public if missing, returns whether it's usable. One round-trip per bucket per process — basically free.
- **Wired into all three storage paths**: `lib/storage/images.ts → uploadAdImage`, `lib/screenshots/capture.ts`, `lib/video/storage.ts → mirrorToStorage`. Each path now calls `ensureBucket()` before uploading, so missing buckets get created on demand. Default bucket names (`ad-images`, `screenshots`, `videos`) so the system works without any env-var configuration.
- **Verified end-to-end** against real Supabase: ran the helper against the live project — created all three missing buckets, listBuckets confirms public.
- **Test mock updates**: `video/storage.test.ts` had to mock `listBuckets` + `createBucket` to play with the new path. Also added `__resetEnsureBucketCache()` so tests don't leak memoization state between cases. The "no env var = no-op" test was replaced with "no env var = falls back to default bucket" which is the new (better) behavior.

## Practical audit + missing-RPC repair (Bundle GG — migration 025)
- **Why**: an audit done at the user's prompt — "make sure things actually work" — checked the live database and found three production RPCs missing despite the migrations being on disk and code calling them. Tables existed; functions didn't. Almost certainly because earlier migrations were partially pasted into Supabase Studio (CREATE TABLE only, not the trailing CREATE FUNCTION blocks). All three were silent-failure hazards:
  - `merge_project_brand_voice` (mig 011) missing → every "Sync Site" + every agency agent threw 500. Bundle FF design tokens never persisted because the merge that stores them blew up.
  - `project_month_ai_spend` (mig 012) missing → budget caps silently never triggered (spend always read as 0 because the destructured `data` from the RPC error path was null).
  - `consume_rate_token` (mig 024) missing → rate limits silently failed-open.
- **Migration 025** (`025_rpc_redo.sql`): re-applies all three RPCs idempotently (`create or replace`) plus `notify pgrst, 'reload schema'` so they're callable immediately. Apply once via Supabase Studio SQL editor (or `supabase db push` if the CLI is wired up). Safe to re-run.
- **Code-level fallbacks** so the system works *even if* the migration isn't applied:
  - `lib/brand-voice.ts → mergeBrandVoice`: if RPC errors with `PGRST202` / "could not find the function", falls back to read-modify-write. Race-prone (concurrent writers can lose writes — the bug 011 was meant to fix) but functional. One-time loud console.error tells the operator what to do. **Verified end-to-end**: tested against live Supabase with the RPC actually missing — fallback path stored + read back the patch correctly.
  - `lib/budget-guard.ts → checkBudget`: if RPC errors, falls back to a direct `select sum(cost_usd) where created_at >= month_start`. Slower (no index optimization the RPC's `STABLE` declaration enables) but correct.
  - `lib/rate-limit-api.ts → enforceRateLimit`: same loud-warn-once log when the RPC is missing. Still fails open since rate-limit infra problems should never block traffic, but the operator sees the cause.
- **Visibility**: `/api/dashboard/health` now probes the three RPCs and prepends a `Database functions` integration row with `error` status when any are missing, listing them by name and pointing to migration 025. Operator sees this on every dashboard load — no more silent breakage.
- **Why this matters**: the prior bundles (Y idempotency, AA rate limits, brand_voice merge in 011) all assumed their RPCs were live in production. The audit caught all three NOT live in this deployment, which means the tests + CI green were giving false confidence. Adding visibility + fallbacks means future migration drift becomes loud, not silent.

## Claude as art director — design tokens + model upgrades (Bundle FF — no migration)
- **Why**: research surfaced two compounding gaps. (1) Default models were old: `gemini-2.0-flash-001` (year-old, more expensive than 2.5 for worse output) and `claude-sonnet-4-5`. (2) Ad images were grounded only on a free-text "brand context" string — the model had no concrete design system (hex codes, typography vibe, layout pattern) to anchor on, so ads tended to look like generic AI ads rather than the user's actual product.
- **Model upgrades** (`lib/ai/models.ts`):
  - `MODEL_GEMINI_PRODUCTION`: `gemini-2.0-flash-001` → `gemini-2.5-flash` (every ad / social / email / blog now routes through 2.5)
  - `MODEL_CLAUDE_STRATEGIC`: `claude-sonnet-4-5-20250929` → `claude-sonnet-4-6`
  - New `MODEL_CLAUDE_VISION`: `claude-sonnet-4-6` (separate constant so vision swaps don't drag strategic agents)
  - `cost-tracker.ts` MODEL_COSTS table updated for the new SKUs so `ai_cost_ledger` keeps emitting accurate numbers.
- **Claude design-token extractor** (`lib/ai/design/extractor.ts`): a vision pass that runs once per ingest. Reads the captured screenshot, returns a structured `DesignTokens` object: `color_palette` (5 hex codes), `typography_vibe`, `layout_pattern`, `mood[]`, `ui_elements[]`, `ad_creative_principles[]` (3-5 imperative visual rules). Uses `modelFor('vision')` so Claude is preferred when `ANTHROPIC_API_KEY` is set, with silent Gemini fallback otherwise. Tracked in `ai_cost_ledger` under module `design_extraction`.
- **Wired into `runIngest`** after the screenshot capture: failure logs but doesn't unwind ingest. Result stored on `projects.brand_voice.design_tokens` + `extracted_at` + `model` (so users / future devs can see which model fired).
- **Image generator consumes the tokens**: `lib/ai/ad-studio/image-generator.ts` now accepts a `designTokensPrompt` param; `designTokensPromptBlock(tokens)` renders the structured tokens as a compact block injected into the system prompt. The model now sees concrete instructions like "Primary color: #10b981 — use as accent only, not background" alongside the actual screenshot bytes.
- **Image generator prompt cleanup**: removed the redundant URL-in-text (`p.referenceImageUrl` was being echoed into the prompt as a string AND attached as a multimodal `image_url` content part). The URL string was distracting the model. Now the prompt refers to "the attached reference image" and the bytes flow only via the multimodal channel.
- **Project page surfaces the palette**: each project card shows up to 5 small color swatches under the website link if `design_tokens.color_palette` exists, plus the first two mood words. Visual confirmation that the design pipeline ran (and a small delight moment when the user sees their brand colors come back).

## Activation + transparency + CI (Bundle EE — no migration)
- **CI** — new `.github/workflows/ci.yml` runs `tsc --noEmit` + `npm run lint` + `npm test` on every push to main and every PR. The lazy-builder bug (Bundle W) lived for ~2 weeks before tests caught it; CI gating closes that window.
- **Activation guide** (`components/dashboard/setup-checklist.tsx`): the dashboard now renders a 4-step checklist when the active project hasn't completed the pipeline (set URL → run sync → generate first ad → run a Launch). Auto-hides once all steps are done. Step state comes from `/api/dashboard/health` which now also returns `setup` (computed by joining projects.website / brand_voice + ad_copies count + campaigns count). Each row links to the relevant page; the "next" step has a green CTA, prior steps show as struck-through and complete.
- **Launch cost transparency**: the Launch page captures wall-clock at run start, then queries `ai_cost_ledger` after the SSE `done` event for entries scoped to (project, since-start). Renders a breakdown table — module / model / calls / cost — and a top-line "$X.XXXX spent on this run" stat. Surfaces *which model actually fired* per agent (so the user can see Claude vs Gemini fallback explicitly, since `modelFor('strategic')` silently degrades when `ANTHROPIC_API_KEY` is missing).
- **Mobile responsive on the high-traffic pages**: dashboard KPI grid, dashboard bottom row, dashboard status bar (now `flex-wrap`), projects grid (1→2→3 cols at sm/lg breakpoints), launch channel grid (2→4 cols at md). Empty-state on `/projects` rewritten with a real explanation + CTA instead of "No projects yet".
- These finish the highest-leverage items from the multi-perspective review (CI hygiene, post-signup activation path, cost transparency for paid users, mobile usability on the most-shown pages). Remaining review items are real follow-up bundles: eval harness vs ChatGPT (strategic decision + framework), Sentry/observability (needs DSN), Stripe (business decision), full mobile sweep across all pages, route-level integration tests.

## Stop lying to the operator (Bundle DD — no migration)
- **Why**: a multi-perspective review surfaced credibility-killing fakes on the dashboard, settings/integrations panel, and support page. A founder demoing this would have noticed the random sparklines and lose all trust. This bundle replaces every hardcoded fake with real data or removes the panel.
- **`/api/dashboard/health` (new)**: returns `{ integrations, activity, kpi }` from real sources:
  - **integrations**: env-var presence + activity-anchored status. OpenRouter is "OK" only if the key is set AND there's an `ai_cost_ledger` entry in the last 30 days. Anthropic / Resend / ScreenshotOne / Video providers / Social tokens all checked from env. Returns `ok | warn | error | optional` per service.
  - **activity**: real recent events from `ingest_jobs`, `ad_copies`, `social_posts` (success and failure), blended and sorted by time. Up to 8 entries, last 14 days.
  - **kpi**: real counts (`active_campaigns`, `leads_total`, `leads_this_week`, `ads_generated`, `total_spend_usd`) plus 14-day daily buckets (`spendDaily`, `leadsDaily`) for sparklines, plus `webhookSuccessRate` (last 7d delivered/total) and `recentIngestStatus`.
- **Dashboard page rewritten**: removed `DEMO_SPARK = () => Math.random()*100`, removed hardcoded "Total Reach 1.28M / Conversion Rate 4.82% / Avg CPC $0.42 / Email CTR 18.5% / SQL Pipeline $428K / CAC Recovery 4.2mo" StatCards (we don't track any of those), removed hardcoded fake activity feed ("UUID_8842 matched enterprise profile" etc.), removed hardcoded "$482,900 Monthly Forecast" panel, removed the fake "Operator Shortcuts" panel (the app implements one keyboard shortcut, not three). New KPI grid shows 4 real metrics with real sparklines that only render when there's actual data.
- **Settings → Integrations rewritten**: removed hardcoded `Google Ads / Meta Graph / TikTok Pixel / SendGrid` list (none of those integrations exist in the codebase). Now shows the live integration status from the same `/api/dashboard/health` source — every integration is one we actually check at runtime.
- **Support page rewritten**: replaced `href: '#'` placeholder links with real targets (API Reference inside the app, GitHub issues, mailto). Removed the Community Chat link (we don't have one). System Status panel now reads from the live integrations check instead of three hardcoded "OPERATIONAL" rows.
- **Lazy-builder cousin sweep**: re-grepped `update().eq()` / `insert()` / `delete()` patterns across all routes. Only one offender (`api-auth.ts → last_used_at`) which Bundle W already fixed. The bare `supabase.from(...)` calls in dashboard / launch / observability are inside `Promise.all([...])` arrays — properly subscribed.

## Real UI capture for content generation (Bundle CC — no migration)
- **Why**: the existing ingest extracts images already embedded in the page HTML — curated marketing shots, sometimes outdated, often low-res. Capturing a fresh-rendered browser screenshot gives downstream content generation visual ground truth (especially the multimodal ad-image generator that already accepts a `referenceImageUrl`).
- **`lib/screenshots/capture.ts`** — provider-agnostic shape with one concrete impl: ScreenshotOne. Set `SCREENSHOTONE_ACCESS_KEY` to enable. Without it, capture returns null and ingest continues — graceful no-op so dev environments without an account still work.
- **Storage mirror** (mirrors `lib/video/storage.ts`): if `SCREENSHOT_STORAGE_BUCKET` is set, the captured PNG is uploaded to Supabase Storage at `<user_id>/<project_id>/<timestamp>.png` and the public URL is returned. Without the bucket, the upstream cached URL is used (24h TTL, may break content downstream — log a warning).
- **Wired into `runIngest`**: every project sync now also captures the live UI. URL stored on `projects.brand_voice.captured_screenshot = { url, mirrored, captured_at }`. Failure here is logged but doesn't unwind the rest of ingest.
- **Used as the top-priority reference image** in `/api/ai/generate-ad-image`: captured shot beats the marketing hero image beats embedded screenshots beats nothing. The multimodal Gemini Image model now anchors ad creatives on what the product actually looks like, not on stock-art-y page images.
- **Visible on the project page**: each project card now shows a screenshot thumbnail at the top — captured shot if available, else the marketing hero, else a "Run Sync Site" placeholder. Visual confirmation that capture worked.
- Capture defaults: 1440×900 viewport, full-page (scroll-and-stitch), 1.5s settle delay, ad/cookie-banner/tracker blocking on. Override per-call via `CaptureOptions`.
- **Setup**: 1) sign up at screenshotone.com (free tier 50/mo), set `SCREENSHOTONE_ACCESS_KEY`. 2) create a public-read bucket `screenshots` in Supabase Storage, set `SCREENSHOT_STORAGE_BUCKET=screenshots`. Re-run "Sync Site" to backfill.

## Health endpoint + scope-free auth (Bundle BB — no migration)
- New `GET /api/v1/health` — the first endpoint a new integration should hit. Returns `{ ok, server_time, key: { id, name, prefix, scopes, ... }, rate_limit: { limit, remaining } }` for any valid key.
- **Why scope-free**: customers minting a new key may not remember which scopes they granted. Hitting health surfaces the actual scope list so they can see what their key allows. With required-scope auth, they'd have to know in advance.
- **Implementation**: `authenticateApiKey(request, null)` — extended the helper to accept `Scope | null`. Null skips the scope check but keeps every other gate (key found, not revoked, not expired). Two new tests cover the null path, including verification that revoked keys still get rejected.
- **Still rate-limited**: hitting `/api/v1/health` consumes a token from the same per-key bucket as everything else. CI loops will see 429 if they hammer it. The response includes `rate_limit.remaining` in the body too, in addition to the `x-ratelimit-*` headers, so customers see the contract from two angles.
- Added to `lib/api-registry.ts` as the first entry — appears at the top of the API Reference docs page. The "Any scope" pill replaces the usual scope name in the docs UI.

## Per-API-key rate limits (Bundle AA — migration 024)
- **Why**: a runaway client integration could otherwise burn budgets and overwhelm the queue. Now every v1 endpoint consumes one token from a per-key bucket; bursts are capped, sustained throughput has a clear ceiling, and the customer's own client gets headers so they can self-throttle.
- **Algorithm**: token bucket. Default burst 60, refill 1 tok/sec → sustained 60 req/min, allowing brief spikes up to 60 in a burst. Override via env vars `API_RATE_LIMIT_BURST` / `API_RATE_LIMIT_RATE` without redeploying.
- **Storage** (migration 024): `api_key_rate_limits (api_key_id PK, tokens_remaining float8, last_refill_at timestamptz)`. The bucket math runs in a Postgres function `consume_rate_token(key, burst, rate)` — single `INSERT ... ON CONFLICT DO UPDATE WHERE` that does refill + decrement atomically. Concurrent requests from the same key serialize on the row lock — no double-spend window.
- **Library** `lib/rate-limit-api.ts`: `enforceRateLimit(supabase, apiKeyId, options?)` returns `{ ok: true, remaining, headers }` or `{ ok: false, response }` (pre-built 429). `attachRateLimitHeaders(response, outcome)` mutates the success response with the `x-ratelimit-*` headers.
- **Fail-open**: if the RPC errors (DB hiccup, permission glitch), the request is ALLOWED and the failure is logged. Bad rate-limit infra must never block customer traffic.
- **Headers** (Stripe-style):
  - On 2xx: `x-ratelimit-limit`, `x-ratelimit-remaining`, `x-ratelimit-reset` (unix seconds)
  - On 429: same three plus `retry-after` (seconds)
- **Wired into all 8 v1 endpoints**: ingest POST, projects GET, leads POST, jobs GET, webhooks GET/POST, webhooks/:id GET/DELETE. Each does `authenticateApiKey` → `enforceRateLimit` → handler. Idempotent replays still consume a token (a retry storm should signal back to the customer that they have a config issue).
- **Tests**: 8 cases covering allowed, 0-remaining, denied, custom rate, fail-open, header attach for ok/denied/fail-open outcomes.
- API Reference page in `/settings` was updated to describe the rate-limit contract so customers can see the headers they should expect.

## Coherent API surface — registries + reference page (Bundle Z — no migration)
- **Why**: the system was functional but had drift risk. `WEBHOOK_EVENT_OPTIONS` in the settings UI was a hand-written copy of `SUPPORTED_EVENTS`, payload schemas in `lib/webhooks/payloads.ts` were invisible to customers, and there was no API reference at all — customers had to read source to learn scopes/idempotency/payload shapes. Now everything's a derivative of two registries.
- **`lib/webhooks/events.ts` is now a rich registry**: each event has `name, label, hint, source, payload[]`. The settings UI's create-form picker derives from it directly (`Object.values(WEBHOOK_EVENTS)` → checkbox list). Adding a new event = one entry here + the producer-side `emitEvent` call.
- **`lib/api-registry.ts` is the new endpoint registry**: each `ApiEndpointDef` carries method, path, scope, idempotent flag, success status, request/response schemas, notes. Eight v1 endpoints catalogued. Adding a new endpoint = one entry here.
- **`/settings` → API Reference tab** (`components/ui/api-reference.tsx`): renders the two registries — quick-start curl example + auth/idempotency primer at the top, then endpoints grouped by resource, then the webhook events catalog. Pure derivative — no hand-written endpoint docs.
- **Cross-links from API Keys + Webhooks tabs** to the new tab so customers find docs without searching.
- **Visual conventions in the docs page**: method-tinted pills (POST=green, GET=blue, PATCH=amber, DELETE=neutral), Lock icon next to scope, RefreshCcw icon next to Idempotent flag, success-status arrow at the right.
- The `isSupportedEvent` type predicate was simplified to `(s: string) => boolean` since no caller relied on the narrowed `SupportedEvent` brand. All caller filters explicitly type as `string`.

## Idempotency keys for v1 (Bundle Y — migration 023)
- **Why**: customer worker queues retry on transient failure. Without idempotency, a network blip on the response would cause the next retry to enqueue a second ingest job, create a duplicate webhook, etc. Now the API is safe to retry.
- **Header**: `Idempotency-Key: <client-generated-uuid>`. Opt-in — clients that don't set it get the old behavior.
- **Wired into**: `POST /api/v1/projects/:id/ingest`, `POST /api/v1/leads`, `POST /api/v1/webhooks`. Each route reads `request.text()` once (we can't `request.json()` twice), hashes it for the idempotency key, then passes through to a handler closure that does the actual work.
- **Replay**: cached response returns byte-for-byte identical body + status + `Idempotent-Replayed: true` header (so clients can tell). 24h TTL via `created_at` filter — no cron sweep needed.
- **Race-safe claim**: `INSERT` (not upsert) — the unique constraint on `(api_key_id, key)` kills parallel claims atomically. The losing writer detects SQLSTATE `23505` and re-fetches the winner's row instead of running the handler. Confirmed test coverage: `replays winner response when our INSERT loses to 23505`. Without this, two truly-concurrent retries would both win the upsert and both run the handler — defeating the whole point.
- **Body hash includes method + path**: same key reused on a different endpoint → 422 (loud client error rather than silent collision).
- **Stale claim recovery**: a `processing` row older than 60s is purged before the next retry's INSERT — covers crashed handlers without locking the key for 24h.
- **Failure rollback**: if the handler throws, the `processing` claim is DELETEd so the retry can re-execute. Without this, a transient bug would lock the key.
- **Body cap**: responses larger than 100KB bypass the cache (we still serve the response, just not idempotently). Larger than anything our v1 routes emit.
- **Migration 023** adds `idempotency_records (api_key_id, key, request_hash, status, response_status, response_body, created_at, completed_at)` with composite PK `(api_key_id, key)`. No RLS — only the service role touches it, and `api_key_id` already gates ownership.
- **Tests**: 18 cases in `src/lib/idempotency.test.ts` covering the matrix: no-key bypass, cold-cache happy path, body-cap, replay, body-mismatch (422), endpoint-mismatch (422), in-flight (409), stale-purge, handler-throws-cleanup, race-lost-replay, race-lost-409, generic-DB-error degradation, hash determinism + method/path/body sensitivity.

## Receiver SDK snippets (Bundle X — no migration)
- New `<WebhookVerifySnippet />` component (`components/ui/webhook-verify-snippet.tsx`) — collapsible block with tabs for Node.js / Python / Go showing a self-contained `verifyGrowthOS(rawBody, header)` function for each language. Uses only stdlib (`crypto`, `hmac`, `crypto/hmac`); no GrowthOS-specific deps so customers can paste-and-go.
- Each snippet implements the full algorithm: parse `t=...,v1=...`, reject timestamps outside the 5-min tolerance, HMAC-SHA256 over `${timestamp}.${rawBody}`, constant-time compare. Commentary at the bottom warns against body-parser middleware that mutates the bytes (signature is over the unparsed wire body).
- Wired into the settings page in two places: the create-success block (so users see verification code right after they get their secret) and inside the expanded endpoint panel (so they can find it later when debugging).
- Copy button per snippet, language-tab switcher.

## api-auth integration tests + lazy-builder bug fix (Bundle W — no migration)
- **Bug**: `lib/api-auth.ts` line 97 had `void supabase.from('api_keys').update({...}).eq('id', ...)` which silently never fired. Supabase JS query builders are lazy — they only run the HTTP request when `.then()` is called (or you await). Prefixing with `void` discards the builder before any subscriber attaches, so `last_used_at` was *never* actually being updated since this code shipped. Fixed by replacing the `void` form with `.then(() => {}, () => {})` to subscribe explicitly while still being non-blocking.
- **Tests**: extended `src/lib/api-auth.test.ts` with 11 new integration tests covering every branch of `authenticateApiKey`:
  - header-shape rejections (missing header, missing Bearer prefix, wrong token prefix)
  - DB-backed rejections (key not found, revoked, expired)
  - acceptance edges (future expires_at, null expires_at)
  - scope gate (missing scope returns 403, present scope alongside others returns ok)
  - side effect: `last_used_at` is touched on success but not on failure
- The Supabase client is mocked at the module level via `vi.mock('@/lib/supabase/server', …)`. Each test seeds an in-memory `keyRow` and tracks `update` calls so the side-effect tests can assert without needing a real DB.

## Webhook test + redrive (Bundle V — no migration)
- **Send test event**: per-endpoint button (paper-plane icon) on the settings page. POSTs `/api/webhook-endpoints/:id/test` which inserts a `test.ping` delivery row and drives it through `deliverWebhook` synchronously, returning the HTTP outcome to the caller. Result toast tells the user instantly whether their receiver acked (2xx → success, 5xx → pending/will-retry, 4xx → failed). The test row shows up in the deliveries panel just like real events.
- **Retry now**: per-delivery button on `failed` and `exhausted` rows (refresh icon). POSTs `/api/webhook-endpoints/:id/deliveries/:deliveryId/redrive` which conditionally resets the row to `status='pending', attempts=0, error=null, next_attempt_at=now` (conditional UPDATE on status — race-safe vs the cron) then dispatches synchronously. Refuses to redrive `success` (idempotency) or `pending`/`delivering` (already in flight).
- `test.ping` is intentionally NOT in `SUPPORTED_EVENTS` — it bypasses `emitEvent`'s subscription filter and dispatches directly to the single endpoint being tested.
- The handlers refresh the deliveries cache for the affected endpoint after the round-trip so the user sees the new row without a manual refresh.

## More webhook events (Bundle U — no migration)
- Adds `lead.created`, `social.published`, `email.bounced` to `SUPPORTED_EVENTS`. Total 5 events shipping now.
- **Wire-ins**:
  - `/api/leads/capture` emits `lead.created` after the new-lead insert (skipped on the dedup path — that's a re-engagement, not a new lead).
  - `lib/deploy/index.ts → dispatchPost` emits `social.published` on publish-success (fires from both cron-tick and manual publish).
  - `/api/webhooks/email` emits `email.bounced` from the Resend bounce handler. Resolves project_id by joining `email_sends.template_id → email_templates.project_id`; passes `null` if the template has been deleted.
- **`emitEvent` now accepts `projectId: string | null`** for events whose source project can't be resolved. Filter rule extracted to `endpointMatchesProject(endpointProjectId, sourceProjectId)`: a null source project fans out only to all-projects subscriptions (never to scoped ones — a project-scoped sub has no business receiving cross-project signal). 5-test matrix covers the rule.
- **Typed payload contracts** in `lib/webhooks/payloads.ts`. Each event has a TS interface (`LeadCreatedPayload`, `SocialPublishedPayload`, `EmailBouncedPayload`, etc.) that callers cast through to keep field names stable. Treat as the public contract — bump to a new event name (e.g. `lead.created.v2`) if you need a breaking change.
- Settings UI's create-form event list grew to all 5 events.

## Webhook UI (Bundle T — no migration)
- Settings page (`/settings`) gains a **Webhooks** section between API Keys and Social Accounts. Lists endpoints with status pill (Active/Disabled), failure-streak warning, scope tag (All projects vs project name), and per-event tags.
- **Inline deliveries panel**: clicking a row expands the most recent 50 deliveries with status pill (success/info/warn), event type, HTTP response code, attempt count, timestamp, and error string. Cached client-side per endpoint id; doesn't auto-refresh.
- **Add Endpoint dialog**: URL field, event-checkbox list (data-driven from `WEBHOOK_EVENT_OPTIONS`), scope radio (All projects vs the active project). Plaintext secret is shown once after create with copy button + signature-format hint (HMAC-SHA256 of `${timestamp}.${rawBody}`, header `x-growthos-signature: t=...,v1=...`).
- **Disable/Re-enable** via Power button — calls `PATCH /api/webhook-endpoints/:id { active: bool }`. Re-enable also resets `consecutive_failures` to 0 so a borderline-broken receiver gets a fresh window.
- **Session-authed dashboard routes** (parallel to the v1 API-key routes): `GET/POST /api/webhook-endpoints`, `DELETE/PATCH /api/webhook-endpoints/:id`, `GET /api/webhook-endpoints/:id/deliveries`. RLS enforces ownership.
- **Shared event constant**: `lib/webhooks/events.ts → SUPPORTED_EVENTS` is now the single source of truth, used by both `/api/v1/webhooks` and `/api/webhook-endpoints` create handlers. Add a new event here when wiring new emit points.

## Outbound webhooks (Bundle S — migration 022)
- **Why**: customers' servers want to react to GrowthOS events without polling. First two events shipped: `ingest.completed`, `ingest.failed` (fired from `lib/jobs/ingest-queue.ts → runIngestJob`).
- **Tables** (migration 022): `webhook_endpoints` (url, plaintext secret, events[], active, consecutive_failures, project_id nullable for cross-project subscriptions). `webhook_deliveries` (event_payload jsonb, status pending|delivering|success|failed|exhausted, attempts, next_attempt_at for backoff scheduling, response_status/body for debugging).
- **Signing** (`lib/webhooks/sign.ts`): HMAC-SHA256 over `${unix_seconds}.${rawBody}`, sent as `x-growthos-signature: t=<seconds>,v1=<hex>`. Replay window 5 min via `verifySignature({ ..., toleranceSeconds })`. `timingSafeEqual` for the comparison.
- **Dispatcher** (`lib/webhooks/dispatch.ts`): `emitEvent()` fans an event out to every active endpoint subscribed to it (no-throw — webhook plumbing problems can't unwind a successful business write). `deliverWebhook()` claims atomically (conditional UPDATE on id/status/attempts), POSTs with 15s timeout, classifies outcome: 2xx → success (resets `consecutive_failures`); 4xx (except 408/429) → terminal failure; 5xx + 408/429 + network errors → retry with backoff [1m, 5m, 30m, 2h, 6h] up to `MAX_DELIVERY_ATTEMPTS=5`, then `exhausted`.
- **Auto-disable**: endpoint flips `active=false` after `AUTO_DISABLE_THRESHOLD=20` consecutive failures so a broken receiver doesn't burn cron quota indefinitely.
- **Stuck-job recovery**: `recoverStuckDeliveries()` sweeps any `delivering` row whose `updated_at` is older than 5 min back to `pending` (or `exhausted` if MAX hit). Same pattern as `recoverStuckJobs()` in the ingest queue.
- **Cron** `/api/webhooks/dispatch-tick` runs every 1 min via `vercel.json` (short cadence so first attempt after enqueue lands fast). Batch-loads endpoints for the due deliveries to avoid N+1. Defers + skips deliveries whose endpoint was deleted (mark `exhausted`) or disabled (push `next_attempt_at` +1h).
- **v1 CRUD**: `GET/POST /api/v1/webhooks` (list, create), `GET/DELETE /api/v1/webhooks/:id`. Scope `webhooks:write` (added to `lib/api-auth.ts → Scope` and the settings UI mint form). POST returns the plaintext `secret` exactly once — same pattern as the api-keys mint flow.
- **Tests**: `sign.test.ts` (12 tests covering deterministic signing, replay window, malformed/tampered/wrong-secret rejection); `dispatch.test.ts` (12 tests covering 2xx/4xx/5xx/network/exhaustion paths, auto-disable, lost claim, signed headers, backoff schedule).

## Background ingest queue (Bundle R — migration 021)
- **Why**: `POST /api/v1/projects/:id/ingest` ran the crawl + LLM extract synchronously, blocking the API caller for 30-90s. Default behavior is now **async**: enqueue a job, return `202 { status: 'queued', job_id, poll_url }`. Caller polls `GET /api/v1/jobs/:id` for status + result.
- **Backwards-compat**: pass `{ sync: true }` (or `?sync=1`) to keep the synchronous round-trip — useful for first-run integrations.
- **Table** `ingest_jobs` (migration 021): `status (queued|running|completed|failed)`, `attempts`, `error`, `result jsonb`. Partial drain index on `created_at` where `status='queued'`.
- **Queue lib** (`lib/jobs/ingest-queue.ts`): `enqueueIngest()` inserts a queued row; `runIngestJob()` claims via conditional UPDATE on `(id, status, attempts)` (mirrors `dispatchPost` pattern), runs `runIngest`, stamps result. Permanent errors (URL prefix `Failed to fetch site`) → `failed` immediately. Transient errors → requeue if `attempts < MAX_INGEST_ATTEMPTS` (3), else `failed`.
- **Cron** `/api/jobs/ingest-tick` runs every 2 min via `vercel.json`, drains 5 jobs/tick, ordered oldest-first. Auth via `CRON_SECRET`.
- **Budget gating**: `checkBudget` runs at *both* enqueue (instant 402 if already over) and post-claim (so a job queued under-budget but drained after spend climbs bails cleanly without burning the LLM call).
- **Dashboard ingest** (`/api/projects/ingest`) stays synchronous — UI shows a spinner; queue is overkill there.
- **Tests**: `src/lib/jobs/ingest-queue.test.ts` covers happy path, lost claim, permanent fail, transient requeue, exhaustion, and budget-after-claim.

### Migration 015 also fixed pre-existing bugs
- `social_posts.metadata jsonb` was referenced by `/api/launch` but never existed in any prior migration — those `metadata: { launch_run: true }` inserts were failing silently. Added via `add column if not exists`.
- `social_posts.status` check constraint widened to include `publishing | failed | cancelled` (was `draft | scheduled | published | failed`, missing `publishing` and `cancelled`).
- Replaced unconditional `social_posts_scheduled` index with `social_posts_due` partial index keyed on `scheduled_at` where `status='scheduled' AND scheduled_at IS NOT NULL` so the cron's hot path stays small.

## What's NOT Done Yet
- Full 3-legged OAuth handshake for social accounts (v1 uses paste-token flow — user mints token in platform dev console)
- Instagram, TikTok, Reddit publishers (no API publish yet — drafts only)
- Token refresh (long-lived tokens only; once `expires_at` lapses we mark the account errored and require reconnect)
- No `supabase gen types` — untyped clients
- CSV subscriber import UI
- `lib/ai/{benchmarks,compliance,market,seo,tools}/` dirs exist but are mostly empty

## To Run
1. Create Supabase project → copy URL + anon key + service role key to `.env.local`
2. Run all 8 migrations in order: `001_core_schema.sql` through `008_internal_ops.sql`
3. Add OpenRouter API key to `.env.local`
4. Optionally add `ANTHROPIC_API_KEY` for Claude-powered strategic agents (falls back to Gemini)
5. Optionally add `RESEND_API_KEY` and `RESEND_FROM_EMAIL` for email sending
6. `npm run dev`

## Related Projects
- Interview Journey: `/Users/yash/Downloads/interview-journey/` — same stack, patterns copied from here
- Nerdy Ad Engine: `/Users/yash/Downloads/Nerdy/nerdy-ad-engine/` — original Python ad pipeline, ported to TS here
