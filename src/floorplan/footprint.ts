import type { PlanVec2 } from './types'

/**
 * Building-footprint geometry for the un-roomed fallback / flag.
 *
 * `traceBuildingOutline` walks the plan's **exterior** wall centre-lines into a
 * single ordered polygon — the exact enclosed outline (handles L/U/notched
 * shapes), so the fallback ground / red flag has crisp edges instead of a grid.
 * The caller renders this polygon BENEATH the room floors/fills, so roomed area
 * is covered and only un-roomed area shows through. `pointInBuilding` is a
 * standard even-odd ray test kept for point queries.
 *
 * Pure (no three/React) so it is fully unit-tested.
 */

export interface WallSeg {
  start: PlanVec2
  end: PlanVec2
}

/** Even-odd ray test: cast a ray to +X from (x, z) and count crossings with the
 *  exterior wall segments. Odd = inside the building perimeter. */
export function pointInBuilding(x: number, z: number, extWalls: readonly WallSeg[]): boolean {
  let inside = false
  for (const w of extWalls) {
    const z0 = w.start[1]
    const z1 = w.end[1]
    if (z0 > z !== z1 > z) {
      const t = (z - z0) / (z1 - z0)
      const xCross = w.start[0] + t * (w.end[0] - w.start[0])
      if (x < xCross) inside = !inside
    }
  }
  return inside
}

const key = (p: PlanVec2) => `${Math.round(p[0] * 1000)},${Math.round(p[1] * 1000)}`

/**
 * Trace the exterior walls into one ordered outline polygon by walking shared
 * endpoints (the perimeter is a closed loop of degree-2 vertices). Returns the
 * polygon points in order, or `null` if the exterior walls don't form a single
 * closed loop (mid-draw / branching / disconnected) — the caller then skips the
 * fallback rather than guess.
 */
export function traceBuildingOutline(extWalls: readonly WallSeg[]): PlanVec2[] | null {
  if (extWalls.length < 3) return null
  // Directed adjacency: from a point, which walls leave it (and to where).
  const adj = new Map<string, { idx: number; to: PlanVec2 }[]>()
  extWalls.forEach((w, idx) => {
    for (const [a, b] of [
      [w.start, w.end],
      [w.end, w.start],
    ] as const) {
      const list = adj.get(key(a)) ?? []
      list.push({ idx, to: b })
      adj.set(key(a), list)
    }
  })

  const used = new Set<number>()
  const startKey = key(extWalls[0].start)
  const outline: PlanVec2[] = [extWalls[0].start]
  let cur = extWalls[0].end
  used.add(0)

  for (let i = 0; i < extWalls.length; i++) {
    if (key(cur) === startKey) return outline.length >= 3 ? outline : null
    outline.push(cur)
    const next = (adj.get(key(cur)) ?? []).find((e) => !used.has(e.idx))
    if (!next) return null // open chain / dead-end
    used.add(next.idx)
    cur = next.to
  }
  // Returned to start exactly when every wall is consumed.
  return key(cur) === startKey && outline.length >= 3 ? outline : null
}
