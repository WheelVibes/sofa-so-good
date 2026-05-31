/**
 * Tiny dependency-free fuzzy matcher tuned for short catalog names + keywords.
 *
 * `fuzzyScore(query, text)` returns a relevance score (higher = better, 0 = no
 * match). It rewards, in order: an exact substring hit, matches that start on a
 * word boundary, and contiguous runs; it tolerates a single adjacent
 * transposition (so "chiar" still finds "chair"). `fuzzySearch` scores each
 * item over its text fields, keeps the best field score, and returns the
 * matching items sorted best-first (stable for ties).
 */

const SUBSTRING_BONUS = 1000
const WORD_START_BONUS = 400
const CONTIGUOUS_BONUS = 8
const CHAR_BONUS = 4
// A skipped character in the text (gap between matched chars) is mildly penalised
// so tighter matches rank higher.
const GAP_PENALTY = 1

function isWordStart(text: string, i: number): boolean {
  if (i === 0) return true
  const prev = text[i - 1]
  return prev === ' ' || prev === '-' || prev === '_' || prev === '/'
}

/** Greedy subsequence score with the bonuses above; 0 if `query` isn't a
 *  subsequence of `text`. Both should already be lower-cased by the caller. */
function subsequenceScore(query: string, text: string): number {
  if (query.length === 0) return 1
  let score = 0
  let ti = 0
  let prevMatch = -2
  for (let qi = 0; qi < query.length; qi++) {
    const qc = query[qi]
    const found = text.indexOf(qc, ti)
    if (found === -1) return 0
    score += CHAR_BONUS
    if (isWordStart(text, found)) score += WORD_START_BONUS
    if (found === prevMatch + 1) score += CONTIGUOUS_BONUS
    else score -= (found - ti) * GAP_PENALTY
    prevMatch = found
    ti = found + 1
  }
  return Math.max(score, 1)
}

/** One-adjacent-transposition variant of the query (e.g. "chiar" → "chair"),
 *  scored at a discount so genuine matches still win. */
function transposedScore(query: string, text: string): number {
  let best = 0
  for (let i = 0; i + 1 < query.length; i++) {
    const swapped = query.slice(0, i) + query[i + 1] + query[i] + query.slice(i + 2)
    best = Math.max(best, subsequenceScore(swapped, text))
  }
  return best > 0 ? Math.round(best * 0.6) : 0
}

export function fuzzyScore(query: string, text: string): number {
  const q = query.toLowerCase().trim()
  const t = text.toLowerCase()
  if (q.length === 0) return 1
  if (t.includes(q)) {
    // Whole-query substring: strongest signal, plus a word-start kicker.
    const at = t.indexOf(q)
    return SUBSTRING_BONUS + (isWordStart(t, at) ? WORD_START_BONUS : 0) + q.length
  }
  return Math.max(subsequenceScore(q, t), transposedScore(q, t))
}

/** Score `items` against `query` over each item's text fields (best field
 *  wins) and return the matches sorted best-first. Empty query → all items in
 *  original order. */
export function fuzzySearch<T>(query: string, items: T[], getText: (item: T) => string[]): T[] {
  const q = query.trim()
  if (q.length === 0) return [...items]
  const scored: { item: T; score: number; idx: number }[] = []
  items.forEach((item, idx) => {
    let best = 0
    for (const field of getText(item)) best = Math.max(best, fuzzyScore(q, field))
    if (best > 0) scored.push({ item, score: best, idx })
  })
  scored.sort((a, b) => b.score - a.score || a.idx - b.idx)
  return scored.map((s) => s.item)
}
