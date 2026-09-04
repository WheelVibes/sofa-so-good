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
 * **There is PRIOR ART for exactly this, on the floor side.** `PlanShell`'s `UnroomedFloor` traces
 * the wall-enclosed footprint and renders it at y = −0.01, "1 cm below room floors → they cover
 * it", describing itself as a "neutral fallback ground ... so it shows ONLY where no room covers
 * it — filling the void left by removing the grounding slab (no hole)". That is this module's
 * design, one axis away, and it was already in the codebase: the FLOOR half of the problem was
 * solved and the CEILING half was simply never done. Measured in `v0.31.7.237`: a downward ray in
 * an uncovered area hits −0.01 (the fallback) while one inside a room hits +0.01 (the room floor),
 * and outside the building a downward ray hits nothing at all, which is what shows the fallback is
 * footprint-bounded rather than an infinite ground plane.
 *
 * The one difference is deliberate. `UnroomedFloor` is a single traced outline mesh; this emits
 * rects. A ceiling cannot use one footprint-wide plane, because a double-height room needs its own
 * lid at its own height (item `(w)`), so the region has to be the actual difference rather than
 * the whole outline.
 *
 * **Why here and not in the templates.** The alternative is extending every room rect to its wall
 * faces, across 19 templates. Room rects are what the furniture arranger and the area reports
 * measure, so that ripples into ratchets counting 1506 chairs and 897 mounts. This changes no room.
 *
 * **Cost, measured in the app** (`v0.31.7.250`, `tpl-hdb-4room`, 36-frame walk tour, control by
 * reverting this render and re-running the same tour):
 *
 * | | visible meshes in frustum | triangles |
 * | --- | --- | --- |
 * | with gap ceilings | 242 | 110 974 |
 * | without | 230 | 110 949 |
 * | delta | **+12 (+5.2 %)** | **+25 (+0.02 %)** |
 *
 * The static rect count is 30 for this plan, so only about a third are in frustum at a time. Twelve
 * extra draw calls of two triangles each is the whole geometric cost; the triangle delta is inside
 * rounding. Deliberately measured as GEOMETRY rather than frame time, because a Blender bake was
 * saturating the CPU and a timing number taken then would have been worthless — mesh and triangle
 * counts are exact regardless of load.
 *
 * **Wall footprints are deliberately INCLUDED.** The region is simply footprint-minus-rooms, so
 * the fill abuts each room's ceiling exactly and cannot leave a hairline between them. A ceiling
 * plane over a wall is invisible — the wall is solid to ceiling height — so covering it costs
 * nothing and removes a whole class of off-by-a-margin error.
 */
import type { FloorPlan, PlanRoom } from './types'

/** Rasteriser pitch. 0.1 m resolves the 0.25 m slits with margin and keeps the grid small. */
const GAP_STEP = 0.1

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
