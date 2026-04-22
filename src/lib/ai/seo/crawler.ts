// Lightweight site crawler — fetches pages, extracts SEO signals, surfaces issues.
// Zero external deps beyond fetch; runs inside Next's server runtime.

export interface PageCrawl {
  url: string
  status: number
  load_time_ms: number
  redirect_chain: string[]
  title: string | null
  title_length: number
  meta_description: string | null
  meta_description_length: number
  canonical: string | null
  robots_meta: string | null
  h1_count: number
  h1_text: string[]
  h2_count: number
  h3_count: number
  word_count: number
  images_total: number
  images_missing_alt: number
  links_internal: number
  links_external: number
  links_broken_candidates: string[] // links that 404'd when probed
  has_og_title: boolean
  has_og_description: boolean
  has_og_image: boolean
  has_twitter_card: boolean
  has_jsonld: boolean
  jsonld_types: string[]
  has_viewport: boolean
  has_charset: boolean
  has_favicon: boolean
  has_sitemap_ref: boolean
  has_html_lang: boolean
  mixed_content_candidates: number // http:// resources on https page
  noindex: boolean
  nofollow: boolean
  // Text extracts
  first_paragraph: string | null
  is_https: boolean
  // HTML sample for downstream LLM analysis (truncated)
  html_sample: string
}

export interface SiteAudit {
  base_url: string
  pages_crawled: number
  started_at: string
  finished_at: string
  pages: PageCrawl[]
  issues: Array<{ severity: 'critical' | 'warn' | 'info'; category: string; url: string; finding: string; fix: string }>
  summary: {
    avg_load_ms: number
    pages_missing_title: number
    pages_missing_meta_description: number
    pages_missing_h1: number
    pages_multiple_h1: number
    pages_thin_content: number // under 300 words
    pages_missing_canonical: number
    pages_noindex: number
    pages_broken_incoming_links: number
    total_images_missing_alt: number
    pages_missing_schema: number
    pages_missing_og: number
    https_issues: number
  }
}

function extract(html: string, regex: RegExp, flags: 'first' | 'all' = 'first'): string[] {
  if (flags === 'all') {
    return [...html.matchAll(regex)].map((m) => m[1])
  }
  const m = html.match(regex)
  return m ? [m[1]] : []
}

