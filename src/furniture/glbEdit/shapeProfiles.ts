/**
 * GLB Asset Designer — parametric geometry BASE module: profile utils, the named
 * presets (lathe / extrude / sweep / loft) and the pure builders for the `lathe`
 * / `extrude` shape kinds plus the ubiquitous bevel on `box` / `wedge`. The
 * heavier Stage-6b geometry ops live in split-out siblings: `shellLoft.ts` (the
 * `shell` / `loft` / `sweep` builders) and `polygonOffset.ts` (the extrude-shell
 * inset). Everything here is pure of React/store — unit-testable on the CPU — and
 * returns finite three `BufferGeometry` with normals + UVs, footprint-centred in
 * metres like every other primitive.
 *
 * ## Coordinate conventions (documented, tested)
 * - **lathe `profile`** — unit-normalized `[x, y]` points, x ∈ [0, 1] = fraction
 *   of the RADIUS (`size[0] / 2`), y ∈ [0, 1] = fraction of the HEIGHT
 *   (`size[1]`). Revolved around the Y axis → a solid of revolution (turned leg,
 *   bowl, vase, column). Ordered bottom → top. `size` = [diameter, height, _].
 * - **extrude `outline`** — unit-normalized `[x, y]` points, both ∈ [-0.5, 0.5]
 *   (centred). Scaled to `size[0] × size[1]` in the XY plane and extruded along Z
 *   by `size[2]` (depth). Bevel (`bevel`, metres) rounds the extrusion edges and
 *   is ON by default for extrudes. `size` = [width, height, depth].
 * - **sweep** — a preset cross-section profile swept along a preset path;
 *   `size` = [pathExtent, tubeThickness, pathExtent]. No free point editing
 *   (presets only, by design — Stage 1a scope).
 *
 * Keeping profiles normalized means the gizmo/size fields scale the whole shape
 * uniformly (bounding box tracks `size`) while the editable point list stays
 * resolution-independent.
 */

import {
  BoxGeometry,
  type BufferGeometry,
  ExtrudeGeometry,
  LatheGeometry,
  Shape,
  Vector2,
} from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'

export type ProfilePoint = [number, number]

/** Clamp `v` into `[lo, hi]`. Shared by the geometry builders in this module +
 *  the split-out `shellLoft.ts`. */
export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

// ---------------------------------------------------------------------------
// Pure profile helpers (validation / closing / resampling) — unit-tested.
// ---------------------------------------------------------------------------

/** True when `pts` is a usable profile: an array of ≥2 finite `[x, y]` pairs. */
export function validateProfilePoints(pts: unknown): pts is ProfilePoint[] {
  if (!Array.isArray(pts) || pts.length < 2) return false
  return pts.every(
    (p) => Array.isArray(p) && p.length === 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]),
  )
}

/** Drop consecutive duplicate points (within `eps`) so a degenerate pair can't
 *  create a zero-length segment. Preserves order; never returns fewer than the
 *  first point. Pure. */
export function dedupeProfile(pts: ProfilePoint[], eps = 1e-6): ProfilePoint[] {
  const out: ProfilePoint[] = []
  for (const p of pts) {
    const last = out[out.length - 1]
    if (!last || Math.abs(last[0] - p[0]) > eps || Math.abs(last[1] - p[1]) > eps) {
      out.push([p[0], p[1]])
    }
  }
  return out
}

/** Close a profile by appending the first point if the last differs (for a
 *  filled extrude outline). No-op when already closed. Pure. */
export function closeProfile(pts: ProfilePoint[], eps = 1e-6): ProfilePoint[] {
  if (pts.length < 2) return pts.map((p) => [p[0], p[1]] as ProfilePoint)
  const first = pts[0]
  const last = pts[pts.length - 1]
  const closed = Math.abs(first[0] - last[0]) <= eps && Math.abs(first[1] - last[1]) <= eps
  const out = pts.map((p) => [p[0], p[1]] as ProfilePoint)
  if (!closed) out.push([first[0], first[1]])
  return out
}

/** Resample a polyline to exactly `n` points, evenly spaced by arc length.
 *  Used to keep an edited profile at a manageable point count. Pure; returns the
 *  input unchanged for n ≥ length or < 2 points. */
