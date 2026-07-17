/**
 * GLB Asset Designer — the geometry builders for the Stage-6b shape ops:
 * **shell/hollow** (open carcass on box + extrude), **loft** (a body between two
 * horizontal cross-sections) and **sweep** (a profile cross-section swept along a
 * preset/custom path). Split out of `shapeProfiles.ts` (which keeps the profile
 * utils + presets + the base box/wedge/lathe/extrude builders) so each concern is
 * a focused module.
 *
 * Everything here is pure of React/store — unit-testable on the CPU — and returns
 * finite three `BufferGeometry` with normals + UVs, footprint-centred in metres
 * like every other primitive. See `shapeProfiles.ts`'s header for the coordinate
 * conventions the outlines follow.
 */

import {
  BoxGeometry,
  BufferGeometry,
  CatmullRomCurve3,
  ExtrudeGeometry,
  Float32BufferAttribute,
  Path,
  Shape,
  TubeGeometry,
  Vector3,
} from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { insetOutline, openLoop, polygonSignedArea } from './polygonOffset'
import {
  clamp,
  dedupeProfile,
  EXTRUDE_PRESETS,
  extrudeGeometry,
  LOFT_PRESETS,
  type ProfilePoint,
  resampleProfile,
  type SweepPathKind,
  type SweepProfileKind,
  validateProfilePoints,
} from './shapeProfiles'

// ---------------------------------------------------------------------------
// Sweep (Stage 1a + 6b) — a preset cross-section swept along a path.
// ---------------------------------------------------------------------------

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
 * Concave-outline honesty: the inner outline comes from `insetOutline`; if the
 * outline is too concave for the wall thickness (the inset collapses/flips/
 * self-intersects) the hole is dropped and a SOLID extrude is built instead (a
 * fail-safe). Shell disables the extrude bevel (bevel + shell is out of scope).
 * Centred on Z.
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
  const inner = insetOutline(scaled, t)
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
 * Rotate the top vertices so `T[i]` pairs with `B[i]` under the LEAST total
 * squared XZ distance — a best-offset search over all N cyclic rotations (N is
 * small). Both loops are already CCW, so only a cyclic START-INDEX offset can
 * remain (introduced when `ensureCCW` reverses a CW-authored top: the reversal
 * lands the start vertex at a mirrored index, twisting the side walls). Realigning
 * the start index removes that twist so a CCW-bottom + CW-top pair lofts to the
 * same untwisted body as a both-CCW pair. Pure.
 */
function alignTopToBottom(B: Vector3[], T: Vector3[]): Vector3[] {
  const N = B.length
  if (N === 0 || T.length !== N) return T
  let best = 0
  let bestSum = Number.POSITIVE_INFINITY
  for (let k = 0; k < N; k++) {
    let sum = 0
    for (let i = 0; i < N; i++) {
      const t = T[(i + k) % N]
      const b = B[i]
      const dx = b.x - t.x
      const dz = b.z - t.z
      sum += dx * dx + dz * dz
    }
    if (sum < bestSum) {
      bestSum = sum
      best = k
    }
  }
  if (best === 0) return T
  const rotated: Vector3[] = []
  for (let i = 0; i < N; i++) rotated.push(T[(i + best) % N])
  return rotated
}

/**
 * A lofted body between two horizontal cross-section outlines (`bottom` at
 * −h/2, `top` at +h/2), each a normalized centred `[x, z]` outline scaled to
 * `size[0] × size[2]`. Both are resampled to a common point count (the smaller
 * of the two, reusing `resampleProfile`) and re-oriented CCW, the top's start
 * index is aligned to the bottom (no winding twist — `alignTopToBottom`), then
 * stitched into side-wall quads + centroid-fan caps. Built as a NON-INDEXED
 * geometry (walls and caps own separate vertices) so `computeVertexNormals` keeps
 * the cap edges crisp and never smears a twisted normal across the seam. Correct
 * outward normals + planar cap UVs; bbox tracks `size`. Pure.
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
  const T = alignTopToBottom(
    B,
    tp.slice(0, N).map((p) => new Vector3(p[0] * w, hy, p[1] * d)),
  )
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
