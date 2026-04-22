// Fetch founder voice samples + style refs to inject into strategic agents.
// Call from any route that wants "Yash tone" not "site tone".
import { createClient } from '@/lib/supabase/server'

export async function getFounderVoiceContext(userId: string, assetKind?: string): Promise<string> {
  const supabase = await createClient()
  const [voice, refs] = await Promise.all([
    supabase.from('founder_voice').select('samples, style_notes').eq('user_id', userId).maybeSingle(),
    assetKind
      ? supabase.from('style_references').select('asset_content, why_good').eq('user_id', userId).eq('asset_kind', assetKind).order('created_at', { ascending: false }).limit(5)
      : Promise.resolve({ data: [] as Array<{ asset_content: string; why_good: string | null }> }),
  ])

  const blocks: string[] = []
  const samples = (voice.data?.samples as string[] | undefined) ?? []
  if (samples.length) {
    blocks.push(`FOUNDER VOICE SAMPLES (match this tone, phrasing, cadence):\n${samples.slice(0, 8).map((s, i) => `[${i + 1}] ${s}`).join('\n\n')}`)
  }
  if (voice.data?.style_notes) {
    blocks.push(`FOUNDER STYLE NOTES: ${voice.data.style_notes}`)
  }
  const refList = (refs.data as Array<{ asset_content: string; why_good: string | null }> | undefined) ?? []
  if (refList.length) {
    blocks.push(`PROVEN STYLE REFERENCES (emulate what worked):\n${refList.map((r, i) => `[${i + 1}]${r.why_good ? ` (why it worked: ${r.why_good})` : ''}\n${r.asset_content.slice(0, 500)}`).join('\n\n')}`)
  }
  return blocks.join('\n\n')
}