export function resampleProfile(pts: ProfilePoint[], n: number): ProfilePoint[] {
  if (pts.length < 2 || n < 2 || n >= pts.length) return pts.map((p) => [p[0], p[1]])
  const seg: number[] = []
  let total = 0
  for (let i = 1; i < pts.length; i++) {
    const dx = pts[i][0] - pts[i - 1][0]
    const dy = pts[i][1] - pts[i - 1][1]
    const d = Math.hypot(dx, dy)
    seg.push(d)
    total += d
  }
  if (total === 0) return pts.map((p) => [p[0], p[1]])
  const out: ProfilePoint[] = [[pts[0][0], pts[0][1]]]
  const step = total / (n - 1)
  let target = step
  let acc = 0
  let i = 1
  for (let k = 1; k < n - 1; k++) {
    while (i < pts.length && acc + seg[i - 1] < target) {
      acc += seg[i - 1]
      i++
    }
    if (i >= pts.length) break
    const t = seg[i - 1] === 0 ? 0 : (target - acc) / seg[i - 1]
    out.push([
      pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * t,
      pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * t,
    ])
    target += step
  }
  out.push([pts[pts.length - 1][0], pts[pts.length - 1][1]])
  return out
}

// ---------------------------------------------------------------------------
// Presets — normalized point lists that seed the editable profile.
// ---------------------------------------------------------------------------

/** Sample a rounded rectangle centred at the origin (half-extents 0.5), corner
 *  radius `r` (normalized), `seg` points per corner arc. */
function roundedRectOutline(r = 0.16, seg = 3): ProfilePoint[] {
  const hw = 0.5
  const hh = 0.5
  const rr = clamp(r, 0, Math.min(hw, hh))
  const corners: [number, number, number][] = [
    [hw - rr, hh - rr, 0], // top-right centre, start angle 0
    [-hw + rr, hh - rr, Math.PI / 2], // top-left
    [-hw + rr, -hh + rr, Math.PI], // bottom-left
    [hw - rr, -hh + rr, (3 * Math.PI) / 2], // bottom-right
  ]
  const pts: ProfilePoint[] = []
  for (const [cx, cy, a0] of corners) {
    for (let s = 0; s <= seg; s++) {
      const a = a0 + (s / seg) * (Math.PI / 2)
      pts.push([cx + rr * Math.cos(a), cy + rr * Math.sin(a)])
    }
  }
  return pts
}

/** Sample an ellipse (rx 0.5, ry 0.4) centred at the origin. */
function ellipseOutline(rx = 0.5, ry = 0.4, n = 24): ProfilePoint[] {
  const pts: ProfilePoint[] = []
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2
    pts.push([rx * Math.cos(a), ry * Math.sin(a)])
  }
  return pts
}

/** Named lathe profiles (revolve). x = radius fraction, y = height fraction. */
export const LATHE_PRESETS: Record<string, ProfilePoint[]> = {
  'turned-leg': [
    [0.85, 0],
    [0.9, 0.04],
    [0.6, 0.09],
    [1.0, 0.16],
    [0.55, 0.26],
    [0.45, 0.5],
    [0.72, 0.62],
    [0.48, 0.72],
    [0.58, 0.9],
    [0.38, 1.0],
  ],
  'tapered-leg': [
    [1.0, 0],
    [0.82, 0.5],
    [0.5, 1.0],
  ],
  bowl: [
    [0.0, 0],
    [0.5, 0.05],
    [0.88, 0.28],
    [1.0, 0.66],
    [0.98, 0.96],
    [0.86, 1.0],
  ],
  vase: [
    [0.0, 0],
    [0.42, 0.02],
    [0.5, 0.1],
    [0.86, 0.34],
    [0.56, 0.6],
    [0.36, 0.8],
    [0.52, 0.94],
    [0.44, 1.0],
  ],
  column: [
    [0.82, 0],
    [1.0, 0.03],
    [0.8, 0.07],
    [0.8, 0.93],
    [1.0, 0.97],
    [0.82, 1.0],
  ],
}

/** Named extrude outlines (normalized, centred [-0.5, 0.5]). */
export const EXTRUDE_PRESETS: Record<string, ProfilePoint[]> = {
  'rounded-rect': roundedRectOutline(),
  ellipse: ellipseOutline(),
  'l-shape': [
    [-0.5, -0.5],
    [0.1, -0.5],
    [0.1, 0.1],
    [0.5, 0.1],
    [0.5, 0.5],
    [-0.5, 0.5],
  ],
  't-shape': [
    [-0.5, 0.5],
    [-0.5, 0.16],
    [-0.16, 0.16],
    [-0.16, -0.5],
    [0.16, -0.5],
    [0.16, 0.16],
    [0.5, 0.16],
    [0.5, 0.5],
  ],
  arch: (() => {
    // Rectangle bottom + semicircular top; sampled so the arch reads smooth.
    const pts: ProfilePoint[] = [
      [-0.5, -0.5],
      [0.5, -0.5],
      [0.5, 0.0],
    ]
    const seg = 12
    for (let s = 0; s <= seg; s++) {
      const a = (s / seg) * Math.PI // 0 → π, right to left across the top
      pts.push([0.5 * Math.cos(a), 0.5 * Math.sin(a)])
    }
    pts.push([-0.5, 0.0])
    return pts
  })(),
}

