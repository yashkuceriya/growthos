// Cheap HTML → plaintext converter for feeding email bodies into LLM prompts
// as style references. Not a full parser — strips tags, decodes the most
// common entities, and collapses whitespace. The ML model gets the words and
// structure; it doesn't need to see broken-mid-tag HTML.

const ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&apos;': "'",
  '&nbsp;': ' ',
}

export function htmlToText(html: string): string {
  if (!html) return ''
  let text = html
    // Drop script/style blocks entirely (their bodies aren't visible content)
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    // Block-level elements get a newline so structure survives
    .replace(/<\/?(p|br|div|h[1-6]|li|tr|td)\b[^>]*>/gi, '\n')
    // Strip everything else
    .replace(/<[^>]+>/g, '')

  // Decode common entities. Numeric entities are rare in marketing HTML; skip them.
  for (const [k, v] of Object.entries(ENTITIES)) {
    text = text.split(k).join(v)
  }

  // Collapse whitespace runs and trim each line
  return text
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n')
}
