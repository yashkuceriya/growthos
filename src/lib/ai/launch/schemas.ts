import { z } from 'zod'

// Each schema maps 1:1 to a channel output, grounded in platform specs.

export const MetaAdSchema = z.object({
  primary_text: z.string().describe('Body copy, 125-2200 chars'),
  headline: z.string().describe('Headline, 27-40 chars'),
  description: z.string().describe('Supporting description, 27 chars'),
  cta_button: z.enum(['Shop Now', 'Sign Up', 'Learn More', 'Get Offer', 'Apply Now', 'Book Now', 'Contact Us', 'Download']),
  image_prompt: z.string().describe('Prompt for image generation, optimized for Meta feed'),
})

export const HookFrameworkEnum = z.enum([
  'stat_shock', 'micro_story', 'direct_callout', 'contrarian', 'before_after', 'question_agitate',
])
export type HookFramework = z.infer<typeof HookFrameworkEnum>

export const MetaAdVariantsSchema = z.object({
  variants: z.array(z.object({
    hook_framework: HookFrameworkEnum,
    primary_text: z.string().describe('Body copy, 125-2200 chars'),
    headline: z.string().describe('Headline, 27-40 chars'),
    description: z.string().describe('Supporting description, 27 chars'),
    cta_button: z.enum(['Shop Now', 'Sign Up', 'Learn More', 'Get Offer', 'Apply Now', 'Book Now', 'Contact Us', 'Download']),
    image_prompt: z.string().describe('Prompt for image generation, optimized for Meta feed'),
  })).length(3).describe('Three distinct variants; each variant MUST use a different hook_framework'),
})

export const LinkedInVariantsSchema = z.object({
  variants: z.array(z.object({
    hook_framework: HookFrameworkEnum,
    text: z.string().describe('Ad body, 150 chars optimal'),
    headline: z.string().describe('70 char headline for text ad'),
    image_prompt: z.string().describe('1200x627 landscape image prompt'),
  })).length(3).describe('Three distinct sponsored variants; each MUST use a different hook_framework'),
  organic_posts: z.array(z.object({
    text: z.string().describe('1300 chars max, stat-driven professional tone'),
    hashtags: z.array(z.string()),
  })).length(2),
})

export const LinkedInAssetsSchema = z.object({
  sponsored_post: z.object({
    text: z.string().describe('Ad body, 150 chars optimal'),
    headline: z.string().describe('70 char headline for text ad'),
    image_prompt: z.string().describe('1200x627 landscape image prompt'),
  }),
  organic_posts: z.array(z.object({
    text: z.string().describe('1300 chars max, stat-driven professional tone'),
    hashtags: z.array(z.string()),
  })).length(2),
})

export const TikTokAssetsSchema = z.object({
  reels: z.array(z.object({
    hook: z.string().describe('First 2 seconds of video, must stop scroll'),
    script: z.string().describe('9-15 second video script with timing cues'),
    caption: z.string().describe('Caption under video, 150 chars'),
    hashtags: z.array(z.string()),
    thumbnail_prompt: z.string().describe('9:16 thumbnail image prompt'),
  })).length(3),
})

export const TwitterThreadSchema = z.object({
  thread: z.array(z.object({
    position: z.number(),
    text: z.string().describe('Single tweet, max 280 chars'),
  })).min(5).max(7),
  standalone_tweets: z.array(z.object({
    text: z.string().describe('Single tweet, max 280 chars'),
    has_image: z.boolean(),
    image_prompt: z.string().optional(),
  })).length(2),
})

export const RedditPostsSchema = z.object({
  posts: z.array(z.object({
    subreddit: z.string().describe('Real subreddit name without r/ prefix'),
    title: z.string().describe('Post title, <100 chars, value/story/question form'),
    body_markdown: z.string().describe('Long-form post body, value-first, product mention at bottom if at all'),
    post_type: z.enum(['story', 'value', 'question', 'show-off']),
  })).length(3),
})

export const EmailSequenceSchema = z.object({
  emails: z.array(z.object({
    position: z.number(),
    delay_hours: z.number(),
    subject: z.string().describe('30-50 chars, personal and specific'),
    preview_text: z.string().describe('35-90 chars, complements subject'),
    body_html: z.string().describe('Simple HTML, one-column, 50-125 words'),
    cta_text: z.string(),
    cta_url: z.string(),
  })).length(3),
})

export const BlogPostSchema = z.object({
  title: z.string().describe('SEO H1, <65 chars, includes target keyword'),
  slug: z.string().describe('URL slug, kebab-case'),
  meta_description: z.string().describe('155 chars, keyword + benefit'),
  target_keywords: z.array(z.string()),
  body_markdown: z.string().describe('1500-2000 word SEO post with H2s'),
})

export const LandingPageSchema = z.object({
  headline: z.string().describe('Hero H1, 8 words max'),
  subheadline: z.string().describe('20 words, expands the promise'),
  body_sections: z.array(z.object({
    type: z.enum(['benefit', 'social_proof', 'faq']),
    heading: z.string(),
    content: z.string(),
  })).min(3).max(5),
  cta_text: z.string().describe('Verb + benefit, 5 words max'),
  form_fields: z.array(z.enum(['email', 'name', 'company'])).min(1).max(3),
})
