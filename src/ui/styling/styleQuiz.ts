/**
 * Style quiz — a short personality quiz that recommends one of the curated
 * interior styles (see `styleTransfer.ts`). Pure data + scoring (no React/store),
 * so the answer→style mapping is unit-testable. The UI collects answers and the
 * recommended style is applied via the same `applyHomeStyle` + palette path.
 */

import { STYLE_PRESETS } from './styleTransfer'

interface QuizOption {
  /** Display label for this answer. */
  label: string
  /** Weight contributed toward each style id (styleId → points). */
  weights: Record<string, number>
}

export interface QuizQuestion {
  id: string
  prompt: string
  options: QuizOption[]
}

// Style ids referenced below must exist in STYLE_PRESETS (guarded by a test).
const SCANDI = 'scandi'
const JAPANDI = 'japandi'
const INDUSTRIAL = 'industrial'
const COASTAL = 'coastal'
const WARM = 'warm-minimal'

/** The quiz: 4 questions, each answer weighted toward styles. */
export const STYLE_QUIZ: QuizQuestion[] = [
  {
    id: 'palette',
    prompt: 'Which palette feels most like home?',
    options: [
      { label: 'Bright whites & soft greys', weights: { [SCANDI]: 2, [COASTAL]: 1 } },
      { label: 'Warm earth & oak tones', weights: { [JAPANDI]: 2, [WARM]: 2 } },
      { label: 'Moody greys & graphite', weights: { [INDUSTRIAL]: 3 } },
      { label: 'Sea blues & sandy neutrals', weights: { [COASTAL]: 3 } },
    ],
  },
  {
    id: 'materials',
    prompt: 'Pick a material you’re drawn to.',
    options: [
      { label: 'Pale ash & birch', weights: { [SCANDI]: 3 } },
      { label: 'Warm oak & linen', weights: { [JAPANDI]: 2, [WARM]: 1 } },
      { label: 'Raw concrete & black steel', weights: { [INDUSTRIAL]: 3 } },
      { label: 'Bleached wood & rattan', weights: { [COASTAL]: 2, [SCANDI]: 1 } },
    ],
  },
  {
    id: 'vibe',
    prompt: 'Your ideal room feels…',
    options: [
      { label: 'Calm & uncluttered', weights: { [JAPANDI]: 2, [SCANDI]: 1 } },
      { label: 'Cosy & grounded', weights: { [WARM]: 3 } },
      { label: 'Urban & edgy', weights: { [INDUSTRIAL]: 3 } },
      { label: 'Light & breezy', weights: { [COASTAL]: 2, [SCANDI]: 1 } },
    ],
  },
  {
    id: 'accent',
    prompt: 'Choose an accent.',
    options: [
      { label: 'Muted sage & stone', weights: { [JAPANDI]: 2, [SCANDI]: 1 } },
      { label: 'Terracotta & rust', weights: { [INDUSTRIAL]: 1, [WARM]: 2 } },
      { label: 'Deep ocean blue', weights: { [COASTAL]: 3 } },
      { label: 'Warm honey & beige', weights: { [WARM]: 2, [JAPANDI]: 1 } },
    ],
  },
]

/**
 * Score quiz answers (questionId → chosen option index) into a recommended style
 * id. Tallies each option's weights; the highest total wins. Ties (and the
 * no-answers case) break deterministically by `STYLE_PRESETS` order. Always
 * returns a valid preset id.
 */
export function scoreQuiz(
  answers: Record<string, number>,
  quiz: QuizQuestion[] = STYLE_QUIZ,
): string {
  const totals = new Map<string, number>()
  for (const q of quiz) {
    const idx = answers[q.id]
    const opt = idx != null ? q.options[idx] : undefined
    if (!opt) continue
    for (const [styleId, w] of Object.entries(opt.weights)) {
      totals.set(styleId, (totals.get(styleId) ?? 0) + w)
    }
  }
  // Pick the highest total, breaking ties by STYLE_PRESETS order (stable).
  let best = STYLE_PRESETS[0]?.id ?? ''
  let bestScore = -1
  for (const preset of STYLE_PRESETS) {
    const score = totals.get(preset.id) ?? 0
    if (score > bestScore) {
      bestScore = score
      best = preset.id
    }
  }
  return best
}
