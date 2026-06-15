import type { PlanVec2 } from './types'

/**
 * Detecting un-roomed enclosed floor area (areas walled-in but with no room
 * over them, so they'd otherwise be a hole now that the grounding slab is gone).
 *
 * `pointInBuilding` is a standard even-odd ray-crossing point-in-polygon, but
 * over the plan's **exterior** wall centre-lines (which form the perimeter loop)
 * — robust to L/U/notched outlines and to unordered segments, since a ray from
 * inside crosses the closed boundary an odd number of times. `unroomedCells`
 * samples a grid and returns the centres that are inside the building yet
 * outside every room (`isInRoom`) — the caller renders a red fallback ground.
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
    // Half-open in z so a vertex shared by two segments is counted once.
    if (z0 > z !== z1 > z) {
      const t = (z - z0) / (z1 - z0)
      const xCross = w.start[0] + t * (w.end[0] - w.start[0])
      if (x < xCross) inside = !inside
    }
  }
  return inside
}

export interface Bounds {
  minX: number
  minZ: number
  maxX: number
  maxZ: number
}

/** Grid-sample the plan and return the cell centres (XZ) that are inside the
 *  building perimeter but outside every room — i.e. walled-in floor with no room.
 *  `cell` is the grid pitch (m). `isInRoom` is the caller's point-in-room test. */
export function unroomedCells(
  extWalls: readonly WallSeg[],
  isInRoom: (x: number, z: number) => boolean,
  bounds: Bounds,
  cell = 0.25,
): PlanVec2[] {
  const out: PlanVec2[] = []
  if (extWalls.length < 3) return out // no enclosing loop yet
  for (let x = bounds.minX + cell / 2; x < bounds.maxX; x += cell) {
    for (let z = bounds.minZ + cell / 2; z < bounds.maxZ; z += cell) {
      if (pointInBuilding(x, z, extWalls) && !isInRoom(x, z)) out.push([x, z])
    }
  }
  return out
}