export const LATHE_PRESET_LABEL: Record<string, string> = {
  'turned-leg': 'Turned leg',
  'tapered-leg': 'Tapered leg',
  bowl: 'Bowl',
  vase: 'Vase',
  column: 'Column',
}
export const EXTRUDE_PRESET_LABEL: Record<string, string> = {
  'rounded-rect': 'Rounded rectangle',
  ellipse: 'Ellipse',
  'l-shape': 'L-shape',
  't-shape': 'T-shape',
  arch: 'Arch',
}

// ---------------------------------------------------------------------------
// Sweep presets (profile cross-section × path) — presets only, no point editor.
// ---------------------------------------------------------------------------

export type SweepProfileKind = 'circle' | 'half-round' | 'ogee' | 'rectangle'
/** Stage 6b adds `'custom'` — a free path drawn in the 2D profile editor (XZ
 *  plane), stored on the part as normalized `sweepPathPoints`. */
export type SweepPathKind = 'straight' | 'l-corner' | 'u' | 'ring' | 'custom'

export const SWEEP_PROFILES: SweepProfileKind[] = ['circle', 'half-round', 'ogee', 'rectangle']
export const SWEEP_PATHS: SweepPathKind[] = ['straight', 'l-corner', 'u', 'ring', 'custom']

export const SWEEP_PROFILE_LABEL: Record<SweepProfileKind, string> = {
  circle: 'Round (piping)',
  'half-round': 'Half-round',
  ogee: 'Ogee moulding',
  rectangle: 'Rectangle',
}
export const SWEEP_PATH_LABEL: Record<SweepPathKind, string> = {
  straight: 'Straight',
  'l-corner': 'L-corner',
  u: 'U-channel',
  ring: 'Ring',
  custom: 'Custom (draw)',
}

/** Named normalized OPEN paths (XZ plane, centred [-0.5, 0.5]) that seed the
 *  custom sweep-path editor (Stage 6b). `[x, z]` fractions of the path extent
 *  (`size[0]`); rendered as an open Catmull-Rom curve. */
export const SWEEP_PATH_POINT_PRESETS: Record<string, ProfilePoint[]> = {
  's-curve': [
    [-0.5, -0.4],
    [-0.2, -0.5],
    [0.0, 0.0],
    [0.2, 0.5],
    [0.5, 0.4],
  ],
  wave: [
    [-0.5, 0.0],
    [-0.25, -0.4],
    [0.0, 0.0],
    [0.25, 0.4],
    [0.5, 0.0],
  ],
  arc: [
    [-0.5, 0.3],
    [-0.25, -0.2],
    [0.0, -0.4],
    [0.25, -0.2],
    [0.5, 0.3],
  ],
  'l-bend': [
    [-0.5, -0.5],
    [0.4, -0.5],
    [0.5, 0.4],
  ],
}
export const SWEEP_PATH_POINT_PRESET_LABEL: Record<string, string> = {
  's-curve': 'S-curve',
  wave: 'Wave',
  arc: 'Arc',
  'l-bend': 'L-bend',
}

// ---------------------------------------------------------------------------
// Geometry builders (pure).
// ---------------------------------------------------------------------------

/** Rounded box (bevel > 0) or a plain sharp box (bevel ≤ 0 → byte-identical to
 *  today's `BoxGeometry`). Radius clamped to < half the smallest dimension so a
 *  large bevel never inverts the geometry. `RoundedBoxGeometry` (three addon)
 *  carries correct normals + UVs. */
export function bevelledBoxGeometry(
  w: number,
  h: number,
  d: number,
  bevel: number,
): BufferGeometry {
  const r = clamp(bevel, 0, Math.min(w, h, d) / 2 - 1e-4)
  if (r <= 0) return new BoxGeometry(w, h, d)
  // Segments scale mildly with radius so a big fillet stays smooth but a micro
  // bevel stays cheap.
  const seg = r > 0.04 ? 4 : 2
  return new RoundedBoxGeometry(w, h, d, seg, r)
}

/** Right-triangular prism (a ramp) with an optional rounded/chamfered edge.
 *  Triangle in the Z/Y plane rising toward +Z, extruded across width (X). With
 *  `bevel > 0` the extrusion edges are bevelled so the ramp catches light on its
 *  corners. Matches the historic sharp wedge exactly at bevel = 0. */
