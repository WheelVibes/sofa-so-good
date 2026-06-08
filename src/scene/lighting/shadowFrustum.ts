import type { FloorPlan } from '../../floorplan/types'

/**
 * Plan-aware sun-shadow frustum (B34). The directional light's shadow map has a
 * fixed resolution, so its orthographic frustum must wrap *exactly* the active
 * floor plan — a fixed apartment-centred box misses shadows on a custom plan
 * that's larger than the default flat or offset away from the origin.
 *
 * Pure + unit-tested: `shadowFrustumForPlan` returns the world-space centre to
 * aim the light at and the half-extent of the (square) ortho frustum. The
 * renderer (`Lighting.tsx`) feeds these into the light target + shadow-camera
 * bounds, remounting the light when the half-extent changes.
 */
export interface ShadowFrustum {
  /** World centre the light targets (y = 0). */
  center: [number, number, number]
  /** Half-width of the square orthographic shadow frustum (m). */
  halfExtent: number
}

/** Furniture + low-angle-shadow swing margin added around the plan (m). */
const MARGIN = 2.5
/** Never shrink below the original default-apartment frustum. */
const MIN_HALF = 9.5
/** Cap so a huge plan can't blow shadow-map texels out to mush. */
const MAX_HALF = 40

interface Rect {
  minX: number
  minZ: number
  maxX: number
  maxZ: number
}

/** Tight world-space XZ bounds of everything the plan draws (walls + rooms). */
export function planShadowBounds(plan: FloorPlan): Rect {
  let minX = Number.POSITIVE_INFINITY
  let minZ = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxZ = Number.NEGATIVE_INFINITY
  const acc = (x: number, z: number) => {
    if (x < minX) minX = x
    if (z < minZ) minZ = z
    if (x > maxX) maxX = x
    if (z > maxZ) maxZ = z
  }
  for (const w of plan.walls) {
    acc(w.start[0], w.start[1])
    acc(w.end[0], w.end[1])
  }
  for (const r of plan.rooms) {
    if (r.polygon && r.polygon.length >= 3) {
      for (const [px, pz] of r.polygon) acc(px, pz)
      continue
    }
    acc(r.origin[0], r.origin[1])
    acc(r.origin[0] + r.width, r.origin[1] + r.depth)
    if (r.extension) {
      acc(r.origin[0] + r.extension.offset[0], r.origin[1] + r.extension.offset[1])
      acc(
        r.origin[0] + r.extension.offset[0] + r.extension.width,
        r.origin[1] + r.extension.offset[1] + r.extension.depth,
      )
    }
  }
  // Empty plan (no walls/rooms): fall back to the declared extent from origin.
  if (!Number.isFinite(minX))
    return { minX: 0, minZ: 0, maxX: plan.extent[0], maxZ: plan.extent[1] }
  return { minX, minZ, maxX, maxZ }
}

export function shadowFrustumForPlan(
  plan: FloorPlan,
  opts: { margin?: number; minHalf?: number; maxHalf?: number } = {},
): ShadowFrustum {
  const margin = opts.margin ?? MARGIN
  const minHalf = opts.minHalf ?? MIN_HALF
  const maxHalf = opts.maxHalf ?? MAX_HALF
  const { minX, minZ, maxX, maxZ } = planShadowBounds(plan)
  const half = Math.max((maxX - minX) / 2, (maxZ - minZ) / 2) + margin
  return {
    center: [(minX + maxX) / 2, 0, (minZ + maxZ) / 2],
    halfExtent: Math.min(maxHalf, Math.max(minHalf, half)),
  }
}
