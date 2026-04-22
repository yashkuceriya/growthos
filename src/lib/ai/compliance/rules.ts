// Per-vertical compliance rules and disclaimers.
// Agents read this to add required language and flag risks.

import type { Vertical } from '@/lib/ai/intelligence/classifier'

export interface ComplianceRule {
  flag: string
  applies_to: Vertical[] | 'all'
  required_disclaimers: string[]
  forbidden_claims: string[]
  required_signals: string[]
  notes: string
}

export const COMPLIANCE_RULES: Record<string, ComplianceRule> = {
  gdpr: {
    flag: 'gdpr',
    applies_to: 'all',
    required_disclaimers: [
      'Cookie consent banner with granular opt-in',
      'Privacy policy link in footer',
      'Data subject request process (access, delete, portability)',
    ],
    forbidden_claims: [],
    required_signals: ['Privacy policy', 'Cookie settings', 'Data processing agreement (if B2B)'],
    notes: 'Required for any EU traffic. Default opt-out consent, not pre-checked.',
  },
  ccpa: {
    flag: 'ccpa',
    applies_to: 'all',
    required_disclaimers: [
      '"Do Not Sell My Personal Information" link in footer',
      'California privacy rights statement',
    ],
    forbidden_claims: [],
    required_signals: ['CCPA opt-out link', 'Privacy policy with CA rights section'],
    notes: 'Required for California residents regardless of where company is based.',
  },
  can_spam: {
    flag: 'can_spam',
    applies_to: 'all',
    required_disclaimers: [
      'Physical mailing address in every email footer',
      'Clear unsubscribe link',
      'Non-deceptive subject lines',
    ],
    forbidden_claims: ['Misleading "FROM" fields', 'Clickbait subjects'],
    required_signals: ['Real company address', 'One-click unsubscribe'],
    notes: 'US commercial email law. Unsubscribe requests honored within 10 business days.',
  },
  ftc: {
    flag: 'ftc',
    applies_to: ['ecommerce', 'creator_info', 'edu', 'b2c_saas'],
    required_disclaimers: [
      '#ad or #sponsored on influencer posts',
      'Typical results disclosure for income/outcome claims',
      'Material connection disclosure for affiliates',
    ],
    forbidden_claims: ['Unsubstantiated results', 'Fake scarcity', 'Hidden subscription terms'],
    required_signals: ['Clear refund policy', 'Billing terms upfront'],
    notes: 'Especially strict on testimonials, earnings claims, health claims.',
  },
  hipaa: {
    flag: 'hipaa',
    applies_to: ['healthcare'],
    required_disclaimers: [
      'Notice of Privacy Practices',
      'HIPAA authorization for sharing PHI',
    ],
    forbidden_claims: ['Sharing any PHI in marketing without explicit auth'],
    required_signals: ['BAA with all vendors touching PHI', 'HIPAA-compliant forms'],
    notes: 'Never include patient data in ads, emails, or case studies without signed authorization.',
  },
  coppa: {
    flag: 'coppa',
    applies_to: ['edu', 'mobile_app', 'b2c_saas'],
    required_disclaimers: [
      'Age gate before collecting data',
      'Parental consent for under 13',
    ],
    forbidden_claims: ['Collecting data from under-13 without consent'],
    required_signals: ['Age verification', 'Parental consent flow', 'Child-safe data handling'],
    notes: 'Critical for any product used by children under 13.',
  },
  sec: {
    flag: 'sec',
    applies_to: ['fintech', 'crypto'],
    required_disclaimers: [
      '"Investments involve risk" boilerplate',
      'Past performance does not guarantee future results',
      'Not financial advice',
      'Risk factors section',
    ],
    forbidden_claims: ['Guaranteed returns', 'Risk-free investment', 'Insider tips'],
    required_signals: ['Licensed advisor (if applicable)', 'Clear fee structure'],
    notes: 'Every performance claim needs a disclaimer. FINRA/SEC compliance required for registered entities.',
  },
  crypto_disclaimer: {
    flag: 'crypto_disclaimer',
    applies_to: ['crypto', 'fintech'],
    required_disclaimers: [
      'Crypto is volatile; you can lose your entire investment',
      'Not FDIC insured',
      'Tax implications vary by jurisdiction',
      'Regulatory status varies by region',
    ],
    forbidden_claims: ['Guaranteed yield', 'Completely safe', 'Government-backed'],
    required_signals: ['Security audit summary', 'Smart contract address links', 'Team or anon disclosure'],
    notes: 'Crypto ads banned on most mainstream networks — focus on Twitter, Reddit, Discord.',
  },
  medical_claims: {
    flag: 'medical_claims',
    applies_to: ['healthcare'],
    required_disclaimers: [
      '"This is not medical advice"',
      '"Consult your physician before starting any treatment"',
      'FDA disclaimer (if wellness/supplement)',
    ],
    forbidden_claims: ['Cures X', 'Prevents Y', 'Treats Z (without FDA approval)'],
    required_signals: ['Clinician review mark', 'Citations to peer-reviewed studies', 'Credentials of practitioners'],
    notes: 'FDA, FTC, and state medical boards all police medical claims.',
  },
}

export function complianceForVertical(vertical: Vertical | undefined | null, extraFlags: string[] = []): ComplianceRule[] {
  const flags = new Set<string>([...extraFlags])
  for (const [key, rule] of Object.entries(COMPLIANCE_RULES)) {
    if (rule.applies_to === 'all' || (vertical && (rule.applies_to as string[]).includes(vertical))) {
      flags.add(key)
    }
  }
  return Array.from(flags).map((f) => COMPLIANCE_RULES[f]).filter(Boolean)
}
