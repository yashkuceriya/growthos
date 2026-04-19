import type { AdCopy, ComplianceResult, ComplianceViolation } from './schemas'

// Platform limits (Meta defaults, can be adapted per platform)
const LIMITS = {
  meta: {
    headlineRecommended: 40,
    headlineMax: 255,
    primaryTextPreview: 125,
    primaryTextMax: 2200,
    descriptionRecommended: 30,
    descriptionMax: 255,
  },
  google: {
    headlineRecommended: 30,
    headlineMax: 30,
    primaryTextPreview: 90,
    primaryTextMax: 90,
    descriptionRecommended: 90,
    descriptionMax: 90,
  },
  linkedin: {
    headlineRecommended: 70,
    headlineMax: 200,
    primaryTextPreview: 150,
    primaryTextMax: 600,
    descriptionRecommended: 100,
    descriptionMax: 300,
  },
}

const VALID_CTA_BUTTONS = new Set([
  'Learn More', 'Sign Up', 'Get Started', 'Book Now',
  'Apply Now', 'Contact Us', 'Download', 'Get Offer',
  'Get Quote', 'Subscribe', 'Shop Now', 'Watch More',
  'Send Message', 'Get Directions', 'Call Now',
])

const PROHIBITED_PATTERNS = [
  'guaranteed score', 'guarantee your score', 'guaranteed results',
  '100% guaranteed', 'money back guarantee',
  'last chance ever', 'final opportunity ever',
  'for white', 'for black', 'for asian', 'for hispanic',
  'earn money', 'get rich', 'make money fast',
  'cure', 'diagnose', 'treat disease',
]

const WARNING_PATTERNS: [string, string][] = [
  ['average improvement', 'Consider adding "results may vary" disclaimer'],
  ['score increase', 'Consider specifying this is an average, not guaranteed'],
  ['all students', 'Absolute claims may be flagged - consider "most" or specific %'],
  ['never fail', 'Avoid absolute negative claims'],
  ['best in', 'Superlative claims may need substantiation'],
  ['#1', 'Ranking claims require third-party verification'],
]

export function checkCompliance(
  adCopy: AdCopy,
  platform: 'meta' | 'google' | 'linkedin' | 'tiktok' = 'meta',
): ComplianceResult {
  const violations: ComplianceViolation[] = []
  const limits = LIMITS[platform as keyof typeof LIMITS] ?? LIMITS.meta

  // Character limits
  if (adCopy.headline.length > limits.headlineMax) {
    violations.push({
      severity: 'error',
      field: 'headline',
      rule: 'headline_too_long',
      message: `Headline is ${adCopy.headline.length} chars (max: ${limits.headlineMax})`,
      suggestion: `Shorten to under ${limits.headlineMax} characters`,
    })
  } else if (adCopy.headline.length > limits.headlineRecommended) {
    violations.push({
      severity: 'warning',
      field: 'headline',
      rule: 'headline_over_recommended',
      message: `Headline is ${adCopy.headline.length} chars (recommended: ${limits.headlineRecommended})`,
      suggestion: `Shorter headlines perform better`,
    })
  }

  if (adCopy.primary_text.length > limits.primaryTextMax) {
    violations.push({
      severity: 'error',
      field: 'primary_text',
      rule: 'primary_text_too_long',
      message: `Primary text is ${adCopy.primary_text.length} chars (max: ${limits.primaryTextMax})`,
      suggestion: `Shorten to under ${limits.primaryTextMax} characters`,
    })
  }

  if (adCopy.description.length > limits.descriptionMax) {
    violations.push({
      severity: 'error',
      field: 'description',
      rule: 'description_too_long',
      message: `Description is ${adCopy.description.length} chars (max: ${limits.descriptionMax})`,
      suggestion: `Shorten to under ${limits.descriptionMax} characters`,
    })
  }

  // Empty fields
  if (!adCopy.headline.trim()) {
    violations.push({ severity: 'error', field: 'headline', rule: 'empty_headline', message: 'Headline is empty', suggestion: '' })
  }
  if (!adCopy.primary_text.trim()) {
    violations.push({ severity: 'error', field: 'primary_text', rule: 'empty_primary_text', message: 'Primary text is empty', suggestion: '' })
  }

  // CTA validation
  const cta = adCopy.cta_button.trim()
  if (!cta) {
    violations.push({
      severity: 'error',
      field: 'cta_button',
      rule: 'empty_cta',
      message: 'CTA button text is empty',
      suggestion: 'Use one of: ' + [...VALID_CTA_BUTTONS].sort().join(', '),
    })
  } else if (!VALID_CTA_BUTTONS.has(cta)) {
    const matched = [...VALID_CTA_BUTTONS].find((v) => v.toLowerCase() === cta.toLowerCase())
    if (matched) {
      violations.push({
        severity: 'warning',
        field: 'cta_button',
        rule: 'cta_case_mismatch',
        message: `CTA '${cta}' should be '${matched}'`,
        suggestion: `Use exact text: '${matched}'`,
      })
    } else {
      violations.push({
        severity: 'warning',
        field: 'cta_button',
        rule: 'non_standard_cta',
        message: `CTA '${cta}' is not a standard button option`,
        suggestion: 'Standard options: ' + [...VALID_CTA_BUTTONS].sort().join(', '),
      })
    }
  }

  // Prohibited content
  const fullText = `${adCopy.primary_text} ${adCopy.headline} ${adCopy.description}`.toLowerCase()
  for (const pattern of PROHIBITED_PATTERNS) {
    if (fullText.includes(pattern.toLowerCase())) {
      const field = adCopy.headline.toLowerCase().includes(pattern.toLowerCase())
        ? 'headline'
        : adCopy.description.toLowerCase().includes(pattern.toLowerCase())
          ? 'description'
          : 'primary_text'
      violations.push({
        severity: 'error',
        field,
        rule: 'prohibited_content',
        message: `Contains prohibited phrase: '${pattern}'`,
        suggestion: 'Remove or rephrase to comply with platform ad policies',
      })
    }
  }

  // Warning patterns
  for (const [pattern, suggestion] of WARNING_PATTERNS) {
    if (fullText.includes(pattern.toLowerCase())) {
      const field = adCopy.headline.toLowerCase().includes(pattern.toLowerCase())
        ? 'headline'
        : adCopy.description.toLowerCase().includes(pattern.toLowerCase())
          ? 'description'
          : 'primary_text'
      violations.push({
        severity: 'warning',
        field,
        rule: 'content_warning',
        message: `Contains pattern that may trigger review: '${pattern}'`,
        suggestion,
      })
    }
  }

  // Excessive caps
  for (const [fieldName, text] of [['headline', adCopy.headline], ['primary_text', adCopy.primary_text]] as const) {
    if (text.length > 10) {
      const alphaChars = [...text].filter((c) => /[a-zA-Z]/.test(c))
      if (alphaChars.length > 0) {
        const upperRatio = alphaChars.filter((c) => c === c.toUpperCase()).length / alphaChars.length
        if (upperRatio > 0.5) {
          violations.push({
            severity: 'warning',
            field: fieldName,
            rule: 'excessive_caps',
            message: `${fieldName.replace(/_/g, ' ')} is ${Math.round(upperRatio * 100)}% uppercase`,
            suggestion: 'Use normal sentence case for better engagement',
          })
        }
      }
    }
  }

  // Calculate score
  let score = 10.0
  for (const v of violations) {
    score -= v.severity === 'error' ? 2.0 : 0.5
  }
  score = Math.max(0, Math.round(score * 10) / 10)

  return {
    passes: !violations.some((v) => v.severity === 'error'),
    violations,
    score,
  }
}