export function wedgeGeometry(w: number, h: number, d: number, bevel: number): BufferGeometry {
  const shape = new Shape()
  shape.moveTo(-d / 2, -h / 2)
  shape.lineTo(d / 2, -h / 2)
  shape.lineTo(d / 2, h / 2)
  shape.closePath()
  const b = clamp(bevel, 0, Math.min(w, h, d) * 0.24)
  const bevelEnabled = b > 0
  const depth = bevelEnabled ? Math.max(0.001, w - 2 * b) : w
  const geo = new ExtrudeGeometry(shape, {
    depth,
    bevelEnabled,
    bevelThickness: b,
    bevelSize: b,
    bevelSegments: b > 0.04 ? 2 : 1,
  })
  // Centre along the extrude axis (total span = depth + 2*bevelThickness = w).
  geo.translate(0, 0, -(depth + (bevelEnabled ? 2 * b : 0)) / 2)
  geo.rotateY(-Math.PI / 2) // extrude axis Z → X
  return geo
}

/** Solid of revolution from a normalized profile. See file header for the
 *  coordinate convention. Centred vertically (base at −h/2). */
export function latheGeometry(
  profile: ProfilePoint[],
  segments: number,
  w: number,
  h: number,
): BufferGeometry {
  const clean = dedupeProfile(
    validateProfilePoints(profile) ? profile : LATHE_PRESETS['tapered-leg'],
  )
  const radius = Math.max(0.001, w / 2)
  const height = Math.max(0.001, h)
  const pts = clean.map((p) => new Vector2(Math.max(0, p[0]) * radius, p[1] * height))
  const seg = clamp(Math.round(segments) || 32, 3, 128)
  const geo = new LatheGeometry(pts, seg)
  geo.translate(0, -height / 2, 0)
  return geo
}

/** Prism from a normalized outline with a bevel (ON by default for extrudes).
 *  The outline is scaled to fill `size` minus the bevel so the finished
 *  bounding box tracks `size`. Centred on all axes. */
export function extrudeGeometry(
  outline: ProfilePoint[],
  w: number,
  h: number,
  d: number,
  bevel: number,
): BufferGeometry {
  const pts = dedupeProfile(
    validateProfilePoints(outline) ? outline : EXTRUDE_PRESETS['rounded-rect'],
  )
  const b = clamp(bevel, 0, Math.min(w, h, d) * 0.24)
  const innerW = Math.max(0.001, w - 2 * b)
  const innerH = Math.max(0.001, h - 2 * b)
  const depth = Math.max(0.001, d - 2 * b)
  const shape = new Shape()
  pts.forEach((p, i) => {
    const x = p[0] * innerW
    const y = p[1] * innerH
    if (i === 0) shape.moveTo(x, y)
    else shape.lineTo(x, y)
  })
  shape.closePath()
  const geo = new ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: b > 0,
    bevelThickness: b,
    bevelSize: b,
    bevelSegments: b > 0.04 ? 2 : 1,
    curveSegments: 8,
  })
  geo.translate(0, 0, -(depth + (b > 0 ? 2 * b : 0)) / 2)
  return geo
}

// ---------------------------------------------------------------------------
// Loft (Stage 6b) — a body between two horizontal cross-sections.
// ---------------------------------------------------------------------------

/** Sample a centred circle of `n` points, radius `r` (normalized). */
function circleOutline(n: number, r = 0.5): ProfilePoint[] {
  const pts: ProfilePoint[] = []
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2
    pts.push([r * Math.cos(a), r * Math.sin(a)])
  }
  return pts
}

/** Sample a centred square perimeter (`n` divisible by 4), half-extent `half`. */
function squareOutline(n: number, half = 0.5): ProfilePoint[] {
  const per = Math.max(1, Math.floor(n / 4))
  const corners: ProfilePoint[] = [
    [half, half],
    [-half, half],
    [-half, -half],
    [half, -half],
  ]
  const pts: ProfilePoint[] = []
  for (let c = 0; c < 4; c++) {
    const a = corners[c]
    const b = corners[(c + 1) % 4]
    for (let s = 0; s < per; s++) {
      const tt = s / per
      pts.push([a[0] + (b[0] - a[0]) * tt, a[1] + (b[1] - a[1]) * tt])
    }
  }
  return pts
}

/** Named loft profile pairs (bottom + top horizontal cross-sections, normalized
 *  centred outlines). Authored with EQUAL point counts so no resample loss. */
export const LOFT_PRESETS: Record<string, { bottom: ProfilePoint[]; top: ProfilePoint[] }> = {
  'round-square': { bottom: circleOutline(16), top: squareOutline(16) },
  'square-round': { bottom: squareOutline(16), top: circleOutline(16) },
  taper: { bottom: squareOutline(16, 0.5), top: squareOutline(16, 0.28) },
  'round-taper': { bottom: circleOutline(16, 0.5), top: circleOutline(16, 0.3) },
}
export const LOFT_PRESET_LABEL: Record<string, string> = {
  'round-square': 'Round → square',
  'square-round': 'Square → round',
  taper: 'Taper (square)',
  'round-taper': 'Taper (round)',
}
