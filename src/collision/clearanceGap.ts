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

export function nearestWallGap(box: Aabb, walls: CollisionWall[]): number | null {
  let best: number | null = null
  const consider = (g: number) => {
    if (g >= -0.02 && (best === null || g < best)) best = Math.max(0, g)
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
        consider(face - t - box.x1) // wall to the +X side
      else if (face <= box.x0) consider(box.x0 - (face + t)) // wall to the −X side
    } else if (horizontal) {
      const xmin = Math.min(w.ax, w.bx)
      const xmax = Math.max(w.ax, w.bx)
      if (box.x1 < xmin || box.x0 > xmax) continue
      const face = w.az
      if (face >= box.z1) consider(face - t - box.z1)
      else if (face <= box.z0) consider(box.z0 - (face + t))
    }
  }
  return best
}
