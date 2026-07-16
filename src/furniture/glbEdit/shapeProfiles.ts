/**
 * GLB Asset Designer — Stage 1a parametric geometry: profiles, presets and the
 * pure builders for the `lathe` / `extrude` / `sweep` shape kinds plus the
 * ubiquitous bevel on `box` / `wedge`. Everything here is pure of React/store —
 * unit-testable on the CPU — and returns finite three `BufferGeometry` with
 * normals + UVs, footprint-centred in metres like every other primitive.
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
  BufferGeometry,
  CatmullRomCurve3,
  ExtrudeGeometry,
  Float32BufferAttribute,
  LatheGeometry,
  Path,
  Shape,
  TubeGeometry,
  Vector2,
  Vector3,
} from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

export type ProfilePoint = [number, number]

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

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

/** Build the swept path points (metres) for a path preset, scaled by `len`
 *  (footprint extent) and centred on the origin. */
function sweepPathPoints(path: SweepPathKind, len: number): { points: Vector3[]; closed: boolean } {
  const L = Math.max(0.01, len)
  const h = L / 2
  switch (path) {
    case 'straight':
      return { points: [new Vector3(-h, 0, 0), new Vector3(h, 0, 0)], closed: false }
    case 'l-corner':
      return {
        points: [new Vector3(-h, 0, -h), new Vector3(h, 0, -h), new Vector3(h, 0, h)],
        closed: false,
      }
    case 'u':
      return {
        points: [
          new Vector3(-h, 0, h),
          new Vector3(-h, 0, -h),
          new Vector3(h, 0, -h),
          new Vector3(h, 0, h),
        ],
        closed: false,
      }
    case 'ring': {
      const n = 32
      const pts: Vector3[] = []
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2
        pts.push(new Vector3(h * Math.cos(a), 0, h * Math.sin(a)))
      }
      return { points: pts, closed: true }
    }
    default:
      // 'custom' is handled by the caller before this preset lookup — fall back
      // to a straight path defensively so the function stays total.
      return { points: [new Vector3(-h, 0, 0), new Vector3(h, 0, 0)], closed: false }
  }
}

/** The 2D cross-section Shape for a non-circle sweep profile, sized to `t`
 *  (tube thickness, metres). */
function sweepProfileShape(profile: SweepProfileKind, t: number): Shape {
  const r = Math.max(0.005, t / 2)
  const s = new Shape()
  switch (profile) {
    case 'half-round': {
      s.moveTo(-r, 0)
      s.lineTo(r, 0)
      s.absarc(0, 0, r, 0, Math.PI, false)
      s.closePath()
      return s
    }
    case 'rectangle': {
      s.moveTo(-r, -r)
      s.lineTo(r, -r)
      s.lineTo(r, r)
      s.lineTo(-r, r)
      s.closePath()
      return s
    }
    case 'ogee': {
      // An S-curve moulding cross-section (double curve), roughly r wide × 2r tall.
      s.moveTo(-r, -r)
      s.lineTo(r, -r)
      s.lineTo(r, -r * 0.2)
      s.quadraticCurveTo(r, r * 0.4, 0, r * 0.4)
      s.quadraticCurveTo(-r, r * 0.4, -r, r)
      s.closePath()
      return s
    }
    default: {
      // circle fallback (unused — circle goes through TubeGeometry)
      s.absarc(0, 0, r, 0, Math.PI * 2, false)
      return s
    }
  }
}

/** Profile swept along a path. Circle profile → `TubeGeometry` (piping/rails);
 *  every other profile → `ExtrudeGeometry` with an `extrudePath`. `size` =
 *  [pathExtent, tubeThickness, pathExtent]. Centred on the origin.
 *
 *  Stage 5: an explicit closed `pathPoints` polyline (metres, sweep-local)
 *  OVERRIDES the preset `path` — the piping preset traces a rounded-rect
 *  perimeter from a host part's footprint (`piping.ts`).
 *
 *  Stage 6b: with `path === 'custom'` an OPEN `customPath` (normalized `[x, z]`
 *  fractions of the path extent, centred [-0.5, 0.5], drawn in the 2D editor) is
 *  swept — a free rail/moulding curve. Precedence: an explicit closed
 *  `pathPoints` (piping) wins, then a `custom` open path, then the preset. */
