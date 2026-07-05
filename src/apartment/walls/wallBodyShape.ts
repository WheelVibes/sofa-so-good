import type { WallSpec } from '../types'

export interface WallBodyOutline {
  /** Outer contour points [x (along-axis, centred on the wall midpoint), y (height)]. */
  outline: [number, number][]
  /** Interior hole contours (floating cutouts, e.g. windows with a sill). */
  holes: [number, number][][]
}

/** A door/window cutout already expressed in the wall's centred along-axis frame
 *  (metres): `[a, b]` is the along-axis span, `[bottom, top]` the height span. */
export interface WallCutoutSpan {
  a: number
  b: number
  bottom: number
  top: number
}

/**
 * How much smaller (per edge, metres) the per-room editor carves an opening than
 * the door leaf / window pane that sits in it. The leaf/pane is placed flush to
 * the opening spec, so an exact hole leaves the leaf's side/top faces COPLANAR
 * with the opening's jambs/header — z-fighting that flickers the leaf's edge
 * ("thickness") in and out as the camera orbits. Carving the hole a hair smaller
 * makes the leaf overlap the wall so its edges are cleanly occluded (no coplanar
 * faces); the tiny overlap is invisible and, unlike enlarging the hole, leaves
 * no see-through gap around the leaf on an opaque wall.
 */
export const OPENING_CLEARANCE = 0.01

/**
 * Core outline builder shared by {@link buildWallBodyOutline} (built-in flats)
 * and the per-room editor (which maps its clipped walls' openings into this
 * centred frame). `x0`/`x1` are the outer contour's left/right edges (already
 * including any abutment extension); cutouts are clamped to `[x0, x1]` × `[0,
 * wallTop]` and dropped when degenerate. Floor-reaching cutouts (`bottom <= 0`,
 * i.e. doors) become bottom notches; floating ones (windows) become interior
 * holes. `clearance` (default 0) shrinks every cutout inward by that many metres
 * per edge (see {@link OPENING_CLEARANCE}); a door keeps its floor edge at 0.
 * Pure.
 */
export function wallBodyOutlineFromSpans(
  spans: WallCutoutSpan[],
  x0: number,
  x1: number,
  wallTop: number,
  clearance = 0,
): WallBodyOutline {
  const cutouts = spans
    .map((c) => ({
      a: Math.max(x0, c.a + clearance),
      b: Math.min(x1, c.b - clearance),
      // Doors reach the floor (bottom ≤ 0) and must stay there; windows pull
      // their sill in too.
      bottom: c.bottom > 1e-6 ? c.bottom + clearance : 0,
      top: Math.min(c.top, wallTop) - clearance,
    }))
    .filter((c) => c.top > c.bottom && c.b > c.a)
    .sort((p, q) => p.a - q.a)

  const bottomNotches = cutouts.filter((c) => c.bottom <= 1e-6)
  const windows = cutouts.filter((c) => c.bottom > 1e-6)

  // Outer contour: along the bottom edge (carving an up-over-down notch for each
  // floor-reaching cutout), up the right edge, across the top, down the left.
  const outline: [number, number][] = [[x0, 0]]
  for (const c of bottomNotches) {
    outline.push([c.a, 0], [c.a, c.top], [c.b, c.top], [c.b, 0])
  }
  outline.push([x1, 0], [x1, wallTop], [x0, wallTop])

  const holes: [number, number][][] = windows.map((c) => [
    [c.a, c.bottom],
    [c.b, c.bottom],
    [c.b, c.top],
    [c.a, c.top],
  ])

  return { outline, holes }
}

/**
 * Build a wall body's cross-section (along-axis × height) as ONE watertight
 * outline plus interior holes, so the body can render as a single extruded
 * mesh with no internal segment seams. Previously the body was a set of
 * abutting boxes (jambs / sill / header); once the wall fades translucent for
 * the dollhouse reveal, those boxes' internal end-cap faces showed through as
 * floor-to-ceiling lines at every window/door edge. A single watertight shape
 * has no internal faces, so the translucent wall reads seamlessly.
 *
 * Cutouts that reach the floor (`sill <= 0`, i.e. doors) are carved as notches
 * in the bottom edge; floating cutouts (`sill > 0`, i.e. windows) become
 * interior holes. Heads are clamped to the wall top. The outline is centred on
 * the wall midpoint and extended at each end by the abutting wall's
 * half-thickness so outside corners still close flush.
 */
export function buildWallBodyOutline(
  wall: WallSpec,
  wallTop: number,
  length: number,
  startAbut: number,
  endAbut: number,
): WallBodyOutline {
  const x0 = -length / 2 - startAbut
  const x1 = length / 2 + endAbut
  const half = length / 2

  const spans: WallCutoutSpan[] = wall.cutouts.map((c) => ({
    a: c.offset - half,
    b: c.offset + c.width - half,
    bottom: c.sill,
    top: c.head,
  }))

  // Carve the opening a hair smaller than the leaf/pane (same `OPENING_CLEARANCE`
  // the per-room editor uses) so the door/window overlaps the jamb instead of
  // sitting COPLANAR with it — coplanar faces z-fight and flicker the opening's
  // edges as the camera orbits (worse now that faded walls write depth). The
  // overlap is invisible and leaves no see-through gap on an opaque wall.
  return wallBodyOutlineFromSpans(spans, x0, x1, wallTop, OPENING_CLEARANCE)
}
