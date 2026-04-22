// Industry benchmarks per vertical. Rough but useful directionally.
// Sources: internal aggregates, public reports (WordStream, HubSpot, Klaviyo, AppAnnie).
import type { Vertical } from '@/lib/ai/intelligence/classifier'

export interface Benchmark {
  vertical: Vertical
  meta_ctr: number // %
  meta_cpc_usd: number
  meta_cpm_usd: number
  google_ctr: number
  google_cpc_usd: number
  email_open_rate: number // %
  email_ctr: number
  trial_to_paid: number // % (SaaS)
  conversion_rate_landing: number // % (generic)
  avg_cac_usd: number
  notes: string
}

export const BENCHMARKS: Partial<Record<Vertical, Benchmark>> = {
  b2b_saas: {
    vertical: 'b2b_saas',
    meta_ctr: 0.9, meta_cpc_usd: 3.2, meta_cpm_usd: 22,
    google_ctr: 3.4, google_cpc_usd: 6.8,
    email_open_rate: 28, email_ctr: 2.5,
    trial_to_paid: 15, conversion_rate_landing: 3.2,
    avg_cac_usd: 700,
    notes: 'High CPC, long cycle. Content-led wins.',
  },
  b2c_saas: {
    vertical: 'b2c_saas',
    meta_ctr: 1.2, meta_cpc_usd: 1.1, meta_cpm_usd: 12,
    google_ctr: 4.0, google_cpc_usd: 2.1,
    email_open_rate: 35, email_ctr: 4.0,
    trial_to_paid: 20, conversion_rate_landing: 4.5,
    avg_cac_usd: 30,
    notes: 'Product Hunt + Reddit + TikTok dominant.',
  },
  ecommerce: {
    vertical: 'ecommerce',
    meta_ctr: 1.6, meta_cpc_usd: 0.7, meta_cpm_usd: 9,
    google_ctr: 2.7, google_cpc_usd: 1.3,
    email_open_rate: 20, email_ctr: 2.0,
    trial_to_paid: 0, conversion_rate_landing: 2.5,
    avg_cac_usd: 45,
    notes: 'ROAS > 2 = healthy. Cart abandonment flow adds 15% revenue.',
  },
  mobile_app: {
    vertical: 'mobile_app',
    meta_ctr: 1.4, meta_cpc_usd: 1.5, meta_cpm_usd: 18,
    google_ctr: 3.0, google_cpc_usd: 2.5,
    email_open_rate: 25, email_ctr: 3.0,
    trial_to_paid: 0, conversion_rate_landing: 3.0,
    avg_cac_usd: 4, // CPI, not CAC — different metric
    notes: 'CPI is primary. D7 retention 20%+ is healthy for most verticals.',
  },
  dev_tool: {
    vertical: 'dev_tool',
    meta_ctr: 0.7, meta_cpc_usd: 2.5, meta_cpm_usd: 15,
    google_ctr: 2.2, google_cpc_usd: 3.8,
    email_open_rate: 32, email_ctr: 3.5,
    trial_to_paid: 12, conversion_rate_landing: 2.8,
    avg_cac_usd: 150,
    notes: 'GitHub stars + HN are the real paid equivalents.',
  },
  creator_info: {
    vertical: 'creator_info',
    meta_ctr: 1.3, meta_cpc_usd: 0.9, meta_cpm_usd: 10,
    google_ctr: 3.5, google_cpc_usd: 1.8,
    email_open_rate: 40, email_ctr: 5.0,
    trial_to_paid: 0, conversion_rate_landing: 5.0,
    avg_cac_usd: 15,
    notes: 'List building > paid. 1-2% list to customer is baseline.',
  },
  local_business: {
    vertical: 'local_business',
    meta_ctr: 1.5, meta_cpc_usd: 1.2, meta_cpm_usd: 14,
    google_ctr: 5.0, google_cpc_usd: 4.5,
    email_open_rate: 30, email_ctr: 3.5,
    trial_to_paid: 0, conversion_rate_landing: 6.0,
    avg_cac_usd: 50,
    notes: 'Google Business Profile views → calls is the primary funnel.',
  },
  services: {
    vertical: 'services',
    meta_ctr: 1.0, meta_cpc_usd: 2.0, meta_cpm_usd: 18,
    google_ctr: 3.0, google_cpc_usd: 5.5,
    email_open_rate: 30, email_ctr: 3.0,
    trial_to_paid: 0, conversion_rate_landing: 3.5,
    avg_cac_usd: 350,
    notes: 'Referrals + LinkedIn content > paid for most services.',
  },
  ai_product: {
    vertical: 'ai_product',
    meta_ctr: 1.1, meta_cpc_usd: 1.8, meta_cpm_usd: 16,
    google_ctr: 3.0, google_cpc_usd: 3.5,
    email_open_rate: 30, email_ctr: 3.5,
    trial_to_paid: 18, conversion_rate_landing: 4.0,
    avg_cac_usd: 40,
    notes: 'Product Hunt + HN + X demos carry launches.',
  },
  fintech: {
    vertical: 'fintech',
    meta_ctr: 0.9, meta_cpc_usd: 2.8, meta_cpm_usd: 20,
    google_ctr: 2.8, google_cpc_usd: 5.5,
    email_open_rate: 25, email_ctr: 2.5,
    trial_to_paid: 10, conversion_rate_landing: 2.0,
    avg_cac_usd: 200,
    notes: 'KYC adds friction — plan for 40-50% drop in signup to funded flow.',
  },
  healthcare: {
    vertical: 'healthcare',
    meta_ctr: 0.8, meta_cpc_usd: 2.5, meta_cpm_usd: 19,
    google_ctr: 3.5, google_cpc_usd: 6.5,
    email_open_rate: 25, email_ctr: 2.0,
    trial_to_paid: 0, conversion_rate_landing: 3.0,
    avg_cac_usd: 180,
    notes: 'SEO authority content is the primary channel.',
  },
  edu: {
    vertical: 'edu',
    meta_ctr: 1.2, meta_cpc_usd: 1.3, meta_cpm_usd: 12,
    google_ctr: 3.8, google_cpc_usd: 2.5,
    email_open_rate: 28, email_ctr: 3.0,
    trial_to_paid: 0, conversion_rate_landing: 4.0,
    avg_cac_usd: 80,
    notes: 'Free webinar → paid course is the standard funnel.',
  },
  nonprofit: {
    vertical: 'nonprofit',
    meta_ctr: 1.6, meta_cpc_usd: 0.8, meta_cpm_usd: 10,
    google_ctr: 4.5, google_cpc_usd: 1.5, // Google Ad Grants
    email_open_rate: 30, email_ctr: 3.0,
    trial_to_paid: 0, conversion_rate_landing: 2.5,
    avg_cac_usd: 25,
    notes: 'Google Ad Grants ($10K/mo) available. Emotion > stats for donor conversion.',
  },
  crypto: {
    vertical: 'crypto',
    meta_ctr: 0, meta_cpc_usd: 0, meta_cpm_usd: 0, // banned/restricted on most mainstream networks
    google_ctr: 0, google_cpc_usd: 0,
    email_open_rate: 20, email_ctr: 2.0,
    trial_to_paid: 0, conversion_rate_landing: 1.5,
    avg_cac_usd: 60,
    notes: 'Paid ads largely restricted. Twitter, Reddit, Discord, KOLs carry growth.',
  },
  marketplace: {
    vertical: 'marketplace',
    meta_ctr: 1.2, meta_cpc_usd: 1.2, meta_cpm_usd: 13,
    google_ctr: 3.0, google_cpc_usd: 2.8,
    email_open_rate: 25, email_ctr: 2.5,
    trial_to_paid: 0, conversion_rate_landing: 3.0,
    avg_cac_usd: 55,
    notes: 'Supply side CAC usually higher than demand; subsidize one side first.',
  },
}

export function getBenchmark(vertical: Vertical | undefined | null): Benchmark | null {
  return (vertical && BENCHMARKS[vertical]) || null
}
