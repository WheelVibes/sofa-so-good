/**
 * Rectilinear-polygon helpers shared by the two room models.
 *
 * A room may be declared as an explicit outline rather than rectangles, but most
 * things that consume a room want RECTS — floor planes, ceiling tiles, wall-edge
 * clipping, point-in-room with a tolerance, clamping a stranded item back inside.
 * For an axis-aligned outline the two are interchangeable, and this is the
 * conversion. A NON-rectilinear outline (a diagonal wall) has no exact rect
 * cover, so callers fall back to the bounding box and must say so.
 *
 * Pure; no imports beyond the plan types.
 */
import { type PlanVec2, pointInPolygon } from './types'

/** An axis-aligned rect in absolute world metres. */
export interface Rect2 {
  x0: number
  z0: number
  x1: number
  z1: number
}

/** Coordinate-quantisation epsilon. Room coordinates are authored in whole
 *  millimetres, so anything below this is float noise, not geometry. */
const EPS = 1e-6

/** True when every edge runs along X or Z — the case rectangles can reproduce. */
export function isRectilinear(polygon: readonly PlanVec2[]): boolean {
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i]
    const b = polygon[(i + 1) % polygon.length]
    if (Math.abs(a[0] - b[0]) > EPS && Math.abs(a[1] - b[1]) > EPS) return false
  }
  return true
}

/** Bounding box of a polygon. Module-private: the only caller is the
 *  non-rectilinear fallback in {@link decomposeRectilinear}. */
function polygonBounds2(polygon: readonly PlanVec2[]): Rect2 {
  const xs = polygon.map((p) => p[0])
  const zs = polygon.map((p) => p[1])
  return { x0: Math.min(...xs), z0: Math.min(...zs), x1: Math.max(...xs), z1: Math.max(...zs) }
}

/**
 * Decompose a RECTILINEAR polygon into non-overlapping rects that tile it
 * exactly. Overlays the vertex coordinates into a grid, keeps the cells whose
 * centre is inside, then merges each column's runs and merges columns that share
 * a run — so a plain L comes back as 2 rects, not a cell soup.
 *
 * A non-rectilinear polygon returns its bounding box (the only rect answer
 * available); check {@link isRectilinear} first when that distinction matters.
 */
export function decomposeRectilinear(polygon: readonly PlanVec2[]): Rect2[] {
  if (polygon.length < 3) return []
  if (!isRectilinear(polygon)) return [polygonBounds2(polygon)]
  const poly = polygon.map(([x, z]) => [x, z] as PlanVec2)
  const xs = [...new Set(polygon.map((p) => p[0]))].sort((a, b) => a - b)
  const zs = [...new Set(polygon.map((p) => p[1]))].sort((a, b) => a - b)
  // Per x-band, the z-runs that are inside the polygon (merged vertically).
  const columns: Rect2[][] = []
  for (let i = 0; i < xs.length - 1; i++) {
    const x0 = xs[i]
    const x1 = xs[i + 1]
    const cx = (x0 + x1) / 2
    const runs: Rect2[] = []
    for (let j = 0; j < zs.length - 1; j++) {
      const z0 = zs[j]
      const z1 = zs[j + 1]
      if (!pointInPolygon(cx, (z0 + z1) / 2, poly)) continue
      const prev = runs[runs.length - 1]
      if (prev && Math.abs(prev.z1 - z0) < EPS) prev.z1 = z1
      else runs.push({ x0, z0, x1, z1 })
    }
    columns.push(runs)
  }
  // Merge horizontally: a column whose runs match the previous column's spans
  // extends them instead of starting new rects.
  const out: Rect2[] = []
  let pending: Rect2[] = []
  for (const runs of columns) {
    const sameSpans =
      pending.length === runs.length &&
      pending.every(
        (p, k) => Math.abs(p.z0 - runs[k].z0) < EPS && Math.abs(p.z1 - runs[k].z1) < EPS,
      )
    if (sameSpans && pending.length > 0 && Math.abs(pending[0].x1 - runs[0].x0) < EPS) {
      for (const p of pending) p.x1 = runs[0].x1
      continue
    }
    out.push(...pending)
    pending = runs
  }
  out.push(...pending)
  return out
}
