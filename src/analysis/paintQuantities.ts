/**
 * Paint QUANTITIES — turning a painted surface area into litres.
 *
 * **The gap this closes.** The finishes schedule and the trade packs give a
 * painter an area and then tell them to finish the job themselves:
 * `tradePacks.ts` printed "Add ceilings + a coverage/coats factor per the paint
 * spec". An area is not a procurement quantity — litres are, and the conversion
 * is arithmetic the app already has every input for. Same shape as the tile
 * setting-out gap (v0.31.5.288): the number a contractor needs was one step
 * beyond what was produced.
 *
 * **Consumes `FinishSchedule.totals`, never its own area maths.** Those totals
 * are already net of door/window openings, per-room ceiling-height aware, and
 * clamped against the over-deduction bug documented in `finishSchedule.ts`.
 * Re-deriving here would let the litres and the areas on the same sheet
 * disagree, which is the failure the shared finish-schedule renderer exists to
 * prevent.
 *
 * **A finish is paint iff it carries `MaterialDef.paint`** — presence as the
 * marker, exactly like `moduleMm` for modular finishes. Not inferred from
 * `pattern === 'plaster'`: that is a rendering constant.
 *
 * Substrate rates (bare plaster, sealer) are properties of the SURFACE, not of
 * the product, so they are constants here rather than repeated on every paint.
 *
 * Pure (no store, no three, no DOM).
 */

import { DEFAULT_CEILING, type FinishTotal, NEUTRAL_WALL } from '../floorplan/finishSchedule'
import type { IntakeStateId } from '../floorplan/types'
import type { MaterialDef, PaintCoverage } from '../materials/types'

/**
 * What the surface is, which changes both the coverage and whether a sealer
 * coat is needed.
 *
 * - `'primed'` — smooth, previously painted or primed. The product's own
 *   specified rate applies and no sealer is needed.
 * - `'bare'` — new/bare plaster or skim, i.e. a **BTO handover**. Highly
 *   absorbent: coverage drops to roughly 6-8 m²/L, and the first coat is a
 *   thinned mist/sealer coat. Sources: "bare new plaster is highly absorbent;
 *   first coat acts as a mist coat (thinned 10-20% with water); coverage on
 *   bare plaster approximately 6-8 m²/litre"; "water-based primer covers
 *   approximately 10-12 m²/litre".
 */
export type PaintSubstrate = 'primed' | 'bare'

/**
 * The substrate implied by the buyer's starting state, when the plan records one
 * (`FloorPlan.intakeState`). Turns a stated ASSUMPTION into a derived fact.
 *
 * - `bto-bare`, `bto-ocs` → **bare**. A new BTO "hands over with sound skim
 *   coat, no existing paint history and no moisture record", and needs "one
 *   primer or sealer coat followed by two finishing coats" — which is exactly
 *   the bare model here. `bto-ocs` is also bare: the Optional Component Scheme
 *   supplies flooring and sanitary ware, not wall paint.
 * - `resale-asis` → **primed**. A previously-owned flat has paint history.
 * - `resale-stripout` → **primed**. The app's strip-out model removes furniture,
 *   wardrobes and non-fitting carpentry and screeds the dry floors; it does NOT
 *   re-skim the walls, and the existing paint remains. A real strip-out that
 *   includes re-skimming would be bare — that is a user override, not something
 *   this can infer, and the sheet's note says which assumption is in force.
 *
 * Returns `undefined` when the plan records no intake, so the caller keeps its
 * own default rather than being handed a guess.
 *
 * Sources: painting.com.sg "BTO Flat Painting Before Your Move-In";
 * mypaintjob.com.sg "Plaster Walls vs. Skim Coating".
 */
export function substrateForIntake(intake: IntakeStateId | undefined): PaintSubstrate | undefined {
  switch (intake) {
    case 'bto-bare':
    case 'bto-ocs':
      return 'bare'
    case 'resale-asis':
    case 'resale-stripout':
      return 'primed'
    default:
      return undefined
  }
}

/** Coverage on bare/new plaster (m²/L per coat) — the lower end of the 6-8
 *  band, for the same reason the product rate takes 12 rather than 14. */
export const BARE_PLASTER_RATE_M2_PER_L = 6
/** Sealer/primer coverage (m²/L) — the lower end of the published 10-12. */
export const SEALER_RATE_M2_PER_L = 10

/**
 * Standard interior emulsion, used for the finish-schedule SENTINELS.
 *
 * A room that never had a wall or ceiling finish picked still shows on the
 * schedule as `Plaster (neutral)` / `Ceiling paint (default white)` — sentinel
 * NAMES, not catalog products, so a material lookup misses them. They are
 * painted surfaces by definition (the constants' own comments read "neutral
 * plaster shell" and "plain painted ceiling"), and a painter still has to paint
 * them. Excluding them would zero the quantity for the MOST common case: a new
 * flat where nothing has been chosen yet.
 *
 * Same figures as the catalog's `EMULSION_COVERAGE`; duplicated here rather than
 * imported because these are the sentinels' assumed spec, not a product's
 * declared one — if a real product ever backs them, delete this and let the
 * lookup find it.
 */
const SENTINEL_EMULSION: PaintCoverage = { spreadingRateM2PerL: 12, coats: 2 }

/** Finish-schedule sentinel names that ARE paint. */
const SENTINEL_COVERAGE: Record<string, PaintCoverage> = {
  [NEUTRAL_WALL]: SENTINEL_EMULSION,
  [DEFAULT_CEILING]: SENTINEL_EMULSION,
}

