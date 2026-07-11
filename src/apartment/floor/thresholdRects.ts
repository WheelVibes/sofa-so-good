import type { WallSpec } from '../types'

/**
 * Doorway threshold floor patches (DOOR-GAP-LEAK).
 *
 * Room floors cover only room *interiors* and a door cutout opens the wall
 * body all the way down to y=0 — so the wall-thickness strip of floor under
 * every doorway was a genuine hole into the void below the flat. The scene
 * has no underside, so at grazing camera angles the bright sky background
 * shone straight through the slot at a closed leaf's foot as blown-out white
 * strips/wedges (hours- and tier-invariant — it was never a shadow leak).
 *
 * `thresholdRects` returns one floor patch per floor-level door cutout,
 * spanning the cutout width along the wall and the wall thickness across it,
 * extended by {@link THRESHOLD_OVERLAP} per side so it tucks under the
 * adjacent room floors (which sit slightly higher) with no abutment crack.
 * Pure + unit-tested; rendered by `Thresholds.tsx`.
 */
export interface ThresholdRect {
  /** World centre of the patch (XZ). */
  cx: number
  cz: number
  /** Extent along the wall axis (the door/cutout width, m). */
  length: number
  /** Extent across the wall (thickness + overlap both sides, m). */
  depth: number
  /** Yaw so local Z runs along the wall (same convention as Skirting). */
  angle: number
  /** Host wall — the patch fades with it during the camera reveal. */
  wallId: string
}

/** Tuck-under overlap past each wall face (m) — hides the exact-abutment seam
 *  against the room floor planes without z-fighting (they sit higher). */
export const THRESHOLD_OVERLAP = 0.012

/** Top surface height: above y=0 (so it can't coplanar-fight a future slab)
 *  but below the room floors' lift (0.001) so the overlap hides underneath. */
export const THRESHOLD_LIFT = 0.0006

export function thresholdRects(
  walls: readonly WallSpec[],
  thicknessOf: (wall: WallSpec) => number,
): ThresholdRect[] {
  const out: ThresholdRect[] = []
  for (const wall of walls) {
    const dx = wall.end[0] - wall.start[0]
    const dz = wall.end[1] - wall.start[1]
    const len = Math.hypot(dx, dz)
    if (len === 0) continue
    const ux = dx / len
    const uz = dz / len
    const angle = Math.atan2(ux, uz)
    for (const c of wall.cutouts) {
      // Only floor-level door openings leave a hole (window cutouts keep a
      // solid sill segment below them).
      if (c.kind !== 'door' || c.sill > 0.001) continue
      const mid = c.offset + c.width / 2
      out.push({
        cx: wall.start[0] + ux * mid,
        cz: wall.start[1] + uz * mid,
        length: c.width,
        depth: thicknessOf(wall) + THRESHOLD_OVERLAP * 2,
        angle,
        wallId: wall.id,
      })
    }
  }
  return out
}
