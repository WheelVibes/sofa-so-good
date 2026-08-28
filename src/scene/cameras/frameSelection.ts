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

/**
 * ASPECT-REFRAME — when a viewport change is big enough to need a re-fit.
 *
 * `OrbitCamera` frames the dollhouse once on attach and reads the viewport size
 * point-in-time, not as a dependency, so nothing re-fits when the viewport changes.
 * Going portrait -> landscape that is harmless (the flat just gets smaller), but
 * landscape -> portrait CLIPS it: the landscape fit solves the vertical FOV at ~2.6r
 * while portrait needs ~5.3r for the narrower horizontal FOV. Measured on a phone
 * rotation (844x390 framed, then rotated to 390x844 with the camera untouched) the flat
 * spanned **191% of the viewport width** — whole rooms cut off both edges.
 *
 * A resize handler must not be hair-trigger: a browser window drag fires continuously,
 * and re-framing on every pixel would fight the user. This gates on a RATIO so only a
 * material change qualifies — a phone rotation (0.46 -> 2.16, a 4.7x change) always does,
 * a few pixels of window drag never does.
 */
export const REFIT_ASPECT_RATIO = 1.2

/** Did the aspect change enough to be worth re-fitting? Symmetric in the two
 *  arguments, so widening and narrowing are treated alike. */
export function aspectChangedMaterially(
  prev: number,
  next: number,
  ratio = REFIT_ASPECT_RATIO,
): boolean {
  if (!Number.isFinite(prev) || !Number.isFinite(next)) return false
  if (prev <= 0 || next <= 0) return false
  const r = prev > next ? prev / next : next / prev
  return r >= ratio
}

/**
 * Tolerance (in metres) within which the live camera pose still counts as the one
 * the auto-framing last set. Re-fitting is only safe while the user has NOT moved
 * the camera — otherwise a rotation would yank away a deliberate zoom or pan, which
 * is worse than the clipping it fixes.
 */
export const REFIT_POSE_EPS_M = 0.05

/** Is the live pose still (within {@link REFIT_POSE_EPS_M}) the one auto-framing set?
 *  Compares position and target as flat [x,y,z] triples so this stays three.js-free. */
export function poseIsStillFramed(
  livePos: readonly number[],
  liveTarget: readonly number[],
  framedPos: readonly number[],
  framedTarget: readonly number[],
  eps = REFIT_POSE_EPS_M,
): boolean {
  const near = (a: readonly number[], b: readonly number[]) =>
    a.length === 3 &&
    b.length === 3 &&
    a.every((v, i) => Number.isFinite(v) && Number.isFinite(b[i]) && Math.abs(v - b[i]) <= eps)
  return near(livePos, framedPos) && near(liveTarget, framedTarget)
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