export function sweepGeometry(
  profile: SweepProfileKind,
  path: SweepPathKind,
  w: number,
  t: number,
  pathPoints?: [number, number, number][],
  customPath?: ProfilePoint[],
): BufferGeometry {
  const explicit = pathPoints && pathPoints.length >= 2
  const custom = path === 'custom' && customPath && customPath.length >= 2
  const { points, closed } = explicit
    ? { points: pathPoints.map((p) => new Vector3(p[0], p[1], p[2])), closed: true }
    : custom
      ? {
          points: dedupeProfile(customPath).map((p) => new Vector3(p[0] * w, 0, p[1] * w)),
          closed: false,
        }
      : sweepPathPoints(path, w)
  const curve = new CatmullRomCurve3(points, closed, 'catmullrom', 0.5)
  // Enough steps to read smooth on a small moulding without an expensive build
  // (ExtrudeGeometry with an extrudePath is O(steps × profileVerts)).
  const tubular = explicit || custom ? Math.max(64, points.length * 4) : path === 'ring' ? 48 : 24
  if (profile === 'circle') {
    return new TubeGeometry(curve, tubular, Math.max(0.005, t / 2), 12, closed)
  }
  const shape = sweepProfileShape(profile, t)
  const geo = new ExtrudeGeometry(shape, {
    steps: tubular,
    bevelEnabled: false,
    extrudePath: curve,
  })
  return geo
}

// ---------------------------------------------------------------------------
// Polygon offset (inset) — pure 2D helper for the extrude shell inner hole.
// ---------------------------------------------------------------------------

/** Signed area (shoelace) of a simple polygon (open loop of distinct vertices).
 *  > 0 = CCW, < 0 = CW. Pure. */
export function polygonSignedArea(pts: ProfilePoint[]): number {
  let a = 0
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]
    const q = pts[(i + 1) % pts.length]
    a += p[0] * q[1] - q[0] * p[1]
  }
  return a / 2
}

/** Unit vector of `v`, or null when degenerate (zero length). */
function unit(v: ProfilePoint): ProfilePoint | null {
  const m = Math.hypot(v[0], v[1])
  return m < 1e-9 ? null : [v[0] / m, v[1] / m]
}

/** Intersection of line (through `p`, direction `d`) and line (through `q`,
 *  direction `e`), or null when parallel. Pure. */
function lineIntersect(
  p: ProfilePoint,
  d: ProfilePoint,
  q: ProfilePoint,
  e: ProfilePoint,
): ProfilePoint | null {
  const denom = d[0] * e[1] - d[1] * e[0]
  if (Math.abs(denom) < 1e-9) return null
  const tt = ((q[0] - p[0]) * e[1] - (q[1] - p[1]) * e[0]) / denom
  return [p[0] + d[0] * tt, p[1] + d[1] * tt]
}

/** Drop a closing duplicate vertex (first ≈ last) so a polygon is a clean open
 *  loop of distinct vertices. Pure. */
function openLoop(pts: ProfilePoint[]): ProfilePoint[] {
  const out = dedupeProfile(pts)
  if (out.length >= 2) {
    const f = out[0]
    const l = out[out.length - 1]
    if (Math.abs(f[0] - l[0]) < 1e-9 && Math.abs(f[1] - l[1]) < 1e-9) out.pop()
  }
  return out
}

/**
 * Inset a simple closed polygon inward by `delta` (same units as the points) via
 * a per-vertex MITER offset: each edge is shifted inward by `delta` and adjacent
 * offset edges are intersected for the new vertex. Returns the inset polygon, or
 * `null` when it collapses / flips (the inset area vanishes or reverses
 * orientation).
 *
 * **Concave-outline limit (documented, honest):** a miter offset is exact for
 * convex corners and mild concavity, but a deeply concave outline — where the
 * wall thickness exceeds the local half-width of a neck — will self-intersect
 * under the inset. Rather than emit a tangled inner ring, a runaway reflex miter
 * is CLAMPED to a bevel distance (`delta × 4`) and, if the whole inset still
 * collapses/flips, the function returns `null` so the caller can fall back to a
 * solid shape (a fail-safe, never a crash). Pure.
 */
