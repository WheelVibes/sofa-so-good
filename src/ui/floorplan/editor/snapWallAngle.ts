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

/**
 * Angle-snap target for dragging an EXISTING wall's endpoint (PARITY-PLAN-VERTEX-ANGLESNAP).
 * The dragged end (`which`) is aimed onto the nearest `stepDeg` increment about the wall's
 * OTHER (fixed) end — the same ortho/15° snap wall-drawing uses — so an existing wall can be
 * squared up, not just freshly-drawn ones. `bypass` (Shift held) returns the raw cursor for a
 * free drag. The caller's `moveWallVertex` still applies its own corner/wall-join snap afterwards
 * (order: angle → wall-snap), so this helper never needs to know about other walls.
 *
 * Pure (no React/three/store) — parameterised on the two endpoints + cursor.
 */
export function vertexDragTarget(
  start: PlanVec2,
  end: PlanVec2,
  which: 'start' | 'end',
  cursor: PlanVec2,
  bypass: boolean,
  opts: SnapWallAngleOpts = {},
): PlanVec2 {
  if (bypass) return cursor
  const anchor = which === 'end' ? start : end
  return snapWallAngle(anchor, cursor, opts)
}
