/**
 * Pure ceiling-geometry engine (render-agnostic + unit-tested), mirroring the
 * cabinet engine: `buildCeiling` turns a room polygon + ceiling height + a
 * {@link CeilingConfig} into flat horizontal "planes" plus optional vertical
 * "side" strips (risers / box walls), all in absolute world metres. The
 * `RoomCeiling` component maps these parts → meshes; it owns no geometry maths.
 *
 * Design notes:
 *  - Everything is built so a down-facing plane at a *lower* Y always sits in
 *    front of a higher one (no CSG holes needed): dropped/coffered use a full
 *    base panel + lower elements; tray uses a lower perimeter frame + a higher
 *    centre panel (no full base, so the centre reads as recessed-up).
 *  - Non-rectangular rooms (L-shapes / free-form polygons) fall back to a flat
 *    ceiling (`fallback: true`) — the renderer then draws the existing
 *    polygon-aware flat plane. Rectangular rooms (the overwhelming majority) get
 *    the full treatment.
 *  - All depths/insets are clamped to the room + ceiling height so a small room
 *    or an over-large margin can never produce inverted / sub-floor geometry.
 */

import type { CeilingConfig } from '../../floorplan/types'

export interface CeilingPlane {
  kind: 'plane'
  role: 'base' | 'frame' | 'centre' | 'soffit' | 'beam'
  cx: number
  cz: number
  w: number
  d: number
  /** World Y of the down-facing surface. */
  y: number
}

export interface CeilingSide {
  kind: 'side'
  /** Footprint line: a thin vertical strip centred at (cx,cz) spanning w×d. */
  cx: number
  cz: number
  w: number
  d: number
  yLow: number
  yHigh: number
}

export type CeilingPart = CeilingPlane | CeilingSide

export interface CeilingModel {
  parts: CeilingPart[]
  /** Lowest down-facing surface Y (for clearance reads). */
  lowestY: number
  /** Perimeter cove strip (inner-rect outline) + its Y, when cove light is on. */
  cove: { cx: number; cz: number; w: number; d: number; y: number } | null
  /** True when the room couldn't take the treatment (non-rect / too small / flat)
   *  → the caller should render the plain flat ceiling instead. */
  fallback: boolean
}

/** Short human label for a room's ceiling treatment (for schedules/reports).
 *  Absent or flat → "Flat". Pure. */
export function ceilingStyleLabel(config?: CeilingConfig): string {
  if (!config || config.style === 'flat') return 'Flat'
  const cove = config.coveLight ? ' + cove' : ''
  if (config.style === 'coffered') {
    const [c, r] = config.grid ?? [2, 2]
    return `Coffered ${c}×${r}${cove}`
  }
  return `${config.style[0].toUpperCase()}${config.style.slice(1)}${cove}`
}

const MIN_CEILING_CLEARANCE = 2.0 // never drop a ceiling element below this (m)
const MIN_COFFER_CELL = 0.6 // smallest coffer cell side (m)
const BEAM_W = 0.12 // coffered beam width (m)

interface Bbox {
  x0: number
  z0: number
  x1: number
  z1: number
}

function bboxOf(polygon: [number, number][]): Bbox {
  let x0 = Infinity
  let z0 = Infinity
  let x1 = -Infinity
  let z1 = -Infinity
  for (const [x, z] of polygon) {
    if (x < x0) x0 = x
    if (x > x1) x1 = x
    if (z < z0) z0 = z
    if (z > z1) z1 = z
  }
  return { x0, z0, x1, z1 }
}

/** A polygon is treated as rectangular when every vertex sits on a corner of its
 *  bounding box (axis-aligned rect, possibly with collinear/duplicate points). */
function isAxisAlignedRect(polygon: [number, number][], bb: Bbox): boolean {
  if (polygon.length < 4) return false
  const eps = 1e-4
  for (const [x, z] of polygon) {
    const onX = Math.abs(x - bb.x0) < eps || Math.abs(x - bb.x1) < eps
    const onZ = Math.abs(z - bb.z0) < eps || Math.abs(z - bb.z1) < eps
    if (!onX || !onZ) return false
  }
  return true
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v))
}

const flatModel = (h: number): CeilingModel => ({
  parts: [],
  lowestY: h,
  cove: null,
  fallback: true,
})

/** Build the ceiling parts for a room. `polygon` is the room outline (world m),
 *  `ceilingHeight` its head height, `config` the chosen treatment. */
