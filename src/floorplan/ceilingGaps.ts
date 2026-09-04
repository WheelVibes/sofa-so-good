/**
 * Rectangles covering the footprint area NO ROOM covers, so a ceiling can be built over it.
 *
 * **The defect.** Ceilings render per ROOM (`PlanShell` maps `lp.rooms` to `PlanRoomCeiling`), so
 * any area inside the perimeter that no room rect covers has a floor — the plan slab spans the
 * whole footprint — and no ceiling. Raycast up from such a point in the running app and the ray
 * leaves the scene: it is open sky. `ceilingHole.test.ts` measures it across every template and
 * `v0.31.7.231` split it into two shapes, both of which this closes:
 *
 *  - **blocks** of unassigned floor, up to 4.9 m² in `tpl-hdb-4room` and 45.9 m² across
 *    `tpl-hdb-jumbo`;
 *  - **slits** where a room rect stops short of a wall face — `h4-svc-s`'s south face is at
 *    z = 2.95 while `h4-bed2` starts at z = 3.2, leaving a 0.25 m line of sky along the edge.
 *
 * **Why here and not in the templates.** The alternative is extending every room rect to its wall
 * faces, across 19 templates. Room rects are what the furniture arranger and the area reports
 * measure, so that ripples into ratchets counting 1506 chairs and 897 mounts. This changes no room.
 *
 * **Wall footprints are deliberately INCLUDED.** The region is simply footprint-minus-rooms, so
 * the fill abuts each room's ceiling exactly and cannot leave a hairline between them. A ceiling
 * plane over a wall is invisible — the wall is solid to ceiling height — so covering it costs
 * nothing and removes a whole class of off-by-a-margin error.
 */
import type { FloorPlan, PlanRoom } from './types'

/** Rasteriser pitch. 0.1 m resolves the 0.25 m slits with margin and keeps the grid small. */
export const GAP_STEP = 0.1

/** Axis-aligned rect in plan metres. */
export interface GapRect {
  x: number
  z: number
  width: number
  depth: number
}

function coversPoint(rooms: readonly PlanRoom[], x: number, z: number): boolean {
  return rooms.some((r) => {
    const [rx, rz] = r.origin
    if (x >= rx && x <= rx + r.width && z >= rz && z <= rz + r.depth) return true
    const e = r.extension
    if (!e) return false
    const ex = rx + e.offset[0]
    const ez = rz + e.offset[1]
    return x >= ex && x <= ex + e.width && z >= ez && z <= ez + e.depth
  })
}

/**
 * Merge the uncovered cells into as few rects as possible: maximal runs along x, then vertically
 * fused where consecutive rows have an identical run. A handful of rects per plan rather than
 * hundreds of cells, because each one becomes a mesh.
 */
export function ceilingGapRects(
  plan: FloorPlan,
  rooms: readonly PlanRoom[] = plan.rooms ?? [],
): GapRect[] {
  const [W, D] = plan.extent
  if (!(W > 0) || !(D > 0)) return []
  const nx = Math.max(0, Math.round(W / GAP_STEP))
  const nz = Math.max(0, Math.round(D / GAP_STEP))
  // Runs per row, keyed so an identical row can be recognised and fused.
  const rowRuns: [number, number][][] = []
  for (let k = 0; k < nz; k += 1) {
    const z = (k + 0.5) * GAP_STEP
    const runs: [number, number][] = []
    let start = -1
    for (let i = 0; i < nx; i += 1) {
      const x = (i + 0.5) * GAP_STEP
      const open = !coversPoint(rooms, x, z)
      if (open && start < 0) start = i
      if (!open && start >= 0) {
        runs.push([start, i])
        start = -1
      }
    }
    if (start >= 0) runs.push([start, nx])
    rowRuns.push(runs)
  }
  const sig = (runs: [number, number][]) => runs.map(([a, b]) => `${a}:${b}`).join(',')
  const out: GapRect[] = []
  let k = 0
  while (k < nz) {
    const runs = rowRuns[k] as [number, number][]
    if (runs.length === 0) {
      k += 1
      continue
    }
    const s = sig(runs)
    let end = k + 1
    while (end < nz && sig(rowRuns[end] as [number, number][]) === s) end += 1
    for (const [a, b] of runs) {
      out.push({
        x: a * GAP_STEP,
        z: k * GAP_STEP,
        width: (b - a) * GAP_STEP,
        depth: (end - k) * GAP_STEP,
      })
    }
    k = end
  }
  return out
}

/** Total area of the gap rects, m² — the quantity `ceilingHole.test.ts` tracks. */
export function ceilingGapArea(plan: FloorPlan, rooms?: readonly PlanRoom[]): number {
  return ceilingGapRects(plan, rooms).reduce((s, r) => s + r.width * r.depth, 0)
}
