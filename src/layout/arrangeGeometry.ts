/**
 * Pure rectangle / edge geometry primitives for the auto-arranger.
 *
 * Extracted from `autoArrange.ts` so the rectangle math is independently
 * unit-testable and reusable, free of furniture/apartment/collision deps
 * (the proven pattern of `arrangeRoles.ts`, `floorPlanGeometry.ts`). All
 * coordinates are plan metres on the X/Z floor plane.
 */

import type { PlanRoom } from '../floorplan/types'

/** A wall edge of an axis-aligned room rectangle. */
export type Edge = 'N' | 'S' | 'E' | 'W'

/** Axis-aligned rectangle on the X/Z floor plane (`0` = min corner). */
export interface Rect {
  x0: number
  z0: number
  x1: number
  z1: number
}

/** Do two axis-aligned rectangles overlap (open intervals — touching edges
 *  do not count as an overlap)? */
export function rectsOverlap(a: Rect, b: Rect): boolean {
  return a.x0 < b.x1 && a.x1 > b.x0 && a.z0 < b.z1 && a.z1 > b.z0
}

/** Inward-facing rotation (radians) for an item flush against `edge` — the
 *  yaw that turns the item to face into the room. */
export function inward(edge: Edge): number {
  return edge === 'N' ? 0 : edge === 'S' ? Math.PI : edge === 'W' ? Math.PI / 2 : -Math.PI / 2
}

/** Clamp `v` into `[lo, hi]`. */
export function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v))
}

/** The rect edge nearest to a point (ties resolve to the first in N,S,W,E
 *  insertion order — stable). */
export function nearestEdge(pos: [number, number], rect: Rect): Edge {
  const d = { N: pos[1] - rect.z0, S: rect.z1 - pos[1], W: pos[0] - rect.x0, E: rect.x1 - pos[0] }
  return Object.entries(d).sort((a, b) => a[1] - b[1])[0][0] as Edge
}

/** The four corner candidate points of a rect, inset 0.3 m so a corner item
 *  doesn't clip the wall. */
export function cornersOf(rect: Rect): [number, number][] {
  return [
    [rect.x0 + 0.3, rect.z0 + 0.3],
    [rect.x1 - 0.3, rect.z0 + 0.3],
    [rect.x0 + 0.3, rect.z1 - 0.3],
    [rect.x1 - 0.3, rect.z1 - 0.3],
  ]
}

/** The opposite of a wall edge. */
export function opposite(e: Edge): Edge {
  return e === 'N' ? 'S' : e === 'S' ? 'N' : e === 'E' ? 'W' : 'E'
}

/** Usable interior rectangle for a plan room — the footprint inset 0.12 m from
 *  the walls. */
export function planRoomRect(r: PlanRoom): Rect {
  const inset = 0.12
  return {
    x0: r.origin[0] + inset,
    z0: r.origin[1] + inset,
    x1: r.origin[0] + r.width - inset,
    z1: r.origin[1] + r.depth - inset,
  }
}
