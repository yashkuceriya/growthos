// Universal "creative mode" lever — picked once at generation time, then
// injected into copy / image / video prompts so every asset for that piece
// shares a tonal lane. The id is the stable string we persist; copy/visual
// directives are the prompt fragments we splice into the LLM system prompt.
//
// Adding a mode: append to CREATIVE_MODES; don't reorder (UIs default-pick by
// list order so existing user habit stays consistent).

export interface CreativeMode {
  id: string
  label: string
  emoji: string
  description: string
  /** Splice into copy / script LLM prompts. Tells the model the angle. */
  copy_directive: string
  /** Splice into image / video visual prompts. Tells the renderer the look. */
  visual_directive: string
}

export const CREATIVE_MODES: CreativeMode[] = [
  {
    id: 'funny',
    label: 'Funny',
    emoji: '😂',
    description: 'Self-aware humor, deadpan, internet-native',
    copy_directive:
      'Write with self-aware humor. Use deadpan delivery, unexpected punchlines, and internet-native phrasing. The product should feel like a joke that pays off — never corporate, never trying too hard. Subvert the expected ad pattern.',
    visual_directive:
      'Comedic timing. Slightly absurd or unexpected visual juxtaposition. Bright, punchy, meme-adjacent aesthetic. Faces with reaction-shot energy.',
  },
  {
    id: 'shocking',
    label: 'Shocking',
    emoji: '😱',
    description: 'Pattern-interrupt opener, bold claims (substantiated)',
    copy_directive:
      'Open with a pattern-interrupt — a fact, claim, or admission that stops the scroll. Be willing to say what others won\'t. Substantiate every shocking claim with proof. No clickbait without payoff.',
    visual_directive:
      'High-contrast, dramatic lighting. Single bold focal point. Implied tension or before/after reveal. Avoid stock-photo neutrality.',
  },
  {
    id: 'trending',
    label: 'Trending',
    emoji: '🔥',
    description: 'Riffs on a current cultural moment, format, or sound',
    copy_directive:
      'Riff on a current cultural moment, meme format, or trending phrase. Sound like someone who is online today, not a brand from last quarter. Reference don\'t explain — if the audience gets it, they get it.',
    visual_directive:
      'Lo-fi, native-feel, captured-not-staged aesthetic. Phone-camera angles. Trending visual formats (split-screen, text-over-video, etc).',
  },
  {
    id: 'contrarian',
    label: 'Contrarian',
    emoji: '🙃',
    description: 'Reject the consensus the audience already heard',
    copy_directive:
      'Reject the consensus your audience has already heard a hundred times. Take the unpopular angle. Tell them the conventional wisdom is wrong, then back it up. The hook is "everyone else is doing X — here\'s why we don\'t."',
    visual_directive:
      'Visual contradiction or inversion of the cliche the category overuses. Subdued palette that signals confidence rather than hype.',
  },
  {
    id: 'heartfelt',
    label: 'Heartfelt',
    emoji: '❤️',
    description: 'Genuine, emotionally specific, founder-voice',
    copy_directive:
      'Speak from a real moment. Be emotionally specific — name a real person, a real frustration, a real win. No generic empathy phrases. Founder voice if possible: "I built this because..."',
    visual_directive:
      'Warm tones. Soft natural light. Real people, candid expressions. Documentary aesthetic, not advertising aesthetic.',
  },
  {
    id: 'urgent',
    label: 'Urgent',
    emoji: '⏱️',
    description: 'Time-bound, action-now CTA',
    copy_directive:
      'Time-bound and decisive. State the deadline, the consequence of waiting, and the action — in that order. Short sentences. Imperative verbs. No throat-clearing.',
    visual_directive:
      'Tight crops. Motion-blur or speed-ramped feel. Countdown elements where natural. Saturated colors — red/amber accent is on-pattern.',
  },
  {
    id: 'aspirational',
    label: 'Aspirational',
    emoji: '✨',
    description: 'Show the after-state: who they become',
    copy_directive:
      'Don\'t describe features — describe the after-state. Show who the buyer becomes, what their day looks like, what they no longer worry about. The product is implicit; the transformation is the point.',
    visual_directive:
      'Cinematic. Wide angles. Golden hour. The protagonist is in the desired-state, never struggling. Aspirational lifestyle without irony.',
  },
  {
    id: 'satirical',
    label: 'Satirical',
    emoji: '🎭',
    description: 'Parody the category to critique it',
    copy_directive:
      'Parody the category itself to critique it. Use the genre conventions of bad competitor ads — then break them. The audience is in on the joke; you\'re saying out loud what they already think about your competitors.',
    visual_directive:
      'Mock the visual cliches of the category — overlit stock-photo faces, generic boardroom shots, fake testimonials — then puncture them.',
  },
]

export const DEFAULT_MODE_ID = 'trending'

const MODE_BY_ID = new Map(CREATIVE_MODES.map((m) => [m.id, m]))

export function getMode(id: string | null | undefined): CreativeMode | null {
  if (!id) return null
  return MODE_BY_ID.get(id) ?? null
}

/**
 * Render a prompt-injection block for a given mode. Empty string for unknown
 * or null modes so callers can splice unconditionally without noise.
 */
export function modeBlock(modeId: string | null | undefined, surface: 'copy' | 'visual'): string {
  const mode = getMode(modeId)
  if (!mode) return ''
  const directive = surface === 'copy' ? mode.copy_directive : mode.visual_directive
  return `\n\nCREATIVE MODE — ${mode.label.toUpperCase()} (${mode.emoji}):\n${directive}`
}
