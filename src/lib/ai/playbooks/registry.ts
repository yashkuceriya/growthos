import type { Vertical } from '@/lib/ai/intelligence/classifier'

export type Channel =
  | 'meta' | 'linkedin' | 'tiktok' | 'twitter' | 'reddit' | 'email' | 'blog' | 'landing'
  | 'google_search' | 'google_shopping' | 'youtube' | 'youtube_shorts' | 'pinterest'
  | 'instagram' | 'product_hunt' | 'hacker_news' | 'indie_hackers' | 'dev_to' | 'github'
  | 'app_store' | 'google_business' | 'yelp' | 'podcast' | 'newsletter_sponsor'
  | 'cold_email' | 'partnership' | 'influencer' | 'quora' | 'community_slack_discord'

export interface Playbook {
  vertical: Vertical
  primary_channels: Channel[] // top 4-6 highest leverage
  secondary_channels: Channel[] // nice-to-have
  skip_channels: Channel[] // actively bad fit
  kpis: { primary: string; secondary: string[] }
  schema_types: string[] // JSON-LD types for SEO
  lifecycle_emails: string[]
  cro_focus: string[]
  compliance_required: string[]
  content_ratios: { educational: number; promotional: number; social_proof: number } // must sum to 1
  launch_tactics: string[]
}

