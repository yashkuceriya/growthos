// X/Twitter thread copy-to-clipboard + composer opener.
// OAuth direct-post can come later; for now, clipboard flow cuts the friction.

export function splitThreadFromContent(content: string): string[] {
  // Our generator stores threads as "[1/N] tweet\n\n[2/N] tweet ..."
  const parts = content.split(/\n\n+/).map((s) => s.replace(/^\[\d+\/\d+\]\s*/, '').trim()).filter(Boolean)
  return parts
}

export async function copyThreadAsReplies(content: string): Promise<number> {
  const tweets = splitThreadFromContent(content)
  await navigator.clipboard.writeText(tweets.join('\n\n---NEXT TWEET---\n\n'))
  return tweets.length
}

export function openXComposer(firstTweet: string) {
  const url = new URL('https://twitter.com/intent/tweet')
  url.searchParams.set('text', firstTweet)
  window.open(url.toString(), '_blank', 'noopener,noreferrer,width=600,height=500')
}