export function buildCeiling(
  polygon: [number, number][],
  ceilingHeight: number,
  config: CeilingConfig,
): CeilingModel {
  const h = ceilingHeight
  if (config.style === 'flat' || polygon.length < 4) return flatModel(h)
  const bb = bboxOf(polygon)
  const W = bb.x1 - bb.x0
  const D = bb.z1 - bb.z0
  if (!(W > 0) || !(D > 0) || !isAxisAlignedRect(polygon, bb)) return flatModel(h)

  const cx = (bb.x0 + bb.x1) / 2
  const cz = (bb.z0 + bb.z1) / 2
  // Drop clamped so no element dips below the minimum clearance.
  const maxDrop = Math.max(0, Math.min(0.4, h - MIN_CEILING_CLEARANCE))
  const drop = clamp(config.drop ?? 0.15, 0.03, maxDrop || 0.03)
  if (maxDrop < 0.03) return flatModel(h) // ceiling too low to drop anything

  if (config.style === 'coffered') {
    return cofferedModel(bb, W, D, cx, cz, h, drop, config)
  }

  // tray + dropped share an inset rect.
  const maxMargin = Math.min(W, D) / 2 - 0.1
  if (maxMargin < 0.1) return flatModel(h) // room too small for a border
  const margin = clamp(config.margin ?? 0.35, 0.1, maxMargin)
  const innerW = W - 2 * margin
  const innerD = D - 2 * margin
  const yLow = h - drop

  const parts: CeilingPart[] = []
  const cove = config.coveLight
    ? { cx, cz, w: innerW, d: innerD, y: config.style === 'tray' ? yLow : h - drop }
    : null

  if (config.style === 'tray') {
    // Lower perimeter frame (4 strips) + higher centre panel (recessed up).
    parts.push({ kind: 'plane', role: 'centre', cx, cz, w: innerW, d: innerD, y: h })
    pushFrame(parts, bb, margin, innerD, cx, cz, yLow)
    // Risers connect the frame up to the centre panel at the inner boundary.
    pushSides(parts, cx, cz, innerW, innerD, yLow, h)
    return { parts, lowestY: yLow, cove, fallback: false }
  }

  // dropped: full base ceiling + a lowered inset box (soffit + 4 walls).
  parts.push({ kind: 'plane', role: 'base', cx, cz, w: W, d: D, y: h })
  parts.push({ kind: 'plane', role: 'soffit', cx, cz, w: innerW, d: innerD, y: yLow })
  pushSides(parts, cx, cz, innerW, innerD, yLow, h)
  return { parts, lowestY: yLow, cove, fallback: false }
}

/** Four perimeter frame strips (between the bbox edge and the inner rect). */
function pushFrame(
  parts: CeilingPart[],
  bb: Bbox,
  margin: number,
  innerD: number,
  cx: number,
  cz: number,
  y: number,
): void {
  const W = bb.x1 - bb.x0
  // Top + bottom run full width; left + right fill the gap between them.
  parts.push({ kind: 'plane', role: 'frame', cx, cz: bb.z0 + margin / 2, w: W, d: margin, y })
  parts.push({ kind: 'plane', role: 'frame', cx, cz: bb.z1 - margin / 2, w: W, d: margin, y })
  parts.push({
    kind: 'plane',
    role: 'frame',
    cx: bb.x0 + margin / 2,
    cz,
    w: margin,
    d: innerD,
    y,
  })
  parts.push({ kind: 'plane', role: 'frame', cx: bb.x1 - margin / 2, cz, w: margin, d: innerD, y })
}

/** Four thin vertical side strips around an inner rect (risers / box walls). */
function pushSides(
  parts: CeilingPart[],
  cx: number,
  cz: number,
  innerW: number,
  innerD: number,
  yLow: number,
  yHigh: number,
): void {
  const t = 0.02
  parts.push({ kind: 'side', cx, cz: cz - innerD / 2, w: innerW, d: t, yLow, yHigh })
  parts.push({ kind: 'side', cx, cz: cz + innerD / 2, w: innerW, d: t, yLow, yHigh })
  parts.push({ kind: 'side', cx: cx - innerW / 2, cz, w: t, d: innerD, yLow, yHigh })
  parts.push({ kind: 'side', cx: cx + innerW / 2, cz, w: t, d: innerD, yLow, yHigh })
}

function cofferedModel(
  bb: Bbox,
  W: number,
  D: number,
  cx: number,
  cz: number,
  h: number,
  drop: number,
  config: CeilingConfig,
): CeilingModel {
  const yLow = h - drop
  // Clamp grid to a sane range + so each coffer cell stays >= MIN_COFFER_CELL.
  const cols = clamp(
    Math.round(config.grid?.[0] ?? 2),
    1,
    Math.max(1, Math.floor(W / MIN_COFFER_CELL)),
  )
  const rows = clamp(
    Math.round(config.grid?.[1] ?? 2),
    1,
    Math.max(1, Math.floor(D / MIN_COFFER_CELL)),
  )
  const parts: CeilingPart[] = [{ kind: 'plane', role: 'base', cx, cz, w: W, d: D, y: h }]
  // Beam grid at the lower level: perimeter + internal dividers.
  // Vertical beams (run along Z) at x = boundaries between columns.
  for (let i = 0; i <= cols; i++) {
    const x = bb.x0 + (W * i) / cols
    parts.push({ kind: 'plane', role: 'beam', cx: x, cz, w: BEAM_W, d: D, y: yLow })
  }
  // Horizontal beams (run along X) at z = boundaries between rows.
  for (let j = 0; j <= rows; j++) {
    const z = bb.z0 + (D * j) / rows
    parts.push({ kind: 'plane', role: 'beam', cx, cz: z, w: W, d: BEAM_W, y: yLow })
  }
  return { parts, lowestY: yLow, cove: null, fallback: false }
}
