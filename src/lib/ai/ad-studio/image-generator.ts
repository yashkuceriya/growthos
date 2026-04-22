// Generate ad images via OpenRouter → Gemini 2.5 Flash Image preview.
// The model returns base64 image data in the assistant message content.

export interface ImageGenParams {
  headline: string
  description?: string | null
  primaryText?: string | null
  platform: string
  brandContext: string
  referenceImageUrl?: string | null
  aspect: '1:1' | '9:16' | '1.91:1'
}

export interface GeneratedImage {
  dataUrl: string
  mimeType: string
  aspect: string
  prompt: string
}

function aspectInstructions(aspect: ImageGenParams['aspect']) {
  switch (aspect) {
    case '1:1': return 'Square 1:1 aspect ratio, optimized for Meta feed and Instagram square.'
    case '9:16': return 'Vertical 9:16 aspect ratio, optimized for Stories, Reels, TikTok.'
    case '1.91:1': return 'Horizontal 1.91:1 aspect ratio, optimized for LinkedIn feed and Meta landscape.'
  }
}

function buildPrompt(p: ImageGenParams): string {
  return `Create a high-converting ${p.platform} ad creative.

${aspectInstructions(p.aspect)}

HEADLINE TO OVERLAY (must be readable, bold, high contrast): "${p.headline}"
${p.description ? `SUPPORTING COPY: "${p.description}"` : ''}

Brand context (match this product's real UI and tone):
${p.brandContext}

${p.referenceImageUrl ? `Use this product screenshot as the visual anchor — feature it prominently in a clean mockup: ${p.referenceImageUrl}` : 'Use a clean, modern composition that looks like a real product ad — not generic stock art.'}

Requirements:
- Feels native to ${p.platform}, not AI-slop
- Use the brand's primary color as accent
- Headline text must be crisp, legible, and stand out
- Include a subtle CTA area
- Avoid: watermarks, lorem ipsum, generic stock people, cliche abstract swirls
- Prioritize: product UI, concrete outcomes, trustworthy human elements`
}

export async function generateAdImage(params: ImageGenParams): Promise<GeneratedImage | null> {
  const prompt = buildPrompt(params)

  const content: Array<Record<string, unknown>> = [{ type: 'text', text: prompt }]
  if (params.referenceImageUrl) {
    content.push({ type: 'image_url', image_url: { url: params.referenceImageUrl } })
  }

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
      'X-Title': 'GrowthOS',
    },
    body: JSON.stringify({
      model: 'google/gemini-3.1-flash-image-preview',
      modalities: ['image', 'text'],
      messages: [{ role: 'user', content }],
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Image generation failed: ${res.status} ${err}`)
  }

  const data = await res.json()
  const msg = data.choices?.[0]?.message
  // OpenRouter returns generated images in message.images: [{ type: 'image_url', image_url: { url } }]
  const images: Array<{ image_url?: { url: string } }> | undefined = msg?.images
  const first = images?.[0]?.image_url?.url
  if (!first) {
    console.error('[image-gen] no image in response:', JSON.stringify(data).slice(0, 500))
    return null
  }

  // first is typically a data: URL (base64) — return as-is
  const mime = first.startsWith('data:') ? first.slice(5, first.indexOf(';')) : 'image/png'
  return { dataUrl: first, mimeType: mime, aspect: params.aspect, prompt }
}