export function insetPolygon(pts: ProfilePoint[], delta: number): ProfilePoint[] | null {
  const loop = openLoop(pts)
  const n = loop.length
  if (n < 3 || !(delta > 0)) return null
  const ccw = polygonSignedArea(loop) > 0
  // Inward normal of an edge direction (left normal for CCW, right for CW).
  const inward = (e: ProfilePoint): ProfilePoint => (ccw ? [-e[1], e[0]] : [e[1], -e[0]])
  const out: ProfilePoint[] = []
  for (let i = 0; i < n; i++) {
    const prev = loop[(i - 1 + n) % n]
    const cur = loop[i]
    const next = loop[(i + 1) % n]
    const e1 = unit([cur[0] - prev[0], cur[1] - prev[1]])
    const e2 = unit([next[0] - cur[0], next[1] - cur[1]])
    if (!e1 || !e2) return null
    const n1 = inward(e1)
    const n2 = inward(e2)
    const p1: ProfilePoint = [cur[0] + n1[0] * delta, cur[1] + n1[1] * delta]
    const p2: ProfilePoint = [cur[0] + n2[0] * delta, cur[1] + n2[1] * delta]
    const v = lineIntersect(p1, e1, p2, e2)
    if (!v) {
      // Straight-through vertex (collinear edges) — a single offset point.
      out.push(p1)
      continue
    }
    // Clamp a runaway miter at a sharp reflex corner to a bevel distance.
    const dx = v[0] - cur[0]
    const dy = v[1] - cur[1]
    const md = Math.hypot(dx, dy)
    const maxMiter = delta * 4
    if (md > maxMiter && md > 1e-9) {
      const s = maxMiter / md
      out.push([cur[0] + dx * s, cur[1] + dy * s])
    } else {
      out.push(v)
    }
  }
  // Over-inset detection: a convex polygon inset past its inradius keeps the same
  // orientation but each edge REVERSES direction — catch that (dot < 0) plus the
  // orientation-flip / vanishing-area cases (concave necks).
  for (let i = 0; i < n; i++) {
    const oe = unit([loop[(i + 1) % n][0] - loop[i][0], loop[(i + 1) % n][1] - loop[i][1]])
    const ie = unit([out[(i + 1) % n][0] - out[i][0], out[(i + 1) % n][1] - out[i][1]])
    if (oe && ie && oe[0] * ie[0] + oe[1] * ie[1] < 0) return null
  }
  const insetArea = polygonSignedArea(out)
  const origArea = polygonSignedArea(loop)
  if (Math.sign(insetArea) !== Math.sign(origArea) || Math.abs(insetArea) < 1e-6) return null
  return out
}

// ---------------------------------------------------------------------------
// Shell / hollow (Stage 6b) — open-top carcass on box + extrude.
// ---------------------------------------------------------------------------

/** A closed filled `Shape` from a point list. */
function shapeFromPoints(pts: ProfilePoint[]): Shape {
  const s = new Shape()
  pts.forEach((p, i) => {
    if (i === 0) s.moveTo(p[0], p[1])
    else s.lineTo(p[0], p[1])
  })
  s.closePath()
  return s
}

/**
 * A hollow, open-TOP (+Y) box carcass — 4 walls + a bottom slab of uniform wall
 * `thickness` (metres) — built by PURE CONSTRUCTION (five `BoxGeometry` panels
 * merged), so it's exact with correct per-face normals + UVs and no CSG cost.
 * The walls form a frame (front/back span the full width, left/right fit between
 * them) and the bottom slab fills the inner footprint, so wall thickness is
 * measurable in the vertex data and the top is open. `thickness` is clamped so
 * the walls never meet; if it's too large for the footprint the shape falls back
 * to a solid `BoxGeometry` (never a degenerate carcass). Total bbox = w×h×d.
 */
