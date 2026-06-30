/**
 * GAP-FIX — minimal nudge to clear a narrow walkway gap.
 *
 * Pure math (no React, no three.js). Given a pinch point reported by
 * `findNarrowGaps` (`walkway.ts`) and the minimum clearance a walkway should
 * have, computes the shortest XZ translation that, applied to ONE side, widens
 * the gap to the required clearance.
 *
 * `findNarrowGaps`'s `NarrowGap` records only the two participant ids and the
 * measured `gap` — it carries no geometry, so the separation *direction* can't
 * be recovered from it alone. As the spec requires deriving direction "from the
 * two items' centres", this module consumes a `PositionedGap`: the real
 * `NarrowGap` shape plus the two participants' footprint centres (`ax/az` for
 * `a`, `bx/bz` for `b`). Callers attach the centres they already have from the
 * `OBB`s (`obb.cx/cz`) / wall midpoints used to find the gaps.
 *
 * The nudge is along the unit vector from the opposing centre (b) toward the
 * side being moved (a) — i.e. away from the opposing item — scaled by the
 * shortfall `requiredClearance - gap`. A gap already at/above the requirement
 * yields a zero vector (distance 0).
 */

import type { NarrowGap } from './walkway'

/** A `NarrowGap` enriched with the two participants' footprint centres (XZ).
 *  `a`/`gap`/`severity`/`wall` are exactly the fields `findNarrowGaps` emits;
 *  the centre fields are supplied by the caller (e.g. `OBB.cx/cz`, or a wall
 *  segment midpoint for `wall` gaps) so the separation axis can be derived. */
export interface PositionedGap extends NarrowGap {
  /** Footprint centre of side `a` (the side that gets nudged). */
  ax: number
  az: number
  /** Footprint centre of the opposing participant `b` (item or wall). */
  bx: number
  bz: number
}

export interface GapFix {
  /** Nudge along world X, in metres. */
  dx: number
  /** Nudge along world Z, in metres. */
  dz: number
  /** Magnitude of the nudge — `max(0, requiredClearance - gap)`. */
  distance: number
}

export interface SuggestedGapFix extends GapFix {
  /** Index of the gap in the input array this fix applies to. */
  gapIndex: number
}

/**
 * Minimal translation applied to side `a` that widens `gap` to
 * `requiredClearance`. Direction = the unit vector from `b`'s centre toward
 * `a`'s centre (away from the opposing participant); magnitude = the shortfall.
 * Returns a zero vector when the gap already meets/exceeds the requirement.
 *
 * Deterministic: when the two centres coincide (degenerate, gap can't have a
 * meaningful axis) the direction defaults to +X so the result is still defined.
 */
export function gapFixVector(gap: PositionedGap, requiredClearance: number): GapFix {
  const distance = Math.max(0, requiredClearance - gap.gap)
  if (distance === 0) return { dx: 0, dz: 0, distance: 0 }

  let nx = gap.ax - gap.bx
  let nz = gap.az - gap.bz
  const len = Math.hypot(nx, nz)
  if (len < 1e-9) {
    // Coincident centres — no derivable axis; pick a stable default (+X).
    nx = 1
    nz = 0
  } else {
    nx /= len
    nz /= len
  }

  return { dx: nx * distance, dz: nz * distance, distance }
}

/**
 * Map each narrow gap to its minimal fix, skipping gaps that already meet the
 * required clearance. The returned `gapIndex` references the position in the
 * input `gaps` array (clear gaps leave a hole in the index sequence, by design).
 */
export function suggestGapFixes(
  gaps: PositionedGap[],
  requiredClearance: number,
): SuggestedGapFix[] {
  const out: SuggestedGapFix[] = []
  for (let i = 0; i < gaps.length; i++) {
    const fix = gapFixVector(gaps[i]!, requiredClearance)
    if (fix.distance === 0) continue
    out.push({ gapIndex: i, ...fix })
  }
  return out
}
