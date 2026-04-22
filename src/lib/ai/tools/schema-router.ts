// JSON-LD schema generator. Picks types per playbook.
import type { Vertical } from '@/lib/ai/intelligence/classifier'
import { getPlaybook } from '@/lib/ai/playbooks/registry'

export interface SchemaInput {
  vertical: Vertical | undefined | null
  name: string
  description: string
  url: string
  logoUrl?: string | null
  brand_voice?: Record<string, unknown>
  // Optional payload per type — caller fills what's relevant
  faqs?: Array<{ q: string; a: string }>
  howTo?: { name: string; steps: Array<{ text: string }>; totalTime?: string }
  product?: { price: string; currency: string; availability: string; reviewCount?: number; rating?: number }
  local?: { street: string; city: string; region: string; postal: string; country: string; phone: string; hours?: string[] }
  article?: { headline: string; datePublished: string; author: string }
  course?: { provider: string; level: string }
}

export function generateJsonLd(input: SchemaInput): Record<string, unknown>[] {
  const pb = getPlaybook(input.vertical)
  const graph: Record<string, unknown>[] = []

  // Organization is always good to include
  graph.push({
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: input.name,
    url: input.url,
    ...(input.logoUrl ? { logo: input.logoUrl } : {}),
  })

  for (const type of pb.schema_types) {
    switch (type) {
      case 'SoftwareApplication':
      case 'MobileApplication':
        graph.push({
          '@context': 'https://schema.org',
          '@type': type,
          name: input.name,
          description: input.description,
          applicationCategory: 'BusinessApplication',
          ...(input.product ? {
            offers: { '@type': 'Offer', price: input.product.price, priceCurrency: input.product.currency },
            ...(input.product.rating ? { aggregateRating: { '@type': 'AggregateRating', ratingValue: input.product.rating, reviewCount: input.product.reviewCount ?? 0 } } : {}),
          } : {}),
        })
        break
      case 'Product':
        graph.push({
          '@context': 'https://schema.org',
          '@type': 'Product',
          name: input.name,
          description: input.description,
          ...(input.product ? {
            offers: {
              '@type': 'Offer',
              price: input.product.price,
              priceCurrency: input.product.currency,
              availability: `https://schema.org/${input.product.availability}`,
            },
            ...(input.product.rating ? { aggregateRating: { '@type': 'AggregateRating', ratingValue: input.product.rating, reviewCount: input.product.reviewCount ?? 0 } } : {}),
          } : {}),
        })
        break
      case 'LocalBusiness':
        if (input.local) {
          graph.push({
            '@context': 'https://schema.org',
            '@type': 'LocalBusiness',
            name: input.name,
            address: {
              '@type': 'PostalAddress',
              streetAddress: input.local.street,
              addressLocality: input.local.city,
              addressRegion: input.local.region,
              postalCode: input.local.postal,
              addressCountry: input.local.country,
            },
            telephone: input.local.phone,
            ...(input.local.hours ? { openingHours: input.local.hours } : {}),
          })
        }
        break
      case 'FAQPage':
        if (input.faqs?.length) {
          graph.push({
            '@context': 'https://schema.org',
            '@type': 'FAQPage',
            mainEntity: input.faqs.map((f) => ({
              '@type': 'Question',
              name: f.q,
              acceptedAnswer: { '@type': 'Answer', text: f.a },
            })),
          })
        }
        break
      case 'HowTo':
        if (input.howTo) {
          graph.push({
            '@context': 'https://schema.org',
            '@type': 'HowTo',
            name: input.howTo.name,
            ...(input.howTo.totalTime ? { totalTime: input.howTo.totalTime } : {}),
            step: input.howTo.steps.map((s, i) => ({ '@type': 'HowToStep', position: i + 1, text: s.text })),
          })
        }
        break
      case 'Article':
      case 'TechArticle':
        if (input.article) {
          graph.push({
            '@context': 'https://schema.org',
            '@type': type,
            headline: input.article.headline,
            datePublished: input.article.datePublished,
            author: { '@type': 'Person', name: input.article.author },
            publisher: { '@type': 'Organization', name: input.name, ...(input.logoUrl ? { logo: { '@type': 'ImageObject', url: input.logoUrl } } : {}) },
          })
        }
        break
      case 'Course':
        if (input.course) {
          graph.push({
            '@context': 'https://schema.org',
            '@type': 'Course',
            name: input.name,
            description: input.description,
            provider: { '@type': 'Organization', name: input.course.provider },
            educationalLevel: input.course.level,
          })
        }
        break
    }
  }

  return graph
}

export function jsonLdScriptTag(graph: Record<string, unknown>[]): string {
  return graph.map((obj) => `<script type="application/ld+json">${JSON.stringify(obj)}</script>`).join('\n')
}
