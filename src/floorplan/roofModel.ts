/**
 * Parametric roof geometry (UX research round 3 — Homestyler v6 / Live Home 3D
 * precedent, `parametricRoof` pro flag).
 *
 * `buildRoofModel` turns the top storey's footprint bounding box + a pitch into
 * a set of triangulatable roof planes (plus low parapet walls / dormers), ready
 * for `apartment/Roof.tsx` to extrude into a mesh. It is PURE (no three/React)
 * so the whole thing unit-tests without the render stack — the module rule for
 * `src/floorplan`.
 *
 * ## v1 scope + limitations (kept honest, per the TODO)
 * - The roof is built over the **axis-aligned bounding box** of the top storey's
 *   outer footprint, extended outward by the eave `overhang`. An L/U/notched
 *   plan therefore gets a clean rectangular roof enclosing it (a hip/gable over
 *   the bounding rect) rather than a folded roof following every jog — a
 *   deliberate, documented v1 simplification favouring a solid, believable roof
 *   over configurability sprawl.
 * - `gable`  → two pitched planes meeting at a ridge + two triangular end gables.
 * - `hip`    → four planes sloping to all four eaves (a trapezoid pair along the
 *   ridge axis + two hip-end triangles); collapses to a pyramid when the two
 *   spans are equal.
 * - `flat-parapet` → a flat slab at the eave height ringed by a low parapet wall.
 * - Dormers are simple **gable dormers** on the two MAIN planes only (the sides
 *   the roof faces for the resolved ridge axis); a dormer on a non-facing side
 *   is dropped. The window is a visual break, not a real opening.
 * - A degenerate footprint (no external walls, zero span, non-finite bounds)
 *   yields `{ fallback: true }` with no planes — the caller renders no roof.
 */

import type { FloorPlan, PlanRoof, RoofDormerSide, RoofMaterialKind } from './types'

/** Inclusive pitch range (degrees) — matches the inspector's slider bounds. */
export const ROOF_PITCH_MIN = 15
export const ROOF_PITCH_MAX = 45
/** Maximum eave overhang past the wall face (m). */
export const ROOF_OVERHANG_MAX = 0.6
/** Low parapet wall height + thickness for `flat-parapet` (m). */
const PARAPET_HEIGHT = 0.45
const PARAPET_THICKNESS = 0.12
/** Dormer defaults (m): how far down the slope, its depth, height + gable rise. */
const DORMER_DOWN_SLOPE = 0.55
const DORMER_DEPTH = 0.9
const DORMER_HEIGHT = 1.15
const DORMER_GABLE_RISE = 0.35
const DORMER_MIN_WIDTH = 0.6

export type Vec3 = [number, number, number]

/** Axis-aligned footprint bounds (world XZ metres). */
export interface RoofBounds {
  minX: number
  minZ: number
  maxX: number
  maxZ: number
}

export type RoofPlaneRole = 'slope' | 'gable' | 'hip' | 'flat'

/** A convex roof polygon (ordered vertices) the renderer fan-triangulates. */
export interface RoofPlane {
  role: RoofPlaneRole
  /** Which main side this plane faces (slopes/hips only) — used to attach
   *  dormers to the correct plane. */
  facing?: RoofDormerSide
  points: Vec3[]
}

/** A low parapet wall segment (flat-parapet only), as a box the renderer draws. */
export interface ParapetBox {
  cx: number
  cz: number
  /** Box size along world X / world Z. */
  w: number
  d: number
  height: number
}

/** A resolved gable dormer, positioned on a main slope plane. */
export interface DormerBox {
  cx: number
  cz: number
  /** World Y of the slope surface where the dormer front sits (its base). */
  baseY: number
  width: number
  depth: number
  height: number
  gableRise: number
  /** The side the dormer faces (outward-facing +/- axis). */
  facing: RoofDormerSide
}

