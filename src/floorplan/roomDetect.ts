import type { PlanVec2, PlanWall } from './types'
import { pointInPolygon, polygonArea } from './types'

/**
 * Derive the polygon of the room enclosing a seed point from the wall loop
 * around it. Treats the walls as a planar graph and extracts the smallest face
 * (minimal cycle) that contains the seed — i.e. the innermost room boundary.
 * Returns null when the seed isn't enclosed by a wall loop.
 *
 * Algorithm: build undirected adjacency from wall endpoints (snapped to a
 * tolerance so shared corners coincide), then trace every face by always taking
 * the sharpest clockwise turn at each node ("turn right"). Among the traced
 * faces, return the smallest-area one that contains the seed — the outer
 * boundary also contains the seed but is larger, so the minimal interior face
 * wins.
 */
export function detectRoomPolygon(walls: PlanWall[], seed: PlanVec2): PlanVec2[] | null {
  const EPS = 1e-3
  const key = (p: PlanVec2) => `${Math.round(p[0] / EPS)},${Math.round(p[1] / EPS)}`

  // Unique nodes + adjacency (undirected, dedup parallel edges).
  const nodes: PlanVec2[] = []
  const idOf = new Map<string, number>()
  const nodeId = (p: PlanVec2): number => {
    const k = key(p)
    let id = idOf.get(k)
    if (id === undefined) {
      id = nodes.length
      nodes.push([p[0], p[1]])
      idOf.set(k, id)
    }
    return id
  }
  const adj = new Map<number, Set<number>>()
  const link = (a: number, b: number) => {
    if (a === b) return
    ;(adj.get(a) ?? adj.set(a, new Set()).get(a)!).add(b)
    ;(adj.get(b) ?? adj.set(b, new Set()).get(b)!).add(a)
  }
  for (const w of walls) {
    if (Math.hypot(w.end[0] - w.start[0], w.end[1] - w.start[1]) < EPS) continue
    link(nodeId(w.start), nodeId(w.end))
  }
  if (nodes.length < 3) return null

  const angle = (from: number, to: number) =>
    Math.atan2(nodes[to][1] - nodes[from][1], nodes[to][0] - nodes[from][0])

  // From directed edge prev→cur, the next edge cur→w with the sharpest
  // clockwise turn (smallest positive turn from the back-direction).
  const nextCW = (prev: number, cur: number): number | null => {
    const back = angle(cur, prev)
    let best: number | null = null
    let bestTurn = Number.POSITIVE_INFINITY
    for (const w of adj.get(cur) ?? []) {
      if (w === prev && (adj.get(cur)?.size ?? 0) > 1) continue // avoid immediate backtrack unless dead-end
      const turn = (back - angle(cur, w) + 2 * Math.PI) % (2 * Math.PI)
      const t = turn === 0 ? 2 * Math.PI : turn
      if (t < bestTurn) {
        bestTurn = t
        best = w
      }
    }
    return best
  }

  const seen = new Set<string>()
  const faces: PlanVec2[][] = []
  for (const [u, set] of adj) {
    for (const v of set) {
      if (seen.has(`${u}->${v}`)) continue
      // Trace the face starting along u→v.
      const cycle: number[] = [u]
      let prev = u
      let cur = v
      let guard = 0
      while (guard++ < 4096) {
        seen.add(`${prev}->${cur}`)
        cycle.push(cur)
        const nxt = nextCW(prev, cur)
        if (nxt === null) break
        prev = cur
        cur = nxt
        if (prev === u && cur === v) break // closed the loop
      }
      if (cycle.length >= 4 && cycle[0] === u) {
        // Drop the trailing return-to-start duplicate if present.
        const poly = cycle.slice(0, -1).map((i) => nodes[i])
        if (poly.length >= 3) faces.push(poly)
      }
    }
  }

  // Smallest-area face that contains the seed (excludes the big outer boundary).
  let best: PlanVec2[] | null = null
  let bestArea = Number.POSITIVE_INFINITY
  for (const poly of faces) {
    const area = polygonArea(poly)
    if (area < 0.01) continue
    if (!pointInPolygon(seed[0], seed[1], poly)) continue
    if (area < bestArea) {
      bestArea = area
      best = poly
    }
  }
  return best
}
