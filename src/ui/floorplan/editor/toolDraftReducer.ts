/**
 * Pure tool draft-state transitions for the 2D Floor Plan Editor
 * (MOD-FPE-SPLIT).
 *
 * The editor's pointer handlers (`onDown`/`onMove`/`onUp` in
 * `FloorPlanEditor.tsx`) drive a small per-tool state machine: a drag draft
 * (wall / room / scale / dimension), a growing polygon (polyroom / polyline),
 * and a wall rotate gesture. The *decisions* in that machine — "is this draft
 * big enough to commit?", "does this click close the polygon or add a vertex?",
 * "where does the rotated wall land?" — are side-effect-free math.
 *
 * This module holds exactly that math, free of React / DOM / store / three so
 * each transition unit-tests in isolation. Every function is parameterised on
 * its inputs (the draft, the click point, a snap function passed in) and returns
 * a plain description of *what to do*; the component stays the thin dispatcher
 * that owns the React state and performs the store writes. Behaviour is
 * identical to the inline logic it replaced — this is a pure extraction.
 *
 * Coordinates are metres in the apartment frame (same as the rest of the app).
 */

/** A drag draft: the anchor (x0,z0) and the live endpoint (x,z), in metres. */
export interface Draft {
  x0: number
  z0: number
  x: number
  z: number
}

/** Axis-aligned rect (origin + size) in metres — the bbox of a draft / polygon. */
export interface PlanRect {
  origin: [number, number]
  width: number
  depth: number
}

/** Straight-line length (m) of a draft's anchor→endpoint span. */
export function draftLength(d: Draft): number {
  return Math.hypot(d.x - d.x0, d.z - d.z0)
}

/**
 * The axis-aligned bounding rect of a set of polygon vertices. Width/depth are
 * floored to 0.1 m so a degenerate (collinear / single-point) polygon still
 * yields a usable, non-zero footprint — matching the room-commit + polygon
 * vertex-drag paths that keep a room's `origin/width/depth` in sync with its
 * polygon's bbox.
 */
export function rectFromVerts(verts: readonly [number, number][]): PlanRect {
  const xs = verts.map((v) => v[0])
  const zs = verts.map((v) => v[1])
  const x0 = Math.min(...xs)
  const z0 = Math.min(...zs)
  return {
    origin: [x0, z0],
    width: Math.max(0.1, Math.max(...xs) - x0),
    depth: Math.max(0.1, Math.max(...zs) - z0),
  }
}

/** The axis-aligned rect a rectangular-room draft describes (min corner + size). */
export function rectFromDraft(d: Draft): PlanRect {
  return {
    origin: [Math.min(d.x0, d.x), Math.min(d.z0, d.z)],
    width: Math.abs(d.x - d.x0),
    depth: Math.abs(d.z - d.z0),
  }
}

/**
 * Whether a freehand wall draft is long enough to commit, and its endpoints.
 * Mirrors the editor's `> 0.2` m threshold. A typed numeric-entry endpoint, when
 * present, replaces the dragged endpoint *before* the length test (so a tiny
 * drag that the user overrode with a number still commits).
 */
export function wallCommit(
  d: Draft,
  numericEnd: [number, number] | null,
): { start: [number, number]; end: [number, number] } | null {
  const ex = numericEnd ? numericEnd[0] : d.x
  const ez = numericEnd ? numericEnd[1] : d.z
  if (Math.hypot(ex - d.x0, ez - d.z0) <= 0.2) return null
  return { start: [d.x0, d.z0], end: [ex, ez] }
}

/**
 * Whether a mobile wall tap-chain segment is long enough to place. The touch
 * tap-to-place path uses the same `> 0.2` m threshold but never consults the
 * numeric-entry endpoint (it chains from the placed end instead).
 */
export function wallTapCommits(d: Draft): boolean {
  return draftLength(d) > 0.2
}

/**
 * Whether a rectangular-room draft is large enough to commit (both sides
 * `> 0.3` m), and the rect it describes. Returns `null` for a too-small drag.
 */
export function roomCommit(d: Draft): PlanRect | null {
  const rect = rectFromDraft(d)
  if (rect.width > 0.3 && rect.depth > 0.3) return rect
  return null
}

/**
 * Whether a dimension-line draft is long enough to commit (`> 0.1` m), and its
 * snapped endpoints. `snap` is the editor's grid-snap fn passed in.
 */
export function dimensionCommit(
  d: Draft,
  snap: (m: number) => number,
): { a: [number, number]; b: [number, number] } | null {
  if (draftLength(d) <= 0.1) return null
  return { a: [snap(d.x0), snap(d.z0)], b: [snap(d.x), snap(d.z)] }
}

/** Whether a scale-calibration draft spans a usable distance (`> 0.05` m). */
export function scaleCommits(d: Draft): boolean {
  return draftLength(d) > 0.05
}

/**
 * Result of a polygon-tool click (polyroom / polyline): either close the
 * polygon (the click landed on the first vertex with enough points placed) or
 * append `point` as a new vertex.
 */
export type PolygonClick = { type: 'close' } | { type: 'add'; point: [number, number] }

/**
 * Decide what a polygon-tool click does. The click closes the polygon when
 * there are at least `minToClose` vertices AND the click is within
 * `closeRadius` m of the first vertex; otherwise it appends a vertex. Matches
 * the polyroom / polyline close test (`>= 3` points, 0.35 m radius).
 */
export function polygonClick(
  verts: readonly [number, number][],
  point: [number, number],
  opts: { minToClose?: number; closeRadius?: number } = {},
): PolygonClick {
  const minToClose = opts.minToClose ?? 3
  const closeRadius = opts.closeRadius ?? 0.35
  const first = verts[0]
  if (
    first &&
    verts.length >= minToClose &&
    Math.hypot(first[0] - point[0], first[1] - point[1]) < closeRadius
  ) {
    return { type: 'close' }
  }
  return { type: 'add', point }
}

/**
 * The new endpoints of a wall being rotated about a pivot. Mirrors the editor's
 * rotate-ring math: the turn is the change in pointer bearing about (cx,cz),
 * wrapped to (-π, π] and clamped to ±90° each way (a larger turn would swing the
 * segment back across its neighbours and tangle the shared corners). Each
 * endpoint is rotated about the pivot and run through `snap` per-axis.
 */
export function rotateWallTransform(
  pivot: [number, number],
  startAngle: number,
  pointerX: number,
  pointerZ: number,
  s0: [number, number],
  e0: [number, number],
  snap: (m: number) => number,
): { start: [number, number]; end: [number, number] } {
  const [cx, cz] = pivot
  const ang = Math.atan2(pointerZ - cz, pointerX - cx)
  let d = ang - startAngle
  d = Math.atan2(Math.sin(d), Math.cos(d))
  d = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, d))
  const cos = Math.cos(d)
  const sin = Math.sin(d)
  const rot = (p: [number, number]): [number, number] => {
    const x = p[0] - cx
    const z = p[1] - cz
    return [snap(cx + x * cos - z * sin), snap(cz + x * sin + z * cos)]
  }
  return { start: rot(s0), end: rot(e0) }
}
