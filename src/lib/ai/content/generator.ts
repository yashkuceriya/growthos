import { generateObject } from 'ai'
import { z } from 'zod'
import { openrouter } from '@/lib/ai/openrouter'

const BlogPostSchema = z.object({
  title: z.string().describe('SEO-optimized blog title, 50-60 chars'),
  meta_description: z.string().describe('Meta description for search, 150-160 chars'),
  body_markdown: z.string().describe('Full blog post in markdown with H2/H3 headings, bullet points, and a conclusion'),
  target_keywords: z.array(z.string()).describe('Primary and secondary keywords used'),
  estimated_word_count: z.number(),
})

export type BlogPost = z.infer<typeof BlogPostSchema>

const MODEL = 'google/gemini-2.0-flash-001'

interface GenerateBlogParams {
  topic: string
  targetKeyword: string
  audience?: string
  tone?: string
  brandVoice?: string
  outline?: string[]
  wordCount?: number
  // Pre-formatted block from marketingMemoryPrompt(memory, 'blog'). Carries
  // brand, blueprint, founder voice, and proven content patterns. Mirrors
  // the social/email generator's styleContext slot.
  styleContext?: string
}

export async function generateBlogPost(params: GenerateBlogParams): Promise<{
  post: BlogPost
  inputTokens: number
  outputTokens: number
}> {
  const systemPrompt = `You are an expert content marketer and SEO writer.

RULES:
- Write in markdown format with clear H2 and H3 headings
- Naturally weave the target keyword into the title, first paragraph, headings, and throughout
- Keep paragraphs short (2-3 sentences) for readability
- Include bullet points and numbered lists where appropriate
- Add a compelling introduction that hooks the reader
- End with a conclusion + CTA
- Target word count: ${params.wordCount || 1000} words
- Write for humans first, search engines second
${params.brandVoice ? `\nBRAND VOICE: ${params.brandVoice}` : ''}${params.styleContext ? `\n\n${params.styleContext}` : ''}`

  const outlineStr = params.outline?.length
    ? `\nOUTLINE:\n${params.outline.map((s, i) => `${i + 1}. ${s}`).join('\n')}`
    : ''

  const userMessage = `Write a blog post.

TARGET KEYWORD: ${params.targetKeyword}
TOPIC: ${params.topic}
${params.audience ? `AUDIENCE: ${params.audience}` : ''}
TONE: ${params.tone || 'informative and engaging'}${outlineStr}`

  const { object, usage } = await generateObject({
    model: openrouter(MODEL),
    schema: BlogPostSchema,
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }],
  })

  return {
    post: object,
    inputTokens: usage?.inputTokens ?? 0,
    outputTokens: usage?.outputTokens ?? 0,
  }
}

/** Rule-based SEO score (0-100) */
export function calculateSeoScore(content: {
  title: string
  body: string
  targetKeyword: string
  metaDescription?: string
}): { score: number; checks: { name: string; passed: boolean; tip: string }[] } {
  const checks: { name: string; passed: boolean; tip: string }[] = []
  const kw = content.targetKeyword.toLowerCase()
  const bodyLower = content.body.toLowerCase()
  const titleLower = content.title.toLowerCase()

  // Title checks
  checks.push({
    name: 'Keyword in title',
    passed: titleLower.includes(kw),
    tip: 'Include your target keyword in the title',
  })
  checks.push({
    name: 'Title length (50-60 chars)',
    passed: content.title.length >= 50 && content.title.length <= 60,
    tip: `Title is ${content.title.length} chars — aim for 50-60`,
  })

  // Meta description
  const metaLen = content.metaDescription?.length ?? 0
  checks.push({
    name: 'Meta description (150-160 chars)',
    passed: metaLen >= 150 && metaLen <= 160,
    tip: `Meta description is ${metaLen} chars — aim for 150-160`,
  })

  // Body checks
  const wordCount = content.body.split(/\s+/).length
  checks.push({
    name: 'Word count (500+)',
    passed: wordCount >= 500,
    tip: `Content is ${wordCount} words — aim for 500+`,
  })

  // Keyword density (1-3%)
  const kwCount = (bodyLower.match(new RegExp(kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length
  const density = (kwCount / wordCount) * 100
  checks.push({
    name: 'Keyword density (1-3%)',
    passed: density >= 1 && density <= 3,
    tip: `Keyword density is ${density.toFixed(1)}% — aim for 1-3%`,
  })

  // Headings
  const hasH2 = /^## /m.test(content.body)
  checks.push({
    name: 'Has H2 headings',
    passed: hasH2,
    tip: 'Use H2 headings to structure your content',
  })

  checks.push({
    name: 'Keyword in first 100 words',
    passed: bodyLower.slice(0, 600).includes(kw),
    tip: 'Include keyword in the opening paragraph',
  })

  // Internal linking hint
  checks.push({
    name: 'Has links',
    passed: content.body.includes('[') && content.body.includes(']('),
    tip: 'Add internal/external links for SEO value',
  })

  const passed = checks.filter((c) => c.passed).length
  const score = Math.round((passed / checks.length) * 100)

  return { score, checks }
}
