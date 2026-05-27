# GrowthOS

Local-first marketing command center built with Next.js 16 App Router, Supabase,
and AI providers. This repository is currently intended for local/private use,
not as a packaged SaaS product.

## Local Setup

Install dependencies, copy the env template, and fill in the Supabase/OpenRouter
values you actually use locally:

```bash
npm install
cp .env.example .env.local
npm run doctor
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser.

## Useful Commands

- `npm run doctor` checks local env/config without making network calls.
- `npm run typecheck` runs TypeScript.
- `npm run lint` runs ESLint.
- `npm test` runs the Vitest unit suite.
- `npm run build` checks the production Next build.
- `npm run smoke` checks live Supabase/API wiring against `NEXT_PUBLIC_APP_URL`.

## Local Robustness Notes

- This app uses Next.js `16.2.3`. Read `node_modules/next/dist/docs/` before
  changing App Router conventions; Next 16 renamed middleware to `proxy.ts`.
- `src/proxy.ts` refreshes Supabase auth cookies before route rendering. If auth
  starts behaving strangely, run `npm run doctor` first.
- Supabase migrations live in `supabase/migrations`. The smoke test can detect
  stale PostgREST schema cache/RPC issues after migrations.
- Optional integrations should fail closed or show an in-app warning; local use
  should not require Resend, social publishing, screenshots, or video providers.

## Robustness Plan

1. Keep `npm run doctor`, `npm run typecheck`, `npm run lint`, and `npm test`
   green before feature work.
2. Convert recurring dashboard warnings into actionable setup checklist items
   instead of hidden console errors.
3. Add Playwright coverage for the core local flows: login, project switch,
   dashboard health, lead capture, campaign launch plan, and API key creation.
4. Generate Supabase TypeScript types from the local database and remove the
   `any`/manual casts around database rows.
5. Make background tick endpoints idempotent and observable from one local
   status page so scheduled work is easy to diagnose.
6. Add small seed/reset scripts for a disposable local Supabase project.

## Verification

Run `npm run verify` for the full local gate. Run `npm run smoke` only when the
dev server and Supabase project are both available.