export function shellBoxGeometry(
  w: number,
  h: number,
  d: number,
  thickness: number,
): BufferGeometry {
  const t = clamp(thickness, 0, Math.min(w, d) / 2 - 1e-3)
  if (!(t > 0) || w - 2 * t <= 1e-3 || d - 2 * t <= 1e-3) return new BoxGeometry(w, h, d)
  const panels: BufferGeometry[] = []
  const front = new BoxGeometry(w, h, t)
  front.translate(0, 0, d / 2 - t / 2)
  const back = new BoxGeometry(w, h, t)
  back.translate(0, 0, -d / 2 + t / 2)
  const left = new BoxGeometry(t, h, d - 2 * t)
  left.translate(-w / 2 + t / 2, 0, 0)
  const right = new BoxGeometry(t, h, d - 2 * t)
  right.translate(w / 2 - t / 2, 0, 0)
  const bottom = new BoxGeometry(w - 2 * t, t, d - 2 * t)
  bottom.translate(0, -h / 2 + t / 2, 0)
  panels.push(front, back, left, right, bottom)
  const merged = mergeGeometries(panels, false)
  for (const g of panels) g.dispose()
  return merged ?? new BoxGeometry(w, h, d)
}

/**
 * A hollow extrude — the outline's cross-section carved to a RING (outer outline
 * minus an inset inner outline via a `Shape` hole, `ExtrudeGeometry`'s native
 * feature) and extruded along Z, PLUS a solid bottom cap of `thickness`. So a
 * profiled prism becomes an open carcass whose walls are `thickness` (metres)
 * thick, open at the +Z extrusion end (documented: box opens +Y; the extrude
 * opens along its extrude axis — a follow-up for face choice is out of scope).
 *
 * Concave-outline honesty: the inner outline comes from `insetPolygon`; if the
 * outline is too concave for the wall thickness (the inset collapses/flips) the
 * hole is dropped and a SOLID extrude is built instead (a fail-safe). Shell
 * disables the extrude bevel (bevel + shell is out of scope). Centred on Z.
 */
