/**
 * Plan-level corner fillet / bevel (PARITY-CORNER-FILLET): round or chamfer the
 * corner where two plan walls share an endpoint.
 *
 * `applyWallFillet` finds the shared corner vertex of two walls, trims each wall
 * back to a tangent/setback point, and inserts a connecting wall between them —
 * a STRAIGHT chord for `bevel`, or a CURVED wall (signed `arc` bowing toward the
 * original corner) for `round`. It reuses the tested geometry primitives in
 * `cornerFillet.ts` and the arc-sign convention of `wallArc.ts`.
 *
 * Pure (no three/React imports); never mutates its inputs.
 */
import { cornerBevelPoints, cornerFilletArc } from './cornerFillet'
import type { PlanVec2, PlanWall } from './types'

const COINCIDENT_EPS = 1e-3

/** Unit left-normal of the chord (perpendicular, +90° from start→end), matching
 *  the `wallArc.ts` sign convention. */
function leftNormal(start: PlanVec2, end: PlanVec2): PlanVec2 {
  const dx = end[0] - start[0]
  const dz = end[1] - start[1]
  const len = Math.hypot(dx, dz) || 1
  return [-dz / len, dx / len]
}

/** Which end of a wall coincides with `p` (within `COINCIDENT_EPS`), or null. */
function sharedEnd(w: PlanWall, p: PlanVec2): 'start' | 'end' | null {
  if (Math.hypot(w.start[0] - p[0], w.start[1] - p[1]) <= COINCIDENT_EPS) return 'start'
  if (Math.hypot(w.end[0] - p[0], w.end[1] - p[1]) <= COINCIDENT_EPS) return 'end'
  return null
}

/** The two endpoints of `a` and `b` that coincide (the corner), plus which end
 *  of each it is. Returns null if no pair of endpoints is near-coincident. */
function findCorner(
  a: PlanWall,
  b: PlanWall,
): { corner: PlanVec2; endA: 'start' | 'end'; endB: 'start' | 'end' } | null {
  for (const endA of ['start', 'end'] as const) {
    const pa = a[endA]
    const endB = sharedEnd(b, pa)
    if (endB) return { corner: pa, endA, endB }
  }
  return null
}

/** Clone a wall with its shared end (`which`) moved to `to`. */
function moveEnd(w: PlanWall, which: 'start' | 'end', to: PlanVec2): PlanWall {
  return {
    ...w,
    start: which === 'start' ? [to[0], to[1]] : [w.start[0], w.start[1]],
    end: which === 'end' ? [to[0], to[1]] : [w.end[0], w.end[1]],
  }
}

/**
 * Round or bevel the corner shared by walls `idA` and `idB`.
 *
 * Returns a fresh `PlanWall[]` (inputs untouched) where `idA`/`idB` are trimmed
 * back to the tangent/setback points and a connecting wall (appended last, id
 * `` `${idA}__fillet` ``) bridges them — straight for `bevel`, curved (signed
 * `arc`, bowing toward the original corner) for `round`.
 *
 * Returns `null` when: an id is missing, `idA === idB`, either wall is locked,
 * `amount <= 0`, the walls don't share an endpoint, or the geometry primitive
 * rejects the corner (degenerate / radius too large).
 */
export function applyWallFillet(
  walls: PlanWall[],
  idA: string,
  idB: string,
  amount: number,
  mode: 'round' | 'bevel',
): PlanWall[] | null {
  if (idA === idB) return null
  if (!(amount > 0)) return null
  const wallA = walls.find((w) => w.id === idA)
  const wallB = walls.find((w) => w.id === idB)
  if (!wallA || !wallB) return null
  if (wallA.locked || wallB.locked) return null

  const found = findCorner(wallA, wallB)
  if (!found) return null
  const { corner, endA, endB } = found

  // Far endpoints (the non-shared ends) define each ray from the corner.
  const a: PlanVec2 = endA === 'start' ? wallA.end : wallA.start
  const b: PlanVec2 = endB === 'start' ? wallB.end : wallB.start

  let tA: PlanVec2
  let tB: PlanVec2
  let connectorArc: number | undefined

  if (mode === 'bevel') {
    const bevel = cornerBevelPoints(a, corner, b, amount)
    if (!bevel) return null
    tA = bevel.start
    tB = bevel.end
  } else {
    const fillet = cornerFilletArc(a, corner, b, amount)
    if (!fillet) return null
    tA = fillet.start
    tB = fillet.end
    // Sagitta of the connecting chord: s = r − √(r² − (chord/2)²).
    const r = amount
    const chord = Math.hypot(tB[0] - tA[0], tB[1] - tA[1])
    const half = chord / 2
    const s = r - Math.sqrt(Math.max(0, r * r - half * half))
    // Sign so the bulge points from the chord toward the original corner:
    // project (corner − chordMid) onto the chord's LEFT-normal (wallArc.ts
    // convention). Positive → arc = +s, else −s.
    const midX = (tA[0] + tB[0]) / 2
    const midZ = (tA[1] + tB[1]) / 2
    const n = leftNormal(tA, tB)
    const proj = (corner[0] - midX) * n[0] + (corner[1] - midZ) * n[1]
    connectorArc = proj >= 0 ? s : -s
  }

  const trimmedA = moveEnd(wallA, endA, tA)
  const trimmedB = moveEnd(wallB, endB, tB)

  const connector: PlanWall = {
    id: `${idA}__fillet`,
    start: [tA[0], tA[1]],
    end: [tB[0], tB[1]],
    thickness: wallA.thickness,
    ...(wallA.thicknessM !== undefined ? { thicknessM: wallA.thicknessM } : {}),
    ...(wallA.color !== undefined ? { color: wallA.color } : {}),
    ...(connectorArc !== undefined ? { arc: connectorArc } : {}),
  }

  return walls.map((w) => (w.id === idA ? trimmedA : w.id === idB ? trimmedB : w)).concat(connector)
}