export const PLAYBOOKS: Record<Vertical, Playbook> = {
  b2b_saas: {
    vertical: 'b2b_saas',
    primary_channels: ['linkedin', 'cold_email', 'blog', 'email', 'google_search', 'landing'],
    secondary_channels: ['twitter', 'podcast', 'community_slack_discord', 'partnership'],
    skip_channels: ['tiktok', 'pinterest', 'google_shopping', 'app_store'],
    kpis: { primary: 'MQLs → SQLs → pipeline', secondary: ['CAC payback', 'LTV:CAC', 'gross retention', 'ACV'] },
    schema_types: ['SoftwareApplication', 'FAQPage', 'Article', 'Organization'],
    lifecycle_emails: ['welcome', 'trial_activation', 'feature_education', 'trial_expiry', 'upgrade_nudge', 'renewal', 'winback'],
    cro_focus: ['above_fold_promise', 'case_studies', 'roi_calculator', 'pricing_clarity', 'social_proof_logos'],
    compliance_required: ['gdpr', 'ccpa', 'can_spam'],
    content_ratios: { educational: 0.6, promotional: 0.2, social_proof: 0.2 },
    launch_tactics: ['Product Hunt launch', 'LinkedIn thought leadership posts', 'G2/Capterra reviews sprint', 'cold outbound to ICP'],
  },
  b2c_saas: {
    vertical: 'b2c_saas',
    primary_channels: ['meta', 'tiktok', 'youtube_shorts', 'reddit', 'email', 'blog', 'landing'],
    secondary_channels: ['twitter', 'instagram', 'influencer', 'podcast'],
    skip_channels: ['linkedin', 'google_shopping', 'cold_email'],
    kpis: { primary: 'trial_to_paid', secondary: ['CAC', 'LTV', 'DAU/MAU', 'churn rate'] },
    schema_types: ['SoftwareApplication', 'FAQPage', 'Article'],
    lifecycle_emails: ['welcome', 'aha_moment', 'feature_walkthrough', 'trial_expiry', 'retention_nudge', 'winback', 'referral'],
    cro_focus: ['clear_value_prop', 'free_tier_friction', 'social_proof', 'pricing_anchor'],
    compliance_required: ['gdpr', 'ccpa', 'can_spam'],
    content_ratios: { educational: 0.5, promotional: 0.3, social_proof: 0.2 },
    launch_tactics: ['Product Hunt launch', 'Reddit native posts', 'TikTok demo videos', 'influencer seeding'],
  },
  ecommerce: {
    vertical: 'ecommerce',
    primary_channels: ['meta', 'google_shopping', 'tiktok', 'pinterest', 'email', 'influencer', 'landing'],
    secondary_channels: ['instagram', 'youtube', 'blog', 'google_search'],
    skip_channels: ['linkedin', 'hacker_news', 'product_hunt', 'dev_to'],
    kpis: { primary: 'ROAS', secondary: ['CAC', 'AOV', 'LTV', 'repeat purchase rate', 'cart abandonment'] },
    schema_types: ['Product', 'Review', 'AggregateRating', 'BreadcrumbList', 'Offer'],
    lifecycle_emails: ['welcome_discount', 'abandoned_cart', 'browse_abandon', 'post_purchase', 'winback_90d', 'replenishment', 'review_request'],
    cro_focus: ['product_photography', 'reviews_and_ratings', 'size_guide', 'shipping_returns_clarity', 'trust_badges'],
    compliance_required: ['gdpr', 'ccpa', 'can_spam', 'ftc'],
    content_ratios: { educational: 0.3, promotional: 0.4, social_proof: 0.3 },
    launch_tactics: ['Meta dynamic product ads', 'UGC influencer seeding', 'TikTok Shop integration', 'Pinterest boards per collection'],
  },
  marketplace: {
    vertical: 'marketplace',
    primary_channels: ['meta', 'google_search', 'seo', 'email', 'community_slack_discord'] as unknown as Channel[],
    secondary_channels: ['tiktok', 'reddit', 'partnership'],
    skip_channels: ['google_shopping', 'app_store'],
    kpis: { primary: 'two_sided_activation', secondary: ['supply liquidity', 'GMV', 'take rate', 'match rate'] },
    schema_types: ['Organization', 'FAQPage', 'Review'],
    lifecycle_emails: ['welcome_per_side', 'first_match', 'transaction_confirm', 'review_request', 'reactivation'],
    cro_focus: ['supply_social_proof', 'demand_liquidity_display', 'trust_safety_signals'],
    compliance_required: ['gdpr', 'ccpa', 'can_spam'],
    content_ratios: { educational: 0.5, promotional: 0.2, social_proof: 0.3 },
    launch_tactics: ['Seed one side first', 'Fake door test demand', 'Concierge match service'],
  },
  mobile_app: {
    vertical: 'mobile_app',
    primary_channels: ['app_store', 'meta', 'tiktok', 'youtube_shorts', 'email', 'influencer'],
    secondary_channels: ['reddit', 'twitter', 'product_hunt'],
    skip_channels: ['linkedin', 'cold_email', 'google_shopping'],
    kpis: { primary: 'CPI + D1/D7/D30 retention', secondary: ['LTV', 'store ranking', 'review velocity', 'DAU'] },
    schema_types: ['MobileApplication', 'SoftwareApplication', 'AggregateRating'],
    lifecycle_emails: ['welcome_install', 'onboarding_complete', 'activation_nudge', 'retention_win', 'churn_save'],
    cro_focus: ['app_store_screenshots', 'preview_video', 'keyword_title', 'review_velocity'],
    compliance_required: ['gdpr', 'ccpa', 'coppa'],
    content_ratios: { educational: 0.4, promotional: 0.3, social_proof: 0.3 },
    launch_tactics: ['ASO overhaul', 'Apple Search Ads', 'Meta app install campaigns', 'TikTok Spark Ads'],
  },
  dev_tool: {
    vertical: 'dev_tool',
    primary_channels: ['github', 'hacker_news', 'dev_to', 'twitter', 'product_hunt', 'blog'],
    secondary_channels: ['youtube', 'podcast', 'community_slack_discord', 'reddit'],
    skip_channels: ['tiktok', 'pinterest', 'google_shopping', 'meta', 'instagram'],
    kpis: { primary: 'installs + active developers', secondary: ['GitHub stars', 'PRs', 'Discord members', 'API calls'] },
    schema_types: ['SoftwareSourceCode', 'TechArticle', 'HowTo', 'SoftwareApplication'],
    lifecycle_emails: ['install_welcome', 'first_success', 'advanced_features', 'community_invite'],
    cro_focus: ['readme_quality', 'install_snippet_copy', 'docs_search', 'quickstart_speed'],
    compliance_required: ['gdpr', 'ccpa'],
    content_ratios: { educational: 0.7, promotional: 0.1, social_proof: 0.2 },
    launch_tactics: ['Show HN', 'GitHub trending', 'dev.to deep dives', 'Twitter dev community'],
  },
  creator_info: {
    vertical: 'creator_info',
    primary_channels: ['newsletter_sponsor', 'twitter', 'youtube', 'linkedin', 'podcast', 'email', 'landing'],
    secondary_channels: ['tiktok', 'instagram', 'partnership'],
    skip_channels: ['google_shopping', 'app_store', 'google_business'],
    kpis: { primary: 'list_size + open rate', secondary: ['LTV', 'conversion rate', 'course completion', 'paid community growth'] },
    schema_types: ['Article', 'Course', 'Person', 'Book'],
    lifecycle_emails: ['welcome_lead_magnet', 'nurture_series', 'pre_launch', 'launch_cart', 'cart_close', 'student_onboarding'],
    cro_focus: ['personal_brand_authority', 'testimonials_video', 'money_back_guarantee', 'scarcity_urgency'],
    compliance_required: ['can_spam', 'ftc', 'gdpr'],
    content_ratios: { educational: 0.7, promotional: 0.15, social_proof: 0.15 },
    launch_tactics: ['Email list warmup', 'JV partner launch', 'Twitter thread series', 'Podcast tour'],
  },
  local_business: {
    vertical: 'local_business',
    primary_channels: ['google_business', 'google_search', 'yelp', 'meta', 'email', 'landing'],
    secondary_channels: ['instagram', 'community_slack_discord', 'partnership'],
    skip_channels: ['hacker_news', 'product_hunt', 'dev_to', 'github', 'linkedin', 'app_store'],
    kpis: { primary: 'calls + booked jobs', secondary: ['cost per lead', '5-star review %', 'local pack ranking'] },
    schema_types: ['LocalBusiness', 'Service', 'Review', 'AggregateRating', 'OpeningHoursSpecification'],
    lifecycle_emails: ['booking_confirm', 'appointment_reminder', 'post_visit_review_request', 'reactivation'],
    cro_focus: ['click_to_call', 'booking_widget', 'local_reviews', 'service_area_clarity', 'before_after_photos'],
    compliance_required: ['can_spam', 'ccpa'],
    content_ratios: { educational: 0.4, promotional: 0.3, social_proof: 0.3 },
    launch_tactics: ['Google Business Profile optimization', 'Review acquisition sprint', 'Local Services Ads', 'Neighborhood social groups'],
  },
  services: {
    vertical: 'services',
    primary_channels: ['linkedin', 'cold_email', 'partnership', 'blog', 'email', 'landing'],
    secondary_channels: ['twitter', 'podcast', 'community_slack_discord'],
    skip_channels: ['tiktok', 'pinterest', 'google_shopping', 'app_store'],
    kpis: { primary: 'qualified leads → proposals', secondary: ['win rate', 'average deal size', 'retainer count'] },
    schema_types: ['Service', 'Organization', 'Review', 'FAQPage'],
    lifecycle_emails: ['welcome_intro_call', 'discovery_nurture', 'proposal_follow', 'client_onboarding', 'case_study_share'],
    cro_focus: ['case_studies', 'team_bios', 'process_clarity', 'pricing_transparency', 'booking_widget'],
    compliance_required: ['gdpr', 'can_spam'],
    content_ratios: { educational: 0.6, promotional: 0.15, social_proof: 0.25 },
    launch_tactics: ['LinkedIn outbound', 'Case study publishing', 'Partner referral program', 'Speaking engagements'],
  },
  ai_product: {
    vertical: 'ai_product',
    primary_channels: ['product_hunt', 'hacker_news', 'twitter', 'reddit', 'blog', 'dev_to', 'landing'],
    secondary_channels: ['youtube', 'linkedin', 'podcast', 'community_slack_discord'],
    skip_channels: ['pinterest', 'google_shopping', 'yelp', 'google_business'],
    kpis: { primary: 'signups + daily active', secondary: ['API usage', 'retention', 'trial_to_paid'] },
    schema_types: ['SoftwareApplication', 'FAQPage', 'TechArticle'],
    lifecycle_emails: ['welcome', 'first_prompt', 'use_case_inspiration', 'upgrade_nudge'],
    cro_focus: ['live_demo_above_fold', 'safety_transparency', 'model_explainability', 'use_case_gallery'],
    compliance_required: ['gdpr', 'ccpa', 'can_spam'],
    content_ratios: { educational: 0.6, promotional: 0.2, social_proof: 0.2 },
    launch_tactics: ['PH #1 launch', 'Show HN demo', 'Twitter demo videos', 'Reddit r/ChatGPT native posts'],
  },
  healthcare: {
    vertical: 'healthcare',
    primary_channels: ['google_search', 'blog', 'email', 'linkedin', 'landing'],
    secondary_channels: ['youtube', 'podcast', 'partnership'],
    skip_channels: ['tiktok', 'meta', 'reddit', 'crypto_disclaimer' as unknown as Channel],
    kpis: { primary: 'qualified leads + bookings', secondary: ['CAC', 'patient retention', 'referral rate'] },
    schema_types: ['MedicalOrganization', 'Physician', 'MedicalWebPage', 'FAQPage'],
    lifecycle_emails: ['welcome', 'appointment_confirm', 'care_plan', 'follow_up'],
    cro_focus: ['credentials_display', 'patient_testimonials_compliant', 'clear_disclaimers', 'booking_flow'],
    compliance_required: ['hipaa', 'medical_claims', 'gdpr', 'ccpa'],
    content_ratios: { educational: 0.8, promotional: 0.1, social_proof: 0.1 },
    launch_tactics: ['SEO authority building', 'Clinician LinkedIn thought leadership', 'Referral partnerships'],
  },
  fintech: {
    vertical: 'fintech',
    primary_channels: ['google_search', 'youtube', 'blog', 'email', 'twitter', 'reddit', 'landing'],
    secondary_channels: ['linkedin', 'podcast', 'partnership'],
    skip_channels: ['tiktok', 'pinterest'],
    kpis: { primary: 'funded accounts', secondary: ['CAC', 'LTV', 'AUM', 'retention'] },
    schema_types: ['FinancialProduct', 'Organization', 'FAQPage'],
    lifecycle_emails: ['welcome', 'kyc_nudge', 'first_deposit', 'feature_education', 'retention', 'winback'],
    cro_focus: ['security_badges', 'regulatory_trust_signals', 'clear_fee_disclosure', 'calculator_widgets'],
    compliance_required: ['sec', 'gdpr', 'ccpa', 'can_spam'],
    content_ratios: { educational: 0.7, promotional: 0.15, social_proof: 0.15 },
    launch_tactics: ['SEO education content', 'Reddit r/personalfinance native posts', 'Finance YouTubers outreach'],
  },
  edu: {
    vertical: 'edu',
    primary_channels: ['meta', 'tiktok', 'youtube', 'blog', 'email', 'landing', 'influencer'],
    secondary_channels: ['instagram', 'reddit', 'podcast'],
    skip_channels: ['hacker_news', 'dev_to', 'google_shopping'],
    kpis: { primary: 'enrollments', secondary: ['completion rate', 'NPS', 'referral rate'] },
    schema_types: ['Course', 'EducationalOrganization', 'Review'],
    lifecycle_emails: ['welcome_free_content', 'nurture', 'enrollment_close', 'student_onboarding', 'progress_check', 'completion_reward'],
    cro_focus: ['outcomes_proof', 'curriculum_clarity', 'instructor_authority', 'money_back_guarantee'],
    compliance_required: ['gdpr', 'ccpa', 'can_spam', 'coppa'],
    content_ratios: { educational: 0.7, promotional: 0.15, social_proof: 0.15 },
    launch_tactics: ['Free webinar → paid course', 'Student outcome stories', 'Partnerships with influencers in field'],
  },
  nonprofit: {
    vertical: 'nonprofit',
    primary_channels: ['meta', 'email', 'blog', 'google_search', 'landing', 'partnership'],
    secondary_channels: ['instagram', 'tiktok', 'twitter', 'youtube'],
    skip_channels: ['google_shopping', 'hacker_news', 'dev_to'],
    kpis: { primary: 'donations', secondary: ['recurring donors', 'avg gift size', 'volunteer signups'] },
    schema_types: ['NGO', 'Organization', 'Event'],
    lifecycle_emails: ['welcome_supporter', 'impact_story', 'monthly_update', 'giving_tuesday', 'year_end_appeal'],
    cro_focus: ['impact_stats', 'beneficiary_stories', 'donation_form_simplicity', 'recurring_gift_default'],
    compliance_required: ['gdpr', 'ccpa', 'can_spam'],
    content_ratios: { educational: 0.3, promotional: 0.2, social_proof: 0.5 },
    launch_tactics: ['Giving Tuesday campaign', 'Corporate partnerships', 'Volunteer ambassador program'],
  },
  crypto: {
    vertical: 'crypto',
    primary_channels: ['twitter', 'reddit', 'blog', 'youtube', 'community_slack_discord', 'landing'],
    secondary_channels: ['podcast', 'partnership', 'influencer'],
    skip_channels: ['meta', 'google_shopping', 'google_search'], // many ad networks restrict crypto
    kpis: { primary: 'wallet connects + active holders', secondary: ['TVL', 'trading volume', 'token holders'] },
    schema_types: ['Organization', 'FAQPage', 'Article'],
    lifecycle_emails: ['welcome_safety', 'how_to_use', 'security_reminder', 'protocol_updates'],
    cro_focus: ['security_audits_display', 'transparent_tokenomics', 'team_doxxing_or_anon_note', 'risk_disclaimers'],
    compliance_required: ['crypto_disclaimer', 'sec', 'gdpr'],
    content_ratios: { educational: 0.7, promotional: 0.1, social_proof: 0.2 },
    launch_tactics: ['Crypto Twitter (CT) engagement', 'Discord community build', 'Influencer/KOL outreach', 'AMAs on Reddit'],
  },
  other: {
    vertical: 'other',
    primary_channels: ['blog', 'email', 'twitter', 'meta', 'landing'],
    secondary_channels: ['linkedin', 'youtube', 'reddit'],
    skip_channels: [],
    kpis: { primary: 'signups', secondary: ['CAC', 'LTV', 'retention'] },
    schema_types: ['Organization', 'FAQPage'],
    lifecycle_emails: ['welcome', 'nurture', 'activation', 'reengagement'],
    cro_focus: ['clear_value_prop', 'social_proof', 'low_friction_signup'],
    compliance_required: ['gdpr', 'ccpa', 'can_spam'],
    content_ratios: { educational: 0.5, promotional: 0.25, social_proof: 0.25 },
    launch_tactics: ['Product Hunt launch', 'SEO blog', 'Email list building'],
  },
}

export function getPlaybook(vertical: Vertical | undefined | null): Playbook {
  return PLAYBOOKS[vertical ?? 'other'] ?? PLAYBOOKS.other
}

export function channelsForProject(vertical: Vertical | undefined | null): Channel[] {
  const pb = getPlaybook(vertical)
  return [...pb.primary_channels, ...pb.secondary_channels]
}

export function shouldRunChannel(vertical: Vertical | undefined | null, channel: Channel): 'primary' | 'secondary' | 'skip' {
  const pb = getPlaybook(vertical)
  if (pb.primary_channels.includes(channel)) return 'primary'
  if (pb.secondary_channels.includes(channel)) return 'secondary'
  return 'skip'
}
