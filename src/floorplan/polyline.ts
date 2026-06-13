/**
 * Pure geometry helpers for free-form plan polyline annotations
 * (PARITY-POLYLINE). Render-agnostic (no three / React / DOM): the 2D editor
 * and any SVG consumer share these so length readouts and point-strings stay
 * consistent. See `types.ts` `PlanPolyline`.
 */
import type { PlanVec2 } from './types'

/** Total path length of a polyline (m): the sum of its segment lengths. When
 *  `closed`, the closing segment from the last point back to the first is
 *  included (needs ≥3 points to form a loop). Fewer than 2 points → 0. */
export function polylineLength(points: PlanVec2[], closed = false): number {
  if (points.length < 2) return 0
  let total = 0
  for (let i = 1; i < points.length; i++) {
    total += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1])
  }
  if (closed && points.length >= 3) {
    const a = points[points.length - 1]
    const b = points[0]
    total += Math.hypot(b[0] - a[0], b[1] - a[1])
  }
  return total
}

/** Axis-aligned bounding box `[minX, minZ, maxX, maxZ]` of the points, or
 *  `null` when empty. */
export function polylineBounds(points: PlanVec2[]): [number, number, number, number] | null {
  if (points.length === 0) return null
  let minX = points[0][0]
  let minZ = points[0][1]
  let maxX = points[0][0]
  let maxZ = points[0][1]
  for (const [x, z] of points) {
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (z < minZ) minZ = z
    if (z > maxZ) maxZ = z
  }
  return [minX, minZ, maxX, maxZ]
}

/** SVG `points`/`d`-style coordinate string ("x1,y1 x2,y2 …") built by mapping
 *  each world vertex through `project` (e.g. the editor's world→pixel toPx).
 *  Decoupled from any specific coordinate frame so canvas + report can reuse it. */
export function polylinePointsAttr(
  points: PlanVec2[],
  project: (p: PlanVec2) => [number, number],
): string {
  return points
    .map((p) => {
      const [x, y] = project(p)
      return `${x},${y}`
    })
    .join(' ')
}
