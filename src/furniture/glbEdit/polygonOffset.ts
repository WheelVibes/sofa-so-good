/**
 * GLB Asset Designer — pure 2D polygon-offset (inset) for the extrude shell's
 * inner hole. Split out of `shapeProfiles.ts` (the profile utils + presets base
 * module) so the offset maths + its self-intersection guards live in one place.
 *
 * ## Relationship to `src/floorplan/insetRoom.ts` (DEDUP note — reviewed)
 * The floorplan editor has its own `insetPolygon(points, dist)` for room
 * inset/outset. The two are DELIBERATELY kept separate because their required
 * behaviours genuinely differ:
 *
 *  - **Sign convention** — floorplan's is signed (dist>0 inset, dist<0 outset,
 *    dist=0 identity); this one only insets (delta>0 → the wall inward) and
 *    returns `null` for delta ≤ 0.
 *  - **Reflex clamping** — this one CLAMPS a runaway reflex miter to a bevel
 *    distance (`delta × 4`) so a mildly-concave outline still hollows instead of
 *    collapsing to a solid; the floorplan one returns `null` on any over-run (a
 *    room-edit toast, not a geometry fail-safe).
 *  - **Domain** — floorplan operates on absolute-metre room polygons; this on the
 *    designer's scaled extrude outlines.
 *
 * So this is named `insetOutline` (not `insetPolygon`) to make the distinction
 * explicit; see `src/floorplan/insetRoom.ts` for the room-editor sibling. Pure —
 * unit-tested in isolation.
 */

import { dedupeProfile, type ProfilePoint } from './shapeProfiles'

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
export function openLoop(pts: ProfilePoint[]): ProfilePoint[] {
  const out = dedupeProfile(pts)
  if (out.length >= 2) {
    const f = out[0]
    const l = out[out.length - 1]
    if (Math.abs(f[0] - l[0]) < 1e-9 && Math.abs(f[1] - l[1]) < 1e-9) out.pop()
  }
  return out
}

/** True when open segments `p1→p2` and `p3→p4` properly cross (interior
 *  intersection, endpoints excluded). Pure. */
function segmentsProperlyCross(
  p1: ProfilePoint,
  p2: ProfilePoint,
  p3: ProfilePoint,
  p4: ProfilePoint,
): boolean {
  const d1x = p2[0] - p1[0]
  const d1y = p2[1] - p1[1]
  const d2x = p4[0] - p3[0]
  const d2y = p4[1] - p3[1]
  const denom = d1x * d2y - d1y * d2x
  if (Math.abs(denom) < 1e-12) return false // parallel / collinear — not a proper cross
  const t = ((p3[0] - p1[0]) * d2y - (p3[1] - p1[1]) * d2x) / denom
  const u = ((p3[0] - p1[0]) * d1y - (p3[1] - p1[1]) * d1x) / denom
  const eps = 1e-9
  return t > eps && t < 1 - eps && u > eps && u < 1 - eps
}

/** True when the closed polygon `pts` self-intersects — any non-adjacent edge
 *  pair properly crosses. O(n²), fine for the ≤64-point designer outlines. This
 *  catches a "bowtie" inset that keeps the same winding sign + non-trivial area
 *  (so the shoelace/edge-reversal guards miss it) yet folds through itself. */
export function polygonSelfIntersects(pts: ProfilePoint[]): boolean {
  const n = pts.length
  if (n < 4) return false
  for (let i = 0; i < n; i++) {
    const a1 = pts[i]
    const a2 = pts[(i + 1) % n]
    // Only test edge pairs (i, j) with j > i and not sharing a vertex; skip the
    // wrap-adjacent pair (last edge touches the first).
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue // adjacent across the closing seam
      const b1 = pts[j]
      const b2 = pts[(j + 1) % n]
      if (segmentsProperlyCross(a1, a2, b1, b2)) return true
    }
  }
  return false
}

/**
 * Inset a simple closed polygon inward by `delta` (same units as the points) via
 * a per-vertex MITER offset: each edge is shifted inward by `delta` and adjacent
 * offset edges are intersected for the new vertex. Returns the inset polygon, or
 * `null` when it collapses / flips (the inset area vanishes or reverses
 * orientation) or self-intersects (a bowtie).
 *
 * **Concave-outline limit (documented, honest):** a miter offset is exact for
 * convex corners and mild concavity, but a deeply concave outline — where the
 * wall thickness exceeds the local half-width of a neck — will self-intersect
 * under the inset. Rather than emit a tangled inner ring, a runaway reflex miter
 * is CLAMPED to a bevel distance (`delta × 4`) and, if the whole inset still
 * collapses/flips/self-intersects, the function returns `null` so the caller can
 * fall back to a solid shape (a fail-safe, never a crash). Pure.
 */
export function insetOutline(pts: ProfilePoint[], delta: number): ProfilePoint[] | null {
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
  // Bowtie guard: a same-orientation, non-trivial-area inset can still fold
  // through itself at a concave neck (the edge-reversal check above passes when
  // each edge keeps its heading yet two non-adjacent edges cross). Reject it.
  if (polygonSelfIntersects(out)) return null
  return out
}
