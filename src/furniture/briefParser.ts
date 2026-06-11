/**
 * Text-to-room brief parser — the heuristic core of Smart Start's
 * "describe your home" box. Maps a free-text brief ("cozy japandi place for a
 * young couple, light woods, budget S$15k") onto the closest layout preset,
 * plus an optional budget target. Deterministic keyword scoring, not AI —
 * honestly explainable via `matchedTerms` (shown to the user as "matched: …").
 */

import type { LayoutPreset } from './layoutPresets'

/** A preset as the parser needs it (id + free text to score against). */
export type BriefPreset = Pick<LayoutPreset, 'id' | 'name' | 'description'>

export interface BriefMatch {
  presetId: string
  /** The brief phrases that drove the match (for an honest explanation). */
  matchedTerms: string[]
  /** Budget target in dollars when the brief mentions one, else null. */
  budget: number | null
  /** Internal score — exposed for tests/tie-debugging. */
  score: number
}

/** Curated synonym table: preset id → phrases people actually write. Phrases
 *  are matched whole (word-boundary) against the lower-cased brief; longer
 *  phrases score higher than single words. Keep ids in sync with
 *  `LAYOUT_PRESETS` — unknown ids are simply never matched. */
const PRESET_KEYWORDS: Record<string, string[]> = {
  'move-in': ['default', 'standard', 'starter', 'basic', 'simple oak'],
  'scandi-calm': [
    'scandi',
    'scandinavian',
    'nordic',
    'hygge',
    'light wood',
    'pale wood',
    'ash',
    'airy',
    'soft white',
    'bright and light',
  ],
  'warm-industrial': [
    'industrial',
    'loft',
    'leather',
    'dark timber',
    'dark wood',
    'charcoal',
    'exposed brick',
    'urban',
    'moody',
    'masculine',
  ],
  'cozy-tropical': [
    'tropical',
    'teak',
    'sage',
    'plants',
    'greenery',
    'terracotta',
    'resort',
    'balinese',
    'rattan',
    'nature',
  ],
  japandi: [
    'japandi',
    'japanese',
    'zen',
    'wabi sabi',
    'muji',
    'low contrast',
    'natural calm',
    'tatami',
  ],
  coastal: ['coastal', 'beach', 'beachy', 'seaside', 'nautical', 'breezy', 'ocean', 'blue accents'],
  'open-lounge': [
    'open concept',
    'open-concept',
    'open plan layout',
    'spacious lounge',
    'sectional',
  ],
  entertainer: [
    'entertain',
    'entertaining',
    'host',
    'hosting',
    'parties',
    'party',
    'guests',
    'bar cart',
  ],
  'broken-plan': [
    'broken plan',
    'broken-plan',
    'zones',
    'zoning',
    'semi open',
    'semi-open',
    'divider',
  ],
  'wfh-studio': [
    'work from home',
    'wfh',
    'home office',
    'office',
    'desk',
    'study',
    'remote work',
    'workspace',
    'freelancer',
  ],
  'social-lounge': ['social', 'gatherings', 'gathering', 'conversation', 'friends over', 'lounge'],
  minimalist: [
    'minimal',
    'minimalist',
    'minimalism',
    'clutter free',
    'clutter-free',
    'clean lines',
    'sparse',
    'decluttered',
  ],
  'boutique-suite': [
    'hotel',
    'boutique',
    'suite',
    'luxurious',
    'luxury',
    'master retreat',
    'resort bedroom',
  ],
  'family-nursery': [
    'baby',
    'nursery',
    'infant',
    'newborn',
    'crib',
    'toddler',
    'young family',
    'kids',
    'child',
  ],
  'modern-mono': [
    'monochrome',
    'mono',
    'black and white',
    'high contrast',
    'modern',
    'contemporary',
  ],
}

const PHRASE_SCORE = 3
const MULTI_WORD_BONUS = 1
const TEXT_WORD_SCORE = 1

/** Words too generic to score against preset names/descriptions. */
const STOPWORDS = new Set(
  'a an the and or for with of in on to my our we i want like love need home flat house apartment room rooms style feel look looking would really very some more bit budget'.split(
    ' ',
  ),
)

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Whole-word/phrase containment test against the lower-cased brief. */
function hasPhrase(brief: string, phrase: string): boolean {
  return new RegExp(`(?:^|[^a-z0-9])${escapeRegExp(phrase)}(?:[^a-z0-9]|$)`, 'i').test(brief)
}

/**
 * Extract a budget in dollars from phrasing like "$15k", "S$ 15,000",
 * "budget of 20000", "under 12k", "12k budget". Returns null when absent or
 * outside a sane range (100 .. 1,000,000).
 */
export function parseBriefBudget(brief: string): number | null {
  const text = brief.toLowerCase()
  const patterns = [
    // "$15k" / "s$15,000" / "sgd 15000"
    /(?:s\$|\$|sgd)\s*([\d,]+(?:\.\d+)?)\s*(k)?/i,
    // "budget of 15k" / "budget 15,000" / "budget: 15k" / "under 20k" / "15k budget"
    /(?:budget(?:\s+of)?|under|around|about|max)\s*:?\s*([\d,]+(?:\.\d+)?)\s*(k)?/i,
    /([\d,]+(?:\.\d+)?)\s*(k)?\s*budget/i,
  ]
  for (const re of patterns) {
    const m = text.match(re)
    if (!m) continue
    const raw = Number(m[1].replace(/,/g, ''))
    if (!Number.isFinite(raw) || raw <= 0) continue
    const value = m[2] ? raw * 1000 : raw
    if (value >= 100 && value <= 1_000_000) return Math.round(value)
  }
  return null
}

/**
 * Match a free-text brief to the best layout preset. Scores curated keyword
 * phrases (heavily) plus the preset's own name/description words (lightly);
 * ties break toward the earlier preset in `presets` order. Returns null when
 * nothing in the brief matches anything — callers should say so honestly
 * rather than pretend a random pick fits.
 */
export function parseBrief(brief: string, presets: BriefPreset[]): BriefMatch | null {
  const text = brief.trim().toLowerCase()
  if (!text) return null
  const budget = parseBriefBudget(text)

  let best: BriefMatch | null = null
  for (const preset of presets) {
    const matched: string[] = []
    let score = 0
    for (const phrase of PRESET_KEYWORDS[preset.id] ?? []) {
      if (hasPhrase(text, phrase)) {
        matched.push(phrase)
        score += PHRASE_SCORE + (phrase.includes(' ') ? MULTI_WORD_BONUS : 0)
      }
    }
    // Light fallback: the preset's own name + description words.
    const ownWords = `${preset.name} ${preset.description}`
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length >= 4 && !STOPWORDS.has(w))
    for (const w of new Set(ownWords)) {
      if (matched.includes(w)) continue
      if (hasPhrase(text, w)) {
        matched.push(w)
        score += TEXT_WORD_SCORE
      }
    }
    if (score > (best?.score ?? 0)) {
      best = { presetId: preset.id, matchedTerms: matched, budget, score }
    }
  }
  return best
}
