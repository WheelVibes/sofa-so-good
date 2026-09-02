/**
 * Material-palette restraint — a whole-home design-review observation.
 *
 * **The judgement this encodes.** Limiting the number of distinct finishes is
 * one of the clearest things an experienced designer does and an inexperienced
 * one does not: "the rule of 3 in flooring ... recommends using no more than
 * three different flooring materials throughout a home to maintain visual
 * cohesion. Five materials overwhelm the eye and create visual noise, while
 * three materials hit the sweet spot." Nothing in the app looked at this —
 * `designScore` covers clearance, circulation, daylight, furnishing and
 * lighting, all of which are about FIT, none about coherence.
 *
 * **Deliberately ONE whole-home observation, not a per-room check.** Palette
 * discipline is a property of the home, and a per-room version would fire
 * everywhere at once and read as noise — the failure mode this codebase has
 * already learned to avoid ("a check that reads as a verdict gets ignored after
 * the second false alarm").
 *
 * **Deliberately NOT added to `designScore`.** Changing a shipped score's
 * criteria silently re-scores every existing design, which is a product
 * decision rather than a fix — the circulation-score recalibration is already
 * logged as needing the owner's call. This reports; it does not grade.
 *
 * **It names WHICH finishes to consider dropping.** "You have six floor
 * finishes" is a complaint; "the three smallest cover 4% of the floor between
 * them" is an action. Consumes `FinishSchedule.totals`, so the areas and codes
 * it cites are the ones printed on the schedule beside it.
 *
 * Pure (no store, no three, no DOM).
 *
 * Sources: profloorsandblinds.com "The Rule of 3 in Flooring";
 * welshdesignstudio.com "The Powerful Rule of Three in Interior Design";
 * dwellingsdecor.com "How to Decorate Your Home with a Cohesive Color Palette".
 */

import type { FinishTotal } from '../floorplan/finishSchedule'

/** More than this many distinct finishes of one kind reads as uncohesive. */
export const PALETTE_SWEET_SPOT = 3
/** At this many, the sources say the eye is overwhelmed — stronger wording. */
export const PALETTE_NOISE_THRESHOLD = 5

interface PaletteKindReport {
  kind: 'floor' | 'wall'
  /** Distinct finishes of this kind, largest area first. */
  finishes: { code: string; name: string; area: number; sharePct: number }[]
  count: number
  /** True above the rule-of-three sweet spot. */
  overSweetSpot: boolean
  /** True at or above the point the sources call visual noise. */
  overwhelming: boolean
  /**
   * The finishes beyond the third, i.e. the smallest-area ones — the candidates
   * to consolidate. Empty when the count is within the sweet spot.
   */
  consolidationCandidates: { code: string; name: string; area: number; sharePct: number }[]
  /** Combined share of the candidates (%), so the advice can say how little
   *  area is at stake. */
  candidateSharePct: number
}

export interface PaletteDisciplineReport {
  floor: PaletteKindReport
  wall: PaletteKindReport
  /** True when either kind exceeds the sweet spot. */
  hasFinding: boolean
  note: string
}

const PALETTE_NOTE =
  `Trade practice keeps a home to about ${PALETTE_SWEET_SPOT} distinct flooring materials for ` +
  `visual cohesion; at ${PALETTE_NOISE_THRESHOLD} the eye is overwhelmed. This is a design ` +
  'observation, not a rule — a deliberate contrast, a wet-room change of material, or a ' +
  'separate annexe can all justify more. It is offered because the smallest-area finishes are ' +
  'usually the accidental ones, and they are named below so the call is easy to make.'

function kindReport(totals: readonly FinishTotal[], kind: 'floor' | 'wall'): PaletteKindReport {
  const own = totals
    .filter((t) => (kind === 'wall' ? t.kind === 'wall' || t.kind === 'accent' : t.kind === kind))
    .filter((t) => t.area > 0)
  const totalArea = own.reduce((s, t) => s + t.area, 0)
  const finishes = own
    .map((t) => ({
      code: t.code,
      name: t.name,
      area: Math.round(t.area * 10) / 10,
      sharePct: totalArea > 0 ? Math.round((t.area / totalArea) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.area - a.area)
  const candidates = finishes.slice(PALETTE_SWEET_SPOT)
  return {
    kind,
    finishes,
    count: finishes.length,
    overSweetSpot: finishes.length > PALETTE_SWEET_SPOT,
    overwhelming: finishes.length >= PALETTE_NOISE_THRESHOLD,
    consolidationCandidates: candidates,
    candidateSharePct: Math.round(candidates.reduce((s, c) => s + c.sharePct, 0) * 10) / 10,
  }
}

/** Palette restraint for the whole home, from the finish schedule's own totals. */
export function buildPaletteDiscipline(totals: readonly FinishTotal[]): PaletteDisciplineReport {
  const floor = kindReport(totals ?? [], 'floor')
  const wall = kindReport(totals ?? [], 'wall')
  return {
    floor,
    wall,
    hasFinding: floor.overSweetSpot || wall.overSweetSpot,
    note: PALETTE_NOTE,
  }
}
