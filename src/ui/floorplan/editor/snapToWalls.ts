/**
 * Snapping a wall-draft endpoint onto existing geometry, so walls connect
 * cleanly when drawn. Two stages, vertex first:
 *
 *  1. **Vertex snap** — an existing wall *endpoint* within `vertexRadius` wins,
 *     so a new wall locks onto a corner (the common, highest-value join).
 *  2. **Edge snap** — only when no corner captured the cursor and `edges` is on:
 *     the nearest point on a wall *span* within `edgeRadius` wins, so a new wall
 *     can tee into the middle of an existing one (a T-junction).
 *
 * Dragging clearly past a wall stays free (nothing within either radius), so a
 * new wall can still extend beyond the one it crosses — snapping only engages
 * near existing geometry.
 *
 * Pure (no React/three) so it unit-tests in isolation; the caller supplies an
 * already-grid-snapped point in world metres.
 */
import type { PlanVec2, PlanWall } from '../../../floorplan/types'
import { isCurvedWall, nearestArcLength, pointAtArcLength } from '../../../floorplan/wallArc'

export interface SnapToWallsOpts {
  /** Skip this wall (e.g. the one whose own vertex is being dragged). */
  excludeWallId?: string
  /** Also snap onto wall spans, not just endpoints (wall drawing only). */
  edges?: boolean
  /** Corner capture radius, metres (default 0.3). */
  vertexRadius?: number
  /** Span capture radius, metres — kept under `vertexRadius` so corners win. */
  edgeRadius?: number
}

export function snapToWalls(
  point: PlanVec2,
  walls: readonly PlanWall[],
  opts: SnapToWallsOpts = {},
): PlanVec2 {
  const { excludeWallId, edges = false, vertexRadius = 0.3, edgeRadius = 0.25 } = opts
  let [wx, wz] = point

  let best = vertexRadius
  let snappedVertex = false
  for (const w of walls) {
    if (w.id === excludeWallId) continue
    for (const p of [w.start, w.end]) {
      const dd = Math.hypot(p[0] - wx, p[1] - wz)
      if (dd < best) {
        best = dd
        wx = p[0]
        wz = p[1]
        snappedVertex = true
      }
    }
  }

  if (edges && !snappedVertex) {
    let eBest = edgeRadius
    for (const w of walls) {
      if (w.id === excludeWallId) continue
      if (isCurvedWall(w)) {
        const { offset, dist } = nearestArcLength(w, [wx, wz])
        if (dist < eBest) {
          eBest = dist
          const p = pointAtArcLength(w, offset)
          wx = p.x
          wz = p.z
        }
        continue
      }
      const dx = w.end[0] - w.start[0]
      const dz = w.end[1] - w.start[1]
      const len2 = dx * dx + dz * dz
      if (len2 === 0) continue
      const t = Math.max(0, Math.min(1, ((wx - w.start[0]) * dx + (wz - w.start[1]) * dz) / len2))
      const px = w.start[0] + t * dx
      const pz = w.start[1] + t * dz
      const dd = Math.hypot(px - wx, pz - wz)
      if (dd < eBest) {
        eBest = dd
        wx = px
        wz = pz
      }
    }
  }

  return [wx, wz]
}