function stripTags(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

async function fetchPage(url: string, baseUrl: string): Promise<PageCrawl | null> {
  const redirects: string[] = []
  const started = Date.now()
  try {
    let currentUrl = url
    let response: Response | null = null
    for (let i = 0; i < 5; i++) {
      response = await fetch(currentUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 GrowthOS-SEO-Bot/1.0' },
        redirect: 'manual',
      })
      if (response.status >= 300 && response.status < 400) {
        const loc = response.headers.get('location')
        if (!loc) break
        redirects.push(currentUrl)
        currentUrl = new URL(loc, currentUrl).toString()
      } else {
        break
      }
    }
    if (!response) return null

    const html = response.status === 200 ? await response.text() : ''
    const loadTime = Date.now() - started

    const title = extract(html, /<title[^>]*>([\s\S]*?)<\/title>/i)[0]?.trim() ?? null
    const metaDesc = extract(html, /<meta[^>]*name=["']description["'][^>]*content=["']([^"']*)["']/i)[0]?.trim() ?? null
    const canonical = extract(html, /<link[^>]*rel=["']canonical["'][^>]*href=["']([^"']*)["']/i)[0]?.trim() ?? null
    const robotsMeta = extract(html, /<meta[^>]*name=["']robots["'][^>]*content=["']([^"']*)["']/i)[0]?.trim() ?? null
    const h1s = extract(html, /<h1[^>]*>([\s\S]*?)<\/h1>/gi, 'all').map((t) => stripTags(t))
    const h2s = extract(html, /<h2[^>]*>([\s\S]*?)<\/h2>/gi, 'all')
    const h3s = extract(html, /<h3[^>]*>([\s\S]*?)<\/h3>/gi, 'all')
    const bodyText = stripTags(html)
    const wordCount = bodyText.split(/\s+/).filter(Boolean).length

    const allImages = [...html.matchAll(/<img[^>]+>/gi)].map((m) => m[0])
    const imagesMissingAlt = allImages.filter((tag) => !/alt=/i.test(tag) || /alt=["']\s*["']/i.test(tag)).length

    const allAnchors = [...html.matchAll(/<a[^>]+href=["']([^"']+)["']/gi)].map((m) => m[1])
    const baseHost = new URL(baseUrl).host
    let internal = 0, external = 0
    for (const href of allAnchors) {
      try {
        const resolved = new URL(href, currentUrl)
        if (resolved.host === baseHost) internal++
        else if (/^https?:/.test(resolved.protocol)) external++
      } catch { /* ignore */ }
    }

    const jsonldMatches = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1])
    const jsonldTypes: string[] = []
    for (const block of jsonldMatches) {
      try {
        const parsed = JSON.parse(block)
        const pickType = (obj: unknown): string[] => {
          if (!obj || typeof obj !== 'object') return []
          const rec = obj as Record<string, unknown>
          const t = rec['@type']
          if (typeof t === 'string') return [t]
          if (Array.isArray(t)) return t.filter((x): x is string => typeof x === 'string')
          return []
        }
        if (Array.isArray(parsed)) parsed.forEach((p) => jsonldTypes.push(...pickType(p)))
        else jsonldTypes.push(...pickType(parsed))
      } catch { /* ignore malformed */ }
    }

    const firstP = extract(html, /<p[^>]*>([\s\S]*?)<\/p>/i)[0]
    const firstParagraph = firstP ? stripTags(firstP).slice(0, 300) : null

    return {
      url: currentUrl,
      status: response.status,
      load_time_ms: loadTime,
      redirect_chain: redirects,
      title,
      title_length: title?.length ?? 0,
      meta_description: metaDesc,
      meta_description_length: metaDesc?.length ?? 0,
      canonical,
      robots_meta: robotsMeta,
      h1_count: h1s.length,
      h1_text: h1s.slice(0, 3),
      h2_count: h2s.length,
      h3_count: h3s.length,
      word_count: wordCount,
      images_total: allImages.length,
      images_missing_alt: imagesMissingAlt,
      links_internal: internal,
      links_external: external,
      links_broken_candidates: [],
      has_og_title: /<meta[^>]*property=["']og:title["']/i.test(html),
      has_og_description: /<meta[^>]*property=["']og:description["']/i.test(html),
      has_og_image: /<meta[^>]*property=["']og:image["']/i.test(html),
      has_twitter_card: /<meta[^>]*name=["']twitter:card["']/i.test(html),
      has_jsonld: jsonldMatches.length > 0,
      jsonld_types: jsonldTypes,
      has_viewport: /<meta[^>]*name=["']viewport["']/i.test(html),
      has_charset: /<meta[^>]*charset=/i.test(html),
      has_favicon: /<link[^>]*rel=["'][^"']*icon[^"']*["']/i.test(html),
      has_sitemap_ref: false,
      has_html_lang: /<html[^>]*lang=/i.test(html),
      mixed_content_candidates: (html.match(/src=["']http:\/\//gi) ?? []).length,
      noindex: /noindex/i.test(robotsMeta ?? ''),
      nofollow: /nofollow/i.test(robotsMeta ?? ''),
      first_paragraph: firstParagraph,
      is_https: currentUrl.startsWith('https://'),
      html_sample: html.slice(0, 15_000),
    }
  } catch (err) {
    console.error('crawl failed', url, err)
    return null
  }
}

async function discoverPages(baseUrl: string, max: number): Promise<string[]> {
  const discovered = new Set<string>([baseUrl])
  const host = new URL(baseUrl).host

  // Try /sitemap.xml
  try {
    const r = await fetch(new URL('/sitemap.xml', baseUrl).toString(), { headers: { 'User-Agent': 'GrowthOS-SEO-Bot/1.0' } })
    if (r.ok) {
      const xml = await r.text()
      const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/gi)].map((m) => m[1]).filter((u) => u.includes(host))
      urls.slice(0, max).forEach((u) => discovered.add(u))
    }
  } catch { /* ignore */ }

  // Supplement via homepage link extraction
  if (discovered.size < max) {
    try {
      const r = await fetch(baseUrl, { headers: { 'User-Agent': 'GrowthOS-SEO-Bot/1.0' } })
      if (r.ok) {
        const html = await r.text()
        const hrefs = [...html.matchAll(/<a[^>]+href=["']([^"']+)["']/gi)].map((m) => m[1])
        for (const h of hrefs) {
          try {
            const u = new URL(h, baseUrl).toString().split('#')[0]
            if (new URL(u).host === host) discovered.add(u)
          } catch { /* ignore */ }
          if (discovered.size >= max) break
        }
      }
    } catch { /* ignore */ }
  }

  return Array.from(discovered).slice(0, max)
}

export async function crawlSite(baseUrl: string, options: { maxPages: number } = { maxPages: 10 }): Promise<SiteAudit> {
  const startedAt = new Date().toISOString()
  const urls = await discoverPages(baseUrl, options.maxPages)
  const results = await Promise.all(urls.map((u) => fetchPage(u, baseUrl)))
  const pages = results.filter((p): p is PageCrawl => p !== null)
  const finishedAt = new Date().toISOString()

  // Compute summary + issues
  const issues: SiteAudit['issues'] = []
  for (const p of pages) {
    if (!p.title) issues.push({ severity: 'critical', category: 'meta', url: p.url, finding: 'Missing <title>', fix: 'Add a unique <title> 50-60 chars including the primary keyword.' })
    else if (p.title_length > 70) issues.push({ severity: 'warn', category: 'meta', url: p.url, finding: `Title ${p.title_length} chars (>70, may truncate in SERP)`, fix: 'Shorten to 50-60 chars.' })
    if (!p.meta_description) issues.push({ severity: 'warn', category: 'meta', url: p.url, finding: 'Missing meta description', fix: 'Add 140-160 char meta description with keyword + benefit.' })
    else if (p.meta_description_length > 165) issues.push({ severity: 'info', category: 'meta', url: p.url, finding: `Meta description ${p.meta_description_length} chars`, fix: 'Keep 140-160 for best SERP display.' })
    if (p.h1_count === 0) issues.push({ severity: 'critical', category: 'headings', url: p.url, finding: 'No H1', fix: 'Add a single H1 that includes the primary keyword.' })
    if (p.h1_count > 1) issues.push({ severity: 'warn', category: 'headings', url: p.url, finding: `${p.h1_count} H1 tags`, fix: 'Use exactly one H1 per page.' })
    if (p.word_count < 300 && p.status === 200) issues.push({ severity: 'warn', category: 'content', url: p.url, finding: `Thin content: ${p.word_count} words`, fix: 'Expand to at least 300-500 words with substantive depth.' })
    if (!p.canonical) issues.push({ severity: 'info', category: 'indexing', url: p.url, finding: 'No canonical tag', fix: 'Add self-referencing canonical or point to preferred URL.' })
    if (p.noindex) issues.push({ severity: 'critical', category: 'indexing', url: p.url, finding: 'noindex — page excluded from search', fix: 'Remove noindex if page should rank.' })
    if (p.images_missing_alt > 0) issues.push({ severity: 'warn', category: 'images', url: p.url, finding: `${p.images_missing_alt}/${p.images_total} images missing alt text`, fix: 'Add descriptive alt text for accessibility + image SEO.' })
    if (!p.has_jsonld) issues.push({ severity: 'warn', category: 'schema', url: p.url, finding: 'No JSON-LD structured data', fix: 'Add schema (Organization, FAQ, Article, Product etc.).' })
    if (!p.has_og_title || !p.has_og_description) issues.push({ severity: 'warn', category: 'social', url: p.url, finding: 'Missing Open Graph tags', fix: 'Add og:title, og:description, og:image for link previews.' })
    if (!p.has_twitter_card) issues.push({ severity: 'info', category: 'social', url: p.url, finding: 'Missing Twitter Card', fix: 'Add twitter:card meta (summary_large_image preferred).' })
    if (!p.is_https) issues.push({ severity: 'critical', category: 'security', url: p.url, finding: 'Not served over HTTPS', fix: 'Force HTTPS with 301 redirect + HSTS.' })
    if (p.mixed_content_candidates > 0) issues.push({ severity: 'warn', category: 'security', url: p.url, finding: `${p.mixed_content_candidates} http:// resources on HTTPS page`, fix: 'Upgrade resources to https:// to avoid mixed-content warnings.' })
    if (p.status >= 400) issues.push({ severity: 'critical', category: 'crawl', url: p.url, finding: `HTTP ${p.status}`, fix: 'Fix or 301-redirect the page to a working URL.' })
    if (p.redirect_chain.length > 1) issues.push({ severity: 'warn', category: 'crawl', url: p.url, finding: `${p.redirect_chain.length}-hop redirect chain`, fix: 'Flatten to a single 301 for speed.' })
    if (!p.has_viewport) issues.push({ severity: 'warn', category: 'mobile', url: p.url, finding: 'No viewport meta — may render poorly on mobile', fix: 'Add <meta name="viewport" content="width=device-width, initial-scale=1">.' })
    if (!p.has_html_lang) issues.push({ severity: 'info', category: 'accessibility', url: p.url, finding: 'Missing <html lang="...">', fix: 'Add lang attribute for accessibility and hreflang hygiene.' })
    if (p.load_time_ms > 3000) issues.push({ severity: 'warn', category: 'performance', url: p.url, finding: `Load time ${p.load_time_ms}ms`, fix: 'Audit with Lighthouse; optimize images, TTFB, and render-blocking resources.' })
  }

  const summary = {
    avg_load_ms: Math.round(pages.reduce((s, p) => s + p.load_time_ms, 0) / Math.max(pages.length, 1)),
    pages_missing_title: pages.filter((p) => !p.title).length,
    pages_missing_meta_description: pages.filter((p) => !p.meta_description).length,
    pages_missing_h1: pages.filter((p) => p.h1_count === 0).length,
    pages_multiple_h1: pages.filter((p) => p.h1_count > 1).length,
    pages_thin_content: pages.filter((p) => p.word_count < 300).length,
    pages_missing_canonical: pages.filter((p) => !p.canonical).length,
    pages_noindex: pages.filter((p) => p.noindex).length,
    pages_broken_incoming_links: pages.filter((p) => p.status >= 400).length,
    total_images_missing_alt: pages.reduce((s, p) => s + p.images_missing_alt, 0),
    pages_missing_schema: pages.filter((p) => !p.has_jsonld).length,
    pages_missing_og: pages.filter((p) => !p.has_og_title || !p.has_og_description).length,
    https_issues: pages.filter((p) => !p.is_https || p.mixed_content_candidates > 0).length,
  }

  return { base_url: baseUrl, pages_crawled: pages.length, started_at: startedAt, finished_at: finishedAt, pages, issues, summary }
}
