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