export function shellExtrudeGeometry(
  outline: ProfilePoint[],
  w: number,
  h: number,
  d: number,
  thickness: number,
): BufferGeometry {
  const pts = openLoop(validateProfilePoints(outline) ? outline : EXTRUDE_PRESETS['rounded-rect'])
  const scaled = pts.map((p) => [p[0] * w, p[1] * h] as ProfilePoint)
  const t = clamp(thickness, 1e-3, Math.min(w, h) / 2 - 1e-3)
  const inner = insetPolygon(scaled, t)
  if (!inner || inner.length < 3) {
    // Outline too concave for this wall thickness — keep it solid (documented).
    return extrudeGeometry(outline, w, h, d, 0)
  }
  const wallDepth = Math.max(1e-3, d - t)
  const outerShape = shapeFromPoints(scaled)
  const hole = new Path()
  inner.forEach((p, i) => {
    if (i === 0) hole.moveTo(p[0], p[1])
    else hole.lineTo(p[0], p[1])
  })
  hole.closePath()
  outerShape.holes.push(hole)
  const wall = new ExtrudeGeometry(outerShape, {
    depth: wallDepth,
    bevelEnabled: false,
    curveSegments: 8,
  })
  wall.translate(0, 0, t)
  const cap = new ExtrudeGeometry(shapeFromPoints(scaled), {
    depth: t,
    bevelEnabled: false,
    curveSegments: 8,
  })
  const merged = mergeGeometries([cap, wall], false)
  cap.dispose()
  wall.dispose()
  const geo = merged ?? new BoxGeometry(w, h, d)
  geo.translate(0, 0, -d / 2)
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

/** Force a loop to CCW orientation (positive signed area) so loft winding is
 *  consistent regardless of how the outline was authored/edited. */
function ensureCCW(pts: ProfilePoint[]): ProfilePoint[] {
  return polygonSignedArea(pts) < 0 ? [...pts].reverse() : pts
}

/** Centroid of a point list. */
function centroid(pts: Vector3[]): Vector3 {
  const c = new Vector3()
  for (const p of pts) c.add(p)
  return c.multiplyScalar(1 / Math.max(1, pts.length))
}

/**
 * A lofted body between two horizontal cross-section outlines (`bottom` at
 * −h/2, `top` at +h/2), each a normalized centred `[x, z]` outline scaled to
 * `size[0] × size[2]`. Both are resampled to a common point count (the smaller
 * of the two, reusing `resampleProfile`) and re-oriented CCW, then stitched into
 * side-wall quads + centroid-fan caps. Built as a NON-INDEXED geometry (walls
 * and caps own separate vertices) so `computeVertexNormals` keeps the cap edges
 * crisp and never smears a twisted normal across the seam. Correct outward
 * normals + planar cap UVs; bbox tracks `size`. Pure.
 *
 * CAP LIMIT: the caps are centroid fans, exact for convex/mildly-concave
 * outlines (every preset) — a strongly concave cross-section would fan across a
 * concavity. Documented, not a crash.
 */
export function loftGeometry(
  bottom: ProfilePoint[],
  top: ProfilePoint[],
  w: number,
  h: number,
  d: number,
): BufferGeometry {
  const fallback = LOFT_PRESETS['round-square']
  let b = openLoop(validateProfilePoints(bottom) ? bottom : fallback.bottom)
  let tp = openLoop(validateProfilePoints(top) ? top : fallback.top)
  if (b.length < 3) b = openLoop(fallback.bottom)
  if (tp.length < 3) tp = openLoop(fallback.top)
  const n = Math.min(b.length, tp.length)
  b = ensureCCW(resampleProfile(b, n))
  tp = ensureCCW(resampleProfile(tp, n))
  const N = Math.min(b.length, tp.length)
  const hy = Math.max(1e-3, h) / 2
  const B = b.slice(0, N).map((p) => new Vector3(p[0] * w, -hy, p[1] * d))
  const T = tp.slice(0, N).map((p) => new Vector3(p[0] * w, hy, p[1] * d))
  const cB = centroid(B)
  const cT = centroid(T)

  const pos: number[] = []
  const uv: number[] = []
  const push = (v: Vector3, u: number, s: number) => {
    pos.push(v.x, v.y, v.z)
    uv.push(u, s)
  }
  // Side walls — one quad per edge (two triangles). Winding chosen so the
  // outward normal points away from the axis (verified in tests).
  for (let i = 0; i < N; i++) {
    const j = (i + 1) % N
    const u0 = i / N
    const u1 = (i + 1) / N
    push(B[i], u0, 0)
    push(T[i], u0, 1)
    push(B[j], u1, 0)
    push(B[j], u1, 0)
    push(T[i], u0, 1)
    push(T[j], u1, 1)
  }
  // Caps — centroid fans. Bottom faces −Y, top faces +Y.
  const capUv = (v: Vector3, half: number): [number, number] => [
    0.5 + v.x / (2 * half || 1),
    0.5 + v.z / (2 * half || 1),
  ]
  const hw = Math.max(w, d) || 1
  for (let i = 0; i < N; i++) {
    const j = (i + 1) % N
    // Bottom cap (−Y): wound so the fan normal points down.
    push(cB, ...capUv(cB, hw))
    push(B[i], ...capUv(B[i], hw))
    push(B[j], ...capUv(B[j], hw))
    // Top cap (+Y): opposite winding so the normal points up.
    push(cT, ...capUv(cT, hw))
    push(T[j], ...capUv(T[j], hw))
    push(T[i], ...capUv(T[i], hw))
  }
  const geo = new BufferGeometry()
  geo.setAttribute('position', new Float32BufferAttribute(pos, 3))
  geo.setAttribute('uv', new Float32BufferAttribute(uv, 2))
  geo.computeVertexNormals()
  return geo
}
