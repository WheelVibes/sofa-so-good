/**
 * Flush-to-wall snapping for furniture drags. Given an item's footprint AABB and
 * the (axis-aligned, door-aware) collision walls, returns the offset that pulls
 * the box flush against the nearest wall face — independently per axis, so a
 * piece dragged into a corner snaps to both walls at once. Pure + unit-tested;
 * the live drag in `DragController` applies it (when grid-snap is off).
 */
import type { Aabb } from './clearanceGap'
import type { CollisionWall } from './walls'

/** Default snap radius (m): only pulls flush when a footprint edge is this close
 *  to a wall face, so mid-room placement is never disturbed. */
const WALL_SNAP_DISTANCE = 0.12

export function wallSnapOffset(
  box: Aabb,
  walls: CollisionWall[],
  threshold = WALL_SNAP_DISTANCE,
): { dx: number; dz: number } {
  let bestX: number | null = null // signed offset with the smallest magnitude
  let bestZ: number | null = null
  const considerX = (off: number) => {
    if (Math.abs(off) <= threshold && (bestX === null || Math.abs(off) < Math.abs(bestX)))
      bestX = off
  }
  const considerZ = (off: number) => {
    if (Math.abs(off) <= threshold && (bestZ === null || Math.abs(off) < Math.abs(bestZ)))
      bestZ = off
  }
  for (const w of walls) {
    const vertical = Math.abs(w.ax - w.bx) < 0.02
    const horizontal = Math.abs(w.az - w.bz) < 0.02
    const t = w.thickness / 2
    if (vertical) {
      const zmin = Math.min(w.az, w.bz)
      const zmax = Math.max(w.az, w.bz)
      if (box.z1 < zmin || box.z0 > zmax) continue // not in front of this wall
      const face = w.ax
      if (face >= box.x1) {
        const gap = face - t - box.x1 // wall on the +X side
        if (gap >= -0.02) considerX(gap)
      } else if (face <= box.x0) {
        const gap = box.x0 - (face + t) // wall on the −X side
        if (gap >= -0.02) considerX(-gap)
      }
    } else if (horizontal) {
      const xmin = Math.min(w.ax, w.bx)
      const xmax = Math.max(w.ax, w.bx)
      if (box.x1 < xmin || box.x0 > xmax) continue
      const face = w.az
      if (face >= box.z1) {
        const gap = face - t - box.z1
        if (gap >= -0.02) considerZ(gap)
      } else if (face <= box.z0) {
        const gap = box.z0 - (face + t)
        if (gap >= -0.02) considerZ(-gap)
      }
    }
  }
  return { dx: bestX ?? 0, dz: bestZ ?? 0 }
}