/** Retail tin sizes (litres), largest first — SG paint is sold in these. */
export const TIN_SIZES_L = [20, 5, 1] as const

/** One paint line: a material code, its area, and what to buy. */
export interface PaintQuantityRow {
  /** The finish-schedule material code (`WL-01`, `CL-01`, `AW-01`). */
  code: string
  name: string
  kind: FinishTotal['kind']
  areaM2: number
  coats: number
  /** Effective spreading rate used (m²/L per coat) after the substrate. */
  spreadingRateM2PerL: number
  /** Topcoat litres = area × coats ÷ rate. */
  topcoatL: number
  /** Sealer litres, 0 on a primed substrate. */
  sealerL: number
  /** `topcoatL + sealerL`. */
  totalL: number
  /** Tins to buy for `totalL`, largest first, e.g. `[{ size: 5, count: 2 }]`. */
  tins: { size: number; count: number }[]
}

export interface PaintQuantities {
  substrate: PaintSubstrate
  rows: PaintQuantityRow[]
  /** Total litres across every line. */
  totalL: number
  /** Finish totals that are NOT paint (tile, timber, carpet…) and so carry no
   *  litres — reported so a short list cannot read as the whole job. */
  omittedFinishes: number
  /** Printed alongside the table; states every assumption the numbers rest on. */
  note: string
}

/** Smallest set of tins covering `litres`, largest size first. Never returns an
 *  empty list for a positive quantity — a 0.2 L requirement still needs a tin. */
export function tinsFor(litres: number): { size: number; count: number }[] {
  if (!(litres > 0)) return []
  let remaining = litres
  const out: { size: number; count: number }[] = []
  for (const size of TIN_SIZES_L) {
    // Only take a big tin when it is at least mostly used, so 6 L buys
    // 5 L + 1 L rather than a 20 L drum.
    const count = Math.floor(remaining / size)
    if (count > 0) {
      out.push({ size, count })
      remaining -= count * size
    }
  }
  // Anything left over needs one more of the smallest tin.
  if (remaining > 1e-9) {
    const smallest = TIN_SIZES_L[TIN_SIZES_L.length - 1]!
    const last = out.find((t) => t.size === smallest)
    if (last) last.count += 1
    else out.push({ size: smallest, count: 1 })
  }
  return out
}

const round1 = (v: number) => Math.round(v * 10) / 10

/**
 * Paint quantities for every painted finish in a finish schedule.
 *
 * Floor totals are ignored outright (a floor finish is never paint here), and
 * any wall/ceiling/accent finish without `MaterialDef.paint` is counted as
 * omitted rather than dropped.
 */
export function buildPaintQuantities(
  totals: readonly FinishTotal[],
  /** Material lookup by the NAME the schedule prints, since `FinishTotal`
   *  carries the display name rather than the material id. */
  materialByName: Record<string, MaterialDef | undefined>,
  substrate: PaintSubstrate = 'primed',
): PaintQuantities {
  const rows: PaintQuantityRow[] = []
  let omittedFinishes = 0

  for (const t of totals) {
    if (t.kind === 'floor') continue
    const coverage = materialByName[t.name]?.paint ?? SENTINEL_COVERAGE[t.name]
    if (!coverage || !(t.area > 0)) {
      if (t.area > 0) omittedFinishes += 1
      continue
    }
    const rate =
      substrate === 'bare'
        ? Math.min(coverage.spreadingRateM2PerL, BARE_PLASTER_RATE_M2_PER_L)
        : coverage.spreadingRateM2PerL
    const topcoatL = (t.area * coverage.coats) / rate
    const sealerL = substrate === 'bare' ? t.area / SEALER_RATE_M2_PER_L : 0
    const totalL = topcoatL + sealerL
    rows.push({
      code: t.code,
      name: t.name,
      kind: t.kind,
      areaM2: t.area,
      coats: coverage.coats,
      spreadingRateM2PerL: rate,
      topcoatL: round1(topcoatL),
      sealerL: round1(sealerL),
      totalL: round1(totalL),
      tins: tinsFor(totalL),
    })
  }

  rows.sort((a, b) => b.totalL - a.totalL || a.code.localeCompare(b.code))

  const note =
    substrate === 'bare'
      ? `Quantities assume BARE/NEW plaster (a BTO handover): ${BARE_PLASTER_RATE_M2_PER_L} m²/L per coat plus a sealer coat at ${SEALER_RATE_M2_PER_L} m²/L. Areas are net of door/window openings, from the finishes schedule. Litres EXCLUDE wastage, touch-ups and any accent-colour cutting-in. Confirm the spreading rate on the product data sheet — it varies by brand, sheen and application method.`
      : `Quantities assume a SMOOTH, previously painted or primed surface. Bare/new plaster (a BTO handover) absorbs far more — roughly ${BARE_PLASTER_RATE_M2_PER_L} m²/L plus a sealer coat — so re-run as "bare" for a new flat. Areas are net of door/window openings, from the finishes schedule. Litres EXCLUDE wastage, touch-ups and any accent-colour cutting-in. Confirm the spreading rate on the product data sheet — it varies by brand, sheen and application method.`

  return {
    substrate,
    rows,
    totalL: round1(rows.reduce((s, r) => s + r.totalL, 0)),
    omittedFinishes,
    note,
  }
}
