// Generates a 10-sec-friendly video script from a topic + creative mode.
// Output is two strings:
//   - visual_prompt: what we feed the video model (Kling/Veo/etc)
//   - hook_caption: the on-screen text overlay or first-second hook
//
// Visual prompts for these models reward concrete, cinematic descriptions
// over abstract marketing language — so we ask the LLM for a literal scene
// description, not "a video about productivity software".

import { generateObject } from 'ai'
import { z } from 'zod'
import { openrouter } from '@/lib/ai/openrouter'
import { modeBlock } from '@/lib/ai/creative/modes'

const ScriptSchema = z.object({
  visual_prompt: z.string().describe('Concrete cinematic description of the scene the video model should render. Include subject, action, setting, lighting, camera. No marketing speak. 1-3 sentences.'),
  hook_caption: z.string().describe('Short on-screen text overlay or spoken hook for the first 1-2 seconds. Under 60 chars.'),
  voiceover: z.string().describe('Optional voiceover or caption for the full clip. Keep aligned with the creative mode\'s tonal lane. Under 200 chars.'),
})

export type VideoScript = z.infer<typeof ScriptSchema>

const MODEL = 'google/gemini-2.0-flash-001'

export interface GenerateVideoScriptArgs {
  topic: string
  mode?: string | null
  brandTagline?: string
  brandTone?: string
  durationSeconds?: number
}

export async function generateVideoScript(args: GenerateVideoScriptArgs): Promise<{
  script: VideoScript
  inputTokens: number
  outputTokens: number
}> {
  const duration = args.durationSeconds ?? 10
  const system = `You write short-form video scripts for AI video generation models (Kling, Veo, Sora). Your job is to translate a topic into a concrete, cinematic VISUAL PROMPT and a punchy HOOK CAPTION for a ${duration}-second clip.

RULES:
- Visual prompts must be literal scene descriptions, not marketing copy. Include who/what/where, the action, the lighting, and the camera framing.
- Hook captions must work at 1-2 second exposure. Front-load curiosity.
- Don't describe text overlays in the visual_prompt — that's what hook_caption is for.
- ${duration} seconds is short. Pick ONE moment, not a story arc.
${args.brandTagline ? `\nBRAND TAGLINE: ${args.brandTagline}` : ''}${args.brandTone ? `\nBRAND TONE: ${args.brandTone}` : ''}${modeBlock(args.mode, 'visual')}${modeBlock(args.mode, 'copy')}`

  const userMessage = `TOPIC: ${args.topic}

Generate a visual_prompt + hook_caption + voiceover for a ${duration}-second video.`

  const { object, usage } = await generateObject({
    model: openrouter(MODEL),
    schema: ScriptSchema,
    system,
    messages: [{ role: 'user', content: userMessage }],
  })

  return {
    script: object,
    inputTokens: usage?.inputTokens ?? 0,
    outputTokens: usage?.outputTokens ?? 0,
  }
}
