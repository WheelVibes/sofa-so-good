import { allPlanRooms, allPlanWalls } from '../../floorplan/levels'
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
  // EVERY storey (F13): an upper level that overhangs the ground footprint
  // (or a landed house's first floor) fell OUTSIDE the shadow frustum, so its
  // geometry cast no shadow at all.
  for (const w of allPlanWalls(plan)) {
    acc(w.start[0], w.start[1])
    acc(w.end[0], w.end[1])
  }
  for (const r of allPlanRooms(plan)) {
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

/**
 * Target world-space size of one sun-shadow-map texel, in metres (SHADOW-TEXEL).
 *
 * What determines shadow quality is texel DENSITY over the shadow frustum, not
 * the raw map resolution — and the frustum here is sized to the plan
 * (`shadowFrustumForPlan`), which varies from the 9.5 m half-extent floor to the
 * 40 m cap. A fixed per-tier resolution therefore means wildly different quality
 * for the same setting: 4096 over the default flat is 4.6 mm/texel, while the
 * same 4096 over a 40 m plan is 19.5 mm/texel.
 *
 * 20 mm is deliberately coarse, and that is measured rather than guessed. In WALK
 * mode at 09:00 — standing next to furniture, the viewpoint where a contact
 * shadow is actually judged — sweeping `shadowMapSize` 4096 → 2048 → 1024 → 512
 * produced differences at or BELOW the run-to-run noise floor
 * (`scripts/dev-probes/walk-shadow.mjs`: living-room meanAbsDiff 0.43 / 0.21 /
 * 0.43 against a noise floor of 0.35), with no monotonic degradation — 512 was no
 * worse than 2048. Two reasons it doesn't show: Medium+ run VSM with `radius: 6`
 * / `blurSamples: 12` (`look.VSM_SHADOW`), a separable blur wide enough to
 * discard the extra texels; and the virtual ceiling occluder means interiors are
 * lit almost entirely by non-shadow-casting fill, so there is very little cast
 * shadow indoors to resolve in the first place.
 *
 * 20 mm ≈ the density the Medium tier already shipped on the default flat, so
 * this is not a quality reduction relative to what most users saw — it removes an
 * over-spend at the top tiers and, more importantly, stops a large custom plan
 * silently getting a quarter of the density at the same setting.
 */
export const SHADOW_TEXEL_TARGET_M = 0.02

/** Never go below this, however small the plan. */
export const SHADOW_MAP_MIN = 512

/**
 * Resolution for a sun shadow map covering `halfExtent` metres, to hit
 * {@link SHADOW_TEXEL_TARGET_M}, rounded UP to a power of two and clamped into
 * `[SHADOW_MAP_MIN, tierMax]`.
 *
 * `tierMax` is the tier's own ceiling (`QualitySettings.shadowMapSize`), so a
 * tier can still cap the spend and `0` (shadows off) passes straight through.
 * Pure + unit-tested.
 */
export function shadowMapSizeForExtent(halfExtent: number, tierMax: number): number {
  // 0 means "no sun shadows on this tier" — not a ceiling to scale into.
  if (!Number.isFinite(tierMax) || tierMax <= 0) return 0
  if (!Number.isFinite(halfExtent) || halfExtent <= 0) return Math.min(SHADOW_MAP_MIN, tierMax)
  const wanted = (2 * halfExtent) / SHADOW_TEXEL_TARGET_M
  const pow2 = 2 ** Math.ceil(Math.log2(Math.max(1, wanted)))
  return Math.max(Math.min(SHADOW_MAP_MIN, tierMax), Math.min(tierMax, pow2))
}
