/**
 * Plan integrity checks: find "stray" elements so the apartment can be made
 * whole. A complete plan has every wall joined to another wall, every room
 * touching another room, and every door/window sitting on a real wall.
 *
 *  - stray wall    → neither endpoint meets another wall (no shared corner and
 *                    no tee onto another wall's span).
 *  - stray room    → its footprint touches no other room's footprint (rooms are
 *                    separated only by wall thickness, so a tolerance bridges it).
 *  - stray opening → its host wall is missing, or it sits off the wall's span.
 *
 * Single-element plans (one wall / one room) aren't flagged — there's simply
 * nothing to connect to yet (an in-progress, not stray, plan).
 *
 * Pure (no React/three) so it unit-tests in isolation.
 */
import type { PlanOpening, PlanRoom, PlanVec2, PlanWall } from './types'
import { roomPolygon, wallLength } from './types'

/** Endpoints "meet" within ~6 cm (snap tolerance + float slop). */
const JOIN_EPS = 0.06
/** Rooms are separated by a wall (≤~0.3 m); this bridges that to "touching". */
const ROOM_TOUCH_TOL = 0.4

function near(a: PlanVec2, b: PlanVec2, eps = JOIN_EPS): boolean {
  return Math.abs(a[0] - b[0]) < eps && Math.abs(a[1] - b[1]) < eps
}

/** Distance from point `p` to segment `a→b` ≤ eps (a tee/touch onto the span). */
function pointOnSegment(p: PlanVec2, a: PlanVec2, b: PlanVec2, eps = JOIN_EPS): boolean {
  const dx = b[0] - a[0]
  const dz = b[1] - a[1]
  const len2 = dx * dx + dz * dz
  if (len2 < 1e-9) return false
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / len2))
  const px = a[0] + t * dx
  const pz = a[1] + t * dz
  return Math.hypot(p[0] - px, p[1] - pz) <= eps
}

/** Whether two walls connect: a shared endpoint, or one wall's endpoint lands on
 *  the other's span (a tee). Curved walls are judged on their chord endpoints. */
export function wallsConnected(a: PlanWall, b: PlanWall): boolean {
  const ae: PlanVec2[] = [a.start, a.end]
  const be: PlanVec2[] = [b.start, b.end]
  for (const p of ae) for (const q of be) if (near(p, q)) return true
  for (const p of ae) if (pointOnSegment(p, b.start, b.end)) return true
  for (const q of be) if (pointOnSegment(q, a.start, a.end)) return true
  return false
}

/** Ids of walls that connect to no other wall (degenerate walls are skipped). */
export function findStrayWalls(walls: readonly PlanWall[]): string[] {
  const real = walls.filter((w) => wallLength(w) > 1e-3)
  if (real.length <= 1) return []
  return real
    .filter((w) => !real.some((o) => o.id !== w.id && wallsConnected(w, o)))
    .map((w) => w.id)
}

function roomBounds(r: PlanRoom): [number, number, number, number] {
  const poly = roomPolygon(r)
  let minX = Number.POSITIVE_INFINITY
  let minZ = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxZ = Number.NEGATIVE_INFINITY
  for (const [x, z] of poly) {
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (z < minZ) minZ = z
    if (z > maxZ) maxZ = z
  }
  return [minX, minZ, maxX, maxZ]
}

/** Whether two rooms touch/adjoin (their footprints, grown by the wall-thickness
 *  tolerance, overlap). A heuristic on bounding boxes — good enough to spot a
 *  room dropped off on its own, away from the apartment. */
export function roomsAdjacent(a: PlanRoom, b: PlanRoom, tol = ROOM_TOUCH_TOL): boolean {
  const [ax0, az0, ax1, az1] = roomBounds(a)
  const [bx0, bz0, bx1, bz1] = roomBounds(b)
  return ax0 - tol <= bx1 && bx0 - tol <= ax1 && az0 - tol <= bz1 && bz0 - tol <= az1
}

/** Ids of rooms that touch no other room. */
export function findStrayRooms(rooms: readonly PlanRoom[]): string[] {
  if (rooms.length <= 1) return []
  return rooms
    .filter((r) => !rooms.some((o) => o.id !== r.id && roomsAdjacent(r, o)))
    .map((r) => r.id)
}

/** Ids of openings whose host wall is missing or that fall off the wall's span. */
export function findStrayOpenings(
  walls: readonly PlanWall[],
  openings: readonly PlanOpening[],
): string[] {
  const byId = new Map(walls.map((w) => [w.id, w]))
  return openings
    .filter((o) => {
      const w = byId.get(o.wallId)
      if (!w) return true // orphaned — host wall deleted/merged away
      const len = wallLength(w)
      // Must sit within the wall (a little overhang tolerated).
      return o.offset < -JOIN_EPS || o.offset > len + JOIN_EPS
    })
    .map((o) => o.id)
}

export interface PlanIntegrityFlags {
  walls: Set<string>
  rooms: Set<string>
  openings: Set<string>
}

/** All stray-element ids for one storey's geometry. */
export function planIntegrityFlags(
  walls: readonly PlanWall[],
  rooms: readonly PlanRoom[],
  openings: readonly PlanOpening[],
): PlanIntegrityFlags {
  return {
    walls: new Set(findStrayWalls(walls)),
    rooms: new Set(findStrayRooms(rooms)),
    openings: new Set(findStrayOpenings(walls, openings)),
  }
}
