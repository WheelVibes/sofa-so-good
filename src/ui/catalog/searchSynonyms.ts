/**
 * Smart catalog search: query-time synonym expansion on top of the generic
 * fuzzy matcher (`fuzzyScore`). Builtin items carry hand-authored `keywords`,
 * but pack / user-uploaded items usually don't — so a search for "couch" would
 * miss an uploaded model literally named "Sofa". A curated synonym dictionary
 * applied to the QUERY (not the item) makes alternate terms work uniformly
 * across every catalog source (builtin + packs + uploads) with no per-item
 * authoring, matching Coohom's forgiving search.
 *
 * Pure + dependency-free (it only calls `fuzzyScore`) so it's fully unit-tested.
 */
import { fuzzyScore } from './fuzzySearch'

/**
 * Bidirectional synonym groups for home/interior furnishing terms. Every term
 * in a group is treated as equivalent to the others, so typing any one surfaces
 * items named with any other. Keep terms lower-case; multi-word phrases are
 * allowed (matched as substrings, so "bedside table" → "nightstand").
 */
export const SYNONYM_GROUPS: readonly (readonly string[])[] = [
  ['sofa', 'couch', 'settee', 'loveseat', 'divan'],
  ['sofa', 'lounge'],
  ['armchair', 'accent chair', 'lounge chair', 'easy chair', 'occasional chair'],
  ['tv', 'television', 'telly', 'flatscreen', 'flat screen'],
  ['tv console', 'tv stand', 'media unit', 'media console', 'entertainment unit'],
  ['fridge', 'refrigerator'],
  ['stove', 'oven', 'hob', 'cooktop', 'cooker', 'range'],
  ['nightstand', 'bedside table', 'night table', 'bedside cabinet'],
  ['bookshelf', 'bookcase', 'shelving', 'book rack'],
  ['wardrobe', 'closet', 'armoire', 'almirah'],
  ['dresser', 'chest of drawers', 'tallboy', 'bureau', 'drawers'],
  ['rug', 'carpet', 'mat'],
  ['curtains', 'drapes', 'drapery'],
  ['blinds', 'shades', 'venetian blinds'],
  ['potted plant', 'houseplant', 'pot plant', 'plant'],
  ['toilet', 'wc', 'water closet'],
  ['bathroom sink', 'washbasin', 'basin', 'vanity sink'],
  ['desk', 'writing desk', 'study table', 'computer table', 'work desk'],
  ['aircon', 'air conditioner', 'air con', 'a/c', 'ac unit'],
  ['ottoman', 'pouffe', 'pouf', 'footstool', 'footrest'],
  ['coffee table', 'centre table', 'center table', 'cocktail table'],
  ['dining table', 'dinner table', 'kitchen table'],
  ['dining chair', 'kitchen chair'],
  ['office chair', 'desk chair', 'task chair', 'swivel chair', 'gaming chair'],
  ['bar stool', 'counter stool', 'high stool', 'breakfast stool'],
  ['ceiling light', 'pendant', 'pendant light', 'hanging light'],
  ['floor lamp', 'standing lamp', 'standard lamp'],
  ['sideboard', 'buffet', 'credenza'],
  ['crib', 'cot', 'bassinet', 'baby bed'],
  ['microwave', 'microwave oven'],
  ['washing machine', 'washer'],
  ['fan', 'ceiling fan'],
  ['mirror', 'looking glass'],
] as const

/**
 * Expand a query into the original plus any synonym variants. If a synonym term
 * appears in the query it is substituted (so "leather couch" → "leather sofa"),
 * and a bare query equal to a term yields the other terms directly. The original
 * (lower-cased, trimmed) is always first; the result is de-duplicated.
 */
export function expandQuery(query: string): string[] {
  const q = query.toLowerCase().trim()
  if (!q) return [q]
  const out = new Set<string>([q])
  for (const group of SYNONYM_GROUPS) {
    // Match the longest term first so "tv console" isn't shadowed by "tv".
    const hit = [...group].sort((a, b) => b.length - a.length).find((term) => q.includes(term))
    if (!hit) continue
    for (const term of group) {
      if (term === hit) continue
      out.add(q === hit ? term : q.replace(hit, term))
    }
  }
  return [...out]
}

// Synonym hits score below a literal match so an exact name still ranks first
// (a synonym substring at 1000×0.7 = 700 still beats a weak original subsequence,
// which is what we want when the original truly doesn't match the item).
const SYNONYM_DISCOUNT = 0.7

/**
 * The query plus a singularised form, so a plural query ("sofas", "chairs",
 * "boxes") still matches a singular catalog name ("Sofa"). The fuzzy matcher is
 * a subsequence test, so a trailing plural suffix on the query (chars NOT in the
 * shorter name) otherwise drops the score to 0 — these forms restore the match.
 * Returned forms are all treated as the user's literal intent (full weight).
 */
export function singularize(q: string): string[] {
  const out = [q]
  if (q.length > 4 && q.endsWith('es')) out.push(q.slice(0, -2))
  if (q.length > 3 && q.endsWith('s')) out.push(q.slice(0, -1))
  return out
}

/**
 * Synonym-aware fuzzy search. Scores each item's text fields against the query
 * (and a singularised form) at full weight PLUS synonym variants (discounted),
 * keeps the best, and returns matches sorted best-first (stable for ties). Empty
 * query → all items in order. Drop-in replacement for `fuzzySearch`.
 */
export function fuzzySearchSmart<T>(
  query: string,
  items: T[],
  getText: (item: T) => string[],
): T[] {
  const q = query.trim()
  if (q.length === 0) return [...items]
  const original = q.toLowerCase()
  // Literal forms (full weight): the query + its singular(s).
  const literals = new Set(singularize(original))
  // Synonym forms (discounted): synonyms of each literal form, minus the literals.
  const synonyms = new Set<string>()
  for (const lit of literals) {
    for (const v of expandQuery(lit)) {
      if (!literals.has(v)) synonyms.add(v)
    }
  }
  const scored: { item: T; score: number; idx: number }[] = []
  items.forEach((item, idx) => {
    let best = 0
    for (const field of getText(item)) {
      for (const v of literals) best = Math.max(best, fuzzyScore(v, field))
      for (const v of synonyms) {
        const raw = fuzzyScore(v, field)
        if (raw > 0) best = Math.max(best, raw * SYNONYM_DISCOUNT)
      }
    }
    if (best > 0) scored.push({ item, score: best, idx })
  })
  scored.sort((a, b) => b.score - a.score || a.idx - b.idx)
  return scored.map((s) => s.item)
}