export interface RoofModel {
  /** True when the footprint is degenerate — render no roof. */
  fallback: boolean
  planes: RoofPlane[]
  parapets: ParapetBox[]
  dormers: DormerBox[]
  /** Resolved ridge axis (`auto` collapsed to the longer span). */
  ridgeAxis: 'x' | 'z'
  /** Ridge rise above the eave (m). `0` for flat-parapet. */
  rise: number
  /** Eave world Y (top of the top storey's walls). */
  baseY: number
  /** Overhang-extended eave rectangle. */
  eave: RoofBounds
  material: RoofMaterialKind
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

const DEGENERATE: Omit<RoofModel, 'material' | 'baseY'> = {
  fallback: true,
  planes: [],
  parapets: [],
  dormers: [],
  ridgeAxis: 'x',
  rise: 0,
  eave: { minX: 0, minZ: 0, maxX: 0, maxZ: 0 },
}

/**
 * Axis-aligned bounds of a plan level's EXTERNAL wall endpoints — the footprint
 * the roof is built over. Returns `null` when there are no external walls or the
 * bounds are degenerate/non-finite (the caller then draws no roof).
 */
export function outerFootprintBounds(walls: FloorPlan['walls']): RoofBounds | null {
  let minX = Number.POSITIVE_INFINITY
  let minZ = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxZ = Number.NEGATIVE_INFINITY
  let found = false
  for (const w of walls) {
    if (w.thickness !== 'external') continue
    for (const [x, z] of [w.start, w.end]) {
      if (!Number.isFinite(x) || !Number.isFinite(z)) continue
      found = true
      if (x < minX) minX = x
      if (z < minZ) minZ = z
      if (x > maxX) maxX = x
      if (z > maxZ) maxZ = z
    }
  }
  if (!found || maxX - minX < 0.5 || maxZ - minZ < 0.5) return null
  return { minX, minZ, maxX, maxZ }
}

/**
 * Build the roof geometry model over `bounds` at eave height `baseY`. Pure.
 */
export function buildRoofModel(
  bounds: RoofBounds | null,
  baseY: number,
  roof: PlanRoof,
): RoofModel {
  const material: RoofMaterialKind = roof.material ?? 'clay-tile'
  if (
    !bounds ||
    !Number.isFinite(baseY) ||
    !Number.isFinite(bounds.minX) ||
    bounds.maxX - bounds.minX < 0.5 ||
    bounds.maxZ - bounds.minZ < 0.5
  ) {
    return { ...DEGENERATE, material, baseY: Number.isFinite(baseY) ? baseY : 0 }
  }

  const o = clamp(roof.overhang, 0, ROOF_OVERHANG_MAX)
  const eave: RoofBounds = {
    minX: bounds.minX - o,
    minZ: bounds.minZ - o,
    maxX: bounds.maxX + o,
    maxZ: bounds.maxZ + o,
  }
  const spanX = eave.maxX - eave.minX
  const spanZ = eave.maxZ - eave.minZ

  // Resolve ridge axis: `auto` runs the ridge along the LONGER span (so the
  // slopes cover the shorter span → a lower, better-proportioned roof).
  const ridgeAxis: 'x' | 'z' =
    roof.ridgeAxis === 'x' || roof.ridgeAxis === 'z' ? roof.ridgeAxis : spanX >= spanZ ? 'x' : 'z'

  const pitch = (clamp(roof.pitchDeg, ROOF_PITCH_MIN, ROOF_PITCH_MAX) * Math.PI) / 180
  const tan = Math.tan(pitch)

  if (roof.style === 'flat-parapet') {
    return {
      fallback: false,
      ridgeAxis,
      rise: 0,
      baseY,
      eave,
      material,
      dormers: [],
      // A flat slab at the eave height (top face up).
      planes: [
        {
          role: 'flat',
          points: [
            [eave.minX, baseY, eave.minZ],
            [eave.maxX, baseY, eave.minZ],
            [eave.maxX, baseY, eave.maxZ],
            [eave.minX, baseY, eave.maxZ],
          ],
        },
      ],
      parapets: parapetRing(eave),
    }
  }

  // Perpendicular half-span drives the rise (rise = half-span × tan(pitch)).
  const halfSpan = (ridgeAxis === 'x' ? spanZ : spanX) / 2
  const rise = halfSpan * tan
  const topY = baseY + rise

  const planes: RoofPlane[] =
    roof.style === 'hip'
      ? hipPlanes(eave, ridgeAxis, topY, baseY)
      : gablePlanes(eave, ridgeAxis, topY, baseY)

  const dormers = (roof.dormers ?? [])
    .map((d) => resolveDormer(d, eave, ridgeAxis, baseY, rise))
    .filter((d): d is DormerBox => d != null)

  return {
    fallback: false,
    planes,
    parapets: [],
    dormers,
    ridgeAxis,
    rise,
    baseY,
    eave,
    material,
  }
}

/** Four low parapet boxes ringing the eave rectangle. */
function parapetRing(e: RoofBounds): ParapetBox[] {
  const t = PARAPET_THICKNESS
  const midX = (e.minX + e.maxX) / 2
  const midZ = (e.minZ + e.maxZ) / 2
  const w = e.maxX - e.minX
  const d = e.maxZ - e.minZ
  return [
    // North (minZ) + South (maxZ) run full width.
    { cx: midX, cz: e.minZ + t / 2, w, d: t, height: PARAPET_HEIGHT },
    { cx: midX, cz: e.maxZ - t / 2, w, d: t, height: PARAPET_HEIGHT },
    // East (maxX) + West (minX) run the depth (inset so corners don't overlap).
    { cx: e.minX + t / 2, cz: midZ, w: t, d, height: PARAPET_HEIGHT },
    { cx: e.maxX - t / 2, cz: midZ, w: t, d, height: PARAPET_HEIGHT },
  ]
}

/** Gable: two slope quads meeting at the ridge + two triangular end gables. */
function gablePlanes(
  e: RoofBounds,
  ridgeAxis: 'x' | 'z',
  topY: number,
  baseY: number,
): RoofPlane[] {
  if (ridgeAxis === 'x') {
    const zMid = (e.minZ + e.maxZ) / 2
    return [
      // North slope (faces −Z): eave at minZ up to ridge.
      {
        role: 'slope',
        facing: 'N',
        points: [
          [e.minX, baseY, e.minZ],
          [e.maxX, baseY, e.minZ],
          [e.maxX, topY, zMid],
          [e.minX, topY, zMid],
        ],
      },
      // South slope (faces +Z): eave at maxZ up to ridge.
      {
        role: 'slope',
        facing: 'S',
        points: [
          [e.maxX, baseY, e.maxZ],
          [e.minX, baseY, e.maxZ],
          [e.minX, topY, zMid],
          [e.maxX, topY, zMid],
        ],
      },
      // West gable triangle (x = minX).
      {
        role: 'gable',
        points: [
          [e.minX, baseY, e.minZ],
          [e.minX, topY, zMid],
          [e.minX, baseY, e.maxZ],
        ],
      },
      // East gable triangle (x = maxX).
      {
        role: 'gable',
        points: [
          [e.maxX, baseY, e.maxZ],
          [e.maxX, topY, zMid],
          [e.maxX, baseY, e.minZ],
        ],
      },
    ]
  }
  // Ridge along Z: slopes face ∓X, gables at z = min/max.
  const xMid = (e.minX + e.maxX) / 2
  return [
    {
      role: 'slope',
      facing: 'W',
      points: [
        [e.minX, baseY, e.maxZ],
        [e.minX, baseY, e.minZ],
        [xMid, topY, e.minZ],
        [xMid, topY, e.maxZ],
      ],
    },
    {
      role: 'slope',
      facing: 'E',
      points: [
        [e.maxX, baseY, e.minZ],
        [e.maxX, baseY, e.maxZ],
        [xMid, topY, e.maxZ],
        [xMid, topY, e.minZ],
      ],
    },
    {
      role: 'gable',
      points: [
        [e.minX, baseY, e.minZ],
        [xMid, topY, e.minZ],
        [e.maxX, baseY, e.minZ],
      ],
    },
    {
      role: 'gable',
      points: [
        [e.maxX, baseY, e.maxZ],
        [xMid, topY, e.maxZ],
        [e.minX, baseY, e.maxZ],
      ],
    },
  ]
}

/** Hip: two trapezoids along the ridge + two hip-end triangles. The ridge is
 *  inset from each end by half the short span (classic equal-pitch hip); when
 *  the two spans are equal the ridge collapses to a point (a pyramid). */
function hipPlanes(e: RoofBounds, ridgeAxis: 'x' | 'z', topY: number, baseY: number): RoofPlane[] {
  const spanX = e.maxX - e.minX
  const spanZ = e.maxZ - e.minZ
  if (ridgeAxis === 'x') {
    const zMid = (e.minZ + e.maxZ) / 2
    const halfShort = spanZ / 2
    // Ridge insets by halfShort at each end, clamped so it never inverts.
    const inset = Math.min(halfShort, spanX / 2)
    const xr0 = e.minX + inset
    const xr1 = e.maxX - inset
    return [
      // North trapezoid (faces −Z).
      {
        role: 'slope',
        facing: 'N',
        points: [
          [e.minX, baseY, e.minZ],
          [e.maxX, baseY, e.minZ],
          [xr1, topY, zMid],
          [xr0, topY, zMid],
        ],
      },
      // South trapezoid (faces +Z).
      {
        role: 'slope',
        facing: 'S',
        points: [
          [e.maxX, baseY, e.maxZ],
          [e.minX, baseY, e.maxZ],
          [xr0, topY, zMid],
          [xr1, topY, zMid],
        ],
      },
      // West hip triangle.
      {
        role: 'hip',
        facing: 'W',
        points: [
          [e.minX, baseY, e.maxZ],
          [e.minX, baseY, e.minZ],
          [xr0, topY, zMid],
        ],
      },
      // East hip triangle.
      {
        role: 'hip',
        facing: 'E',
        points: [
          [e.maxX, baseY, e.minZ],
          [e.maxX, baseY, e.maxZ],
          [xr1, topY, zMid],
        ],
      },
    ]
  }
  const xMid = (e.minX + e.maxX) / 2
  const halfShort = spanX / 2
  const inset = Math.min(halfShort, spanZ / 2)
  const zr0 = e.minZ + inset
  const zr1 = e.maxZ - inset
  return [
    {
      role: 'slope',
      facing: 'W',
      points: [
        [e.minX, baseY, e.maxZ],
        [e.minX, baseY, e.minZ],
        [xMid, topY, zr0],
        [xMid, topY, zr1],
      ],
    },
    {
      role: 'slope',
      facing: 'E',
      points: [
        [e.maxX, baseY, e.minZ],
        [e.maxX, baseY, e.maxZ],
        [xMid, topY, zr1],
        [xMid, topY, zr0],
      ],
    },
    {
      role: 'hip',
      facing: 'N',
      points: [
        [e.minX, baseY, e.minZ],
        [e.maxX, baseY, e.minZ],
        [xMid, topY, zr0],
      ],
    },
    {
      role: 'hip',
      facing: 'S',
      points: [
        [e.maxX, baseY, e.maxZ],
        [e.minX, baseY, e.maxZ],
        [xMid, topY, zr1],
      ],
    },
  ]
}

/**
 * Resolve a dormer request into a positioned box on the correct main plane.
 * Returns `null` when the dormer's `wallSide` isn't a side the roof faces for
 * the resolved ridge axis (documented v1 constraint) or is degenerate.
 */
function resolveDormer(
  d: { wallSide: RoofDormerSide; offset: number; width: number },
  e: RoofBounds,
  ridgeAxis: 'x' | 'z',
  baseY: number,
  rise: number,
): DormerBox | null {
  // Valid sides are the ones the two main slopes face.
  const facingSides: RoofDormerSide[] = ridgeAxis === 'x' ? ['N', 'S'] : ['E', 'W']
  if (!facingSides.includes(d.wallSide)) return null
  const width = Math.max(DORMER_MIN_WIDTH, d.width)
  if (!Number.isFinite(d.offset) || !Number.isFinite(width)) return null

  if (ridgeAxis === 'x') {
    // Dormer runs along X; position its centre from the min-X corner.
    const spanX = e.maxX - e.minX
    const half = width / 2
    const cx = clamp(e.minX + d.offset + half, e.minX + half, e.maxX - half)
    if (spanX < width) return null
    const zMid = (e.minZ + e.maxZ) / 2
    // Down the slope toward the eave on the requested side.
    const eaveZ = d.wallSide === 'N' ? e.minZ : e.maxZ
    const cz = zMid + (eaveZ - zMid) * DORMER_DOWN_SLOPE
    // Slope surface height at cz (linear ridge→eave).
    const baseSurfaceY = baseY + rise * (1 - DORMER_DOWN_SLOPE)
    return {
      cx,
      cz,
      baseY: baseSurfaceY,
      width,
      depth: DORMER_DEPTH,
      height: DORMER_HEIGHT,
      gableRise: DORMER_GABLE_RISE,
      facing: d.wallSide,
    }
  }
  const spanZ = e.maxZ - e.minZ
  const half = width / 2
  const cz = clamp(e.minZ + d.offset + half, e.minZ + half, e.maxZ - half)
  if (spanZ < width) return null
  const xMid = (e.minX + e.maxX) / 2
  const eaveX = d.wallSide === 'W' ? e.minX : e.maxX
  const cx = xMid + (eaveX - xMid) * DORMER_DOWN_SLOPE
  const baseSurfaceY = baseY + rise * (1 - DORMER_DOWN_SLOPE)
  return {
    cx,
    cz,
    baseY: baseSurfaceY,
    width,
    depth: DORMER_DEPTH,
    height: DORMER_HEIGHT,
    gableRise: DORMER_GABLE_RISE,
    facing: d.wallSide,
  }
}
