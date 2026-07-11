/**
 * Pure bounds→camera math for "frame selection" (FEAT-A, the SketchUp/Blender/
 * Figma "zoom to fit the current selection" convenience). Kept free of React/
 * three.js (mirrors `cameraTween.ts`) so the geometry is unit-testable with
 * plain numbers; `OrbitCamera.tsx` owns the actual eased fly (reusing
 * `cameraTween.ts`'s `flyPose`, same as every other retarget).
 *
 * `resolveSelectionExtents` is the one function here that reaches into
 * `collision/placement.ts` (for `itemFootprint`, already the sanctioned way to
 * get an item's world OBB — see `layout/selectionActions.ts`) — everything
 * downstream of that is plain-data math with no store/catalog dependency.
 */
import { itemFootprint } from '../../collision/placement'
import type { FurnitureDef, FurnitureItem } from '../../furniture/types'
import { obbAxisHalf } from '../../layout/alignDistribute'

type Vec3 = [number, number, number]

/** One selected item's world footprint OBB + vertical extent above the floor
 *  (`def.verticalSpan ?? [0, defaultFootprint.h]`, the same fallback used by
 *  `collision/placement.ts` and `furniture/Furniture.tsx`). Plain data so this
 *  module never needs the store/catalog types beyond this one shape. */
export interface ItemFrameExtent {
  obb: { cx: number; cz: number; hx: number; hz: number; rot: number }
  base: number
  top: number
}

export interface SelectionBounds {
  /** World-space bounding-box centre. */
  center: Vec3
  /** Bounding-sphere radius that encloses the whole selection (no margin). */
  radius: number
}

/** A degenerate/point-like selection still gets a sane minimum framing radius
 *  instead of the camera dollying in to (near) zero distance. */
export const FRAME_MIN_RADIUS = 0.35

/** Breathing room around the tight bounding sphere so the selection doesn't
 *  touch the viewport edge — in the same spirit as the whole-plan dollhouse
 *  framing's 1.1–1.12 margins in `OrbitCamera.tsx`. */
export const FRAME_MARGIN = 1.35

/**
 * Union every selected item's world AABB (XZ from its footprint OBB via
 * `obbAxisHalf`, Y from its vertical span) into one bounding sphere. Returns
 * `null` for an empty selection so the caller can no-op rather than framing
 * nothing.
 */
export function selectionBounds(extents: ItemFrameExtent[]): SelectionBounds | null {
  if (extents.length === 0) return null
  let minX = Number.POSITIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let minZ = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY
  let maxZ = Number.NEGATIVE_INFINITY
  for (const e of extents) {
    const hx = obbAxisHalf(e.obb.hx, e.obb.hz, e.obb.rot, 0)
    const hz = obbAxisHalf(e.obb.hx, e.obb.hz, e.obb.rot, 1)
    minX = Math.min(minX, e.obb.cx - hx)
    maxX = Math.max(maxX, e.obb.cx + hx)
    minZ = Math.min(minZ, e.obb.cz - hz)
    maxZ = Math.max(maxZ, e.obb.cz + hz)
    minY = Math.min(minY, e.base)
    maxY = Math.max(maxY, e.top)
  }
  const center: Vec3 = [(minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2]
  const halfX = (maxX - minX) / 2
  const halfY = (maxY - minY) / 2
  const halfZ = (maxZ - minZ) / 2
  const radius = Math.max(FRAME_MIN_RADIUS, Math.hypot(halfX, halfY, halfZ))
  return { center, radius }
}

/** Camera distance at which a sphere of `radius` exactly fills the smaller of
 *  the vertical/horizontal field of view — aspect-aware (portrait phones
 *  included). Generalised from `OrbitCamera.tsx`'s private per-camera
 *  `fitDistance` (same formula) so both the whole-plan dollhouse framing and
 *  this selection framing share one tested function, taking plain fov/aspect
 *  numbers instead of a three.js `Camera` so it needs no three.js import. */
export function fitDistanceForFov(radius: number, vFovRad: number, aspect: number): number {
  const hFov = 2 * Math.atan(Math.tan(vFovRad / 2) * Math.max(0.01, aspect))
  const fov = Math.min(vFovRad, hFov)
  return radius / Math.max(0.1, Math.sin(fov / 2))
}

/** Mirrors the `<OrbitControls minDistance/maxDistance>` props in
 *  `OrbitCamera.tsx` — a frame request must never ask for a distance the
 *  controls would immediately clamp away from right after the fly lands. */
export const ORBIT_MIN_DISTANCE = 3
export const ORBIT_MAX_DISTANCE = 60

export function clampOrbitDistance(d: number): number {
  if (!Number.isFinite(d)) return ORBIT_MIN_DISTANCE
  return Math.min(ORBIT_MAX_DISTANCE, Math.max(ORBIT_MIN_DISTANCE, d))
}

/**
 * Resolve each selected item's world footprint OBB + vertical span into the
 * plain {@link ItemFrameExtent} shape `selectionBounds` unions. Skips ids that
 * don't resolve to a live item + def (a stale/mid-delete selection) rather
 * than throwing — the same defensive `catalog[id]` guard used throughout
 * `layout/selectionActions.ts`.
 */
export function resolveSelectionExtents(
  items: FurnitureItem[],
  selectedIds: string[],
  catalog: Record<string, FurnitureDef>,
): ItemFrameExtent[] {
  const ids = new Set(selectedIds)
  if (ids.size === 0) return []
  const extents: ItemFrameExtent[] = []
  for (const item of items) {
    if (!ids.has(item.id)) continue
    const def = catalog[item.defId]
    if (!def) continue
    const obb = itemFootprint(item, def)
    const span = def.verticalSpan ?? { base: 0, top: def.defaultFootprint.h }
    extents.push({ obb, base: span.base, top: span.top })
  }
  return extents
}
