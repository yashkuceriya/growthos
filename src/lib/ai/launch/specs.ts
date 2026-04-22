// Platform-native specs — drawn from official docs (Nov 2025).
// These constraints drive prompts so generated assets are deployable as-is.

export interface PlatformSpec {
  key: string
  name: string
  constraints: string
  deploy_hint: string
  native_url?: string
}

export const PLATFORM_SPECS: Record<string, PlatformSpec> = {
  meta: {
    key: 'meta',
    name: 'Meta (Facebook + Instagram)',
    constraints: `
- Primary text: 125 chars optimal, 2,200 max
- Headline: 27 chars optimal, 40 max
- Description: 27 chars
- CTA: must be one of: Shop Now, Sign Up, Learn More, Get Offer, Apply Now, Book Now, Contact Us, Download
- Image: 1:1 (1080x1080), 9:16 story (1080x1920), 1.91:1 feed (1200x628)
- Max 20% text overlay on images (recommended, no longer enforced)
- Best practice: lead with specific transformation, not feature list`,
    deploy_hint: 'Paste into Meta Ads Manager → Create Campaign → Upload each aspect ratio to its placement',
    native_url: 'https://adsmanager.facebook.com/adsmanager/creation',
  },
  linkedin: {
    key: 'linkedin',
    name: 'LinkedIn',
    constraints: `
- Sponsored post: 150 chars optimal, 3,000 max
- Organic post: 1,300 chars optimal, 3,000 max
- Headline: 70 chars for text ads, 150 chars for sponsored content
- Image: 1200x627 landscape or 1080x1080 square
- Tone: authoritative, stat-driven, professional
- Best practice: open with a stat or contrarian take, no emojis in first line, hashtags at end`,
    deploy_hint: 'LinkedIn Campaign Manager for ads / paste organic directly to feed',
    native_url: 'https://www.linkedin.com/campaignmanager/',
  },
  tiktok: {
    key: 'tiktok',
    name: 'TikTok',
    constraints: `
- Video: 9:16 vertical, 9-15 sec optimal, 60 sec max for feed
- Caption: 150 chars optimal, 2,200 max
- Hook: first 2 seconds must stop the scroll
- Format: pattern interrupt + payoff, native creator energy, never corporate
- Best practice: hand-held feel, captions baked in, trending sound awareness
- Output: script + thumbnail 9:16 + hook list`,
    deploy_hint: 'TikTok Ads Manager or record organic from script',
    native_url: 'https://ads.tiktok.com/',
  },
  twitter: {
    key: 'twitter',
    name: 'Twitter / X',
    constraints: `
- Single post: 280 chars (500 for Premium but assume 280)
- Thread: 5-7 tweets optimal
- First tweet = hook, must work standalone
- No generic emojis; use specific numbers and claims
- Thread pattern: hook → problem → solution (3-4 beats) → CTA tweet
- Best practice: short lines, break thoughts across posts, end with "RT if helpful"`,
    deploy_hint: 'Paste thread into X composer, post one after the other as replies',
    native_url: 'https://twitter.com/compose/tweet',
  },
  reddit: {
    key: 'reddit',
    name: 'Reddit',
    constraints: `
- Title: 300 chars max, but <100 performs best
- Body: markdown supported, 40,000 char max
- MUST BE value-first, story-driven, or question-form. Never promotional.
- Disclose tool creation if relevant ("I built this...")
- Pick real subreddits where audience lives
- No hashtags, no emojis in title, genuine voice
- Best practice: long-form personal story or technical deep-dive, product mention only at bottom`,
    deploy_hint: 'Post to each subreddit manually — spacing out posts across 2-3 days',
    native_url: 'https://www.reddit.com/submit',
  },
  email: {
    key: 'email',
    name: 'Email',
    constraints: `
- Subject line: 30-50 chars, personal/specific, no clickbait
- Preview text: 35-90 chars, complements subject
- Body: 50-125 words per email for welcome sequence
- HTML: simple, one-column, minimal styling
- CTA: single button, verb-led
- Best practice: write like a friend, not a brand. Plain-text feel over heavy HTML`,
    deploy_hint: 'Send from Resend or paste into existing ESP',
    native_url: 'https://resend.com/emails',
  },
  blog: {
    key: 'blog',
    name: 'Blog / SEO',
    constraints: `
- Length: 1,500-2,000 words for SEO
- H1: include target keyword, <65 chars
- H2 sections: 4-6, include LSI keywords
- Intro: 100 words, hook + promise + keyword
- Structure: Problem → Why it matters → Concrete solution → Examples → CTA
- Meta description: 155 chars, keyword + benefit
- Target keyword density: 1-2%`,
    deploy_hint: 'Publish to your blog CMS or paste into ghost/webflow',
  },
  landing: {
    key: 'landing',
    name: 'Landing Page',
    constraints: `
- Hero headline: 8 words max, clear outcome
- Subheadline: 20 words, expands the promise
- Above-fold CTA: verb + benefit (e.g. "Track my first application free")
- Body: 3 benefit blocks, 1 social proof block, 1 FAQ
- Single conversion goal (email signup)
- Mobile-first, form <4 fields`,
    deploy_hint: 'Auto-published to /p/[slug] on GrowthOS',
  },
}

export const SUBREDDIT_MAP: Record<string, string[]> = {
  // Map common audiences to real subreddits. Extendable.
  'job-search': ['cscareerquestions', 'csMajors', 'ITCareerQuestions', 'jobs', 'recruitinghell'],
  'saas': ['SaaS', 'Entrepreneur', 'startups', 'SideProject'],
  'productivity': ['productivity', 'PKMS', 'NotionSo', 'getdisciplined'],
  'finance': ['personalfinance', 'Frugal', 'povertyfinance', 'financialindependence'],
  'marketing': ['marketing', 'digital_marketing', 'Entrepreneur', 'bigseo'],
  'default': ['SideProject', 'Entrepreneur', 'startups'],
}

export function pickSubreddits(audience: string, productDesc: string): string[] {
  const text = (audience + ' ' + productDesc).toLowerCase()
  if (text.match(/job|career|interview|resume|apply|hire/)) return SUBREDDIT_MAP['job-search']
  if (text.match(/saas|startup|founder|b2b/)) return SUBREDDIT_MAP['saas']
  if (text.match(/notion|pkm|productiv|todo|second brain/)) return SUBREDDIT_MAP['productivity']
  if (text.match(/subscrip|budget|money|spend|cancel|finance/)) return SUBREDDIT_MAP['finance']
  if (text.match(/market|growth|ads|ceo|cmo/)) return SUBREDDIT_MAP['marketing']
  return SUBREDDIT_MAP['default']
}
