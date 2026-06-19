/**
 * Nearest-wall clearance for the live drag readout. Given an item's footprint
 * AABB and the (axis-aligned) collision wall segments, returns the smallest gap
 * from a footprint edge to a facing wall face. Pure + unit-tested.
 */
import type { CollisionWall } from './walls'

export interface Aabb {
  x0: number
  z0: number
  x1: number
  z1: number
}

/** Per-side gaps (metres) from the footprint edges to the nearest facing wall.
 *  `null` on a side means no wall faces the item there (e.g. an open span).
 *  - `left`  : toward −X  - `right` : toward +X
 *  - `back`  : toward −Z  - `front` : toward +Z */
export interface WallGaps {
  left: number | null
  right: number | null
  back: number | null
  front: number | null
}

/** Negative overlaps (item past the wall face) clamp to 0; tiny negative
 *  jitter within the tolerance is treated as a touch (0). Anything more
 *  negative is the item genuinely on the far side and is ignored. */
const TOUCH_TOL = 0.02

/**
 * Nearest facing wall gap on every side of the footprint. For each axis-aligned
 * wall segment that the item is "in front of" along the perpendicular axis, the
 * gap to the relevant footprint edge is computed and the minimum kept per side.
 * Reused by `nearestWallGap` (overall minimum) and the per-side HUD readout.
 */
export function wallGapsPerSide(box: Aabb, walls: CollisionWall[]): WallGaps {
  const gaps: WallGaps = { left: null, right: null, back: null, front: null }
  const consider = (side: keyof WallGaps, g: number) => {
    if (g < -TOUCH_TOL) return
    const v = Math.max(0, g)
    const cur = gaps[side]
    if (cur === null || v < cur) gaps[side] = v
  }
  for (const w of walls) {
    const vertical = Math.abs(w.ax - w.bx) < 0.02
    const horizontal = Math.abs(w.az - w.bz) < 0.02
    const t = w.thickness / 2
    if (vertical) {
      const zmin = Math.min(w.az, w.bz)
      const zmax = Math.max(w.az, w.bz)
      // Only count walls the item is "in front of" along Z.
      if (box.z1 < zmin || box.z0 > zmax) continue
      const face = w.ax // wall centreline; faces are ±t
      if (face >= box.x1)
        consider('right', face - t - box.x1) // wall to the +X side
      else if (face <= box.x0) consider('left', box.x0 - (face + t)) // wall to the −X side
    } else if (horizontal) {
      const xmin = Math.min(w.ax, w.bx)
      const xmax = Math.max(w.ax, w.bx)
      if (box.x1 < xmin || box.x0 > xmax) continue
      const face = w.az
      if (face >= box.z1)
        consider('front', face - t - box.z1) // wall to the +Z side
      else if (face <= box.z0) consider('back', box.z0 - (face + t)) // wall to the −Z side
    }
  }
  return gaps
}

/** Smallest gap from a footprint edge to any facing wall, or `null` when no
 *  wall faces the item. Thin wrapper over `wallGapsPerSide`. */
export function nearestWallGap(box: Aabb, walls: CollisionWall[]): number | null {
  const g = wallGapsPerSide(box, walls)
  let best: number | null = null
  for (const v of [g.left, g.right, g.back, g.front]) {
    if (v !== null && (best === null || v < best)) best = v
  }
  return best
}
