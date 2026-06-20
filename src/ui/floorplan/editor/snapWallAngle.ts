/**
 * Angle-snapping a wall-draft endpoint while drawing, so freehand walls land on
 * clean directions (horizontal / vertical / diagonal) instead of a fraction of a
 * degree off. The segment from `anchor` is rotated onto the nearest `stepDeg`
 * multiple (15° by default → covers 30 / 45 / 90°); the cursor distance is kept,
 * only the *direction* snaps.
 *
 * Order in the caller is grid → angle → wall-snap: the raw cursor is quantised to
 * the grid, aimed onto the increment here, then `snapToWalls` still gets the final
 * say near existing geometry (a join to a real corner/edge wins over the angle).
 * That precedence means this helper never needs to know about other walls.
 *
 * A tiny segment (shorter than `minLength`) is returned untouched — the direction
 * is meaningless at the anchor and snapping it would make the preview jitter.
 *
 * Pure (no React/three) so it unit-tests in isolation.
 */
import type { PlanVec2 } from '../../../floorplan/types'

export interface SnapWallAngleOpts {
  /** Snap increment in degrees (default 15 → 15/30/45/60/75/90…). */
  stepDeg?: number
  /** Below this segment length (metres) the point is left alone (default 0.08). */
  minLength?: number
}

export function snapWallAngle(
  anchor: PlanVec2,
  point: PlanVec2,
  opts: SnapWallAngleOpts = {},
): PlanVec2 {
  const { stepDeg = 15, minLength = 0.08 } = opts
  const dx = point[0] - anchor[0]
  const dz = point[1] - anchor[1]
  const len = Math.hypot(dx, dz)
  if (len < minLength) return point
  const step = (stepDeg * Math.PI) / 180
  const snapped = Math.round(Math.atan2(dz, dx) / step) * step
  return [anchor[0] + len * Math.cos(snapped), anchor[1] + len * Math.sin(snapped)]
}
