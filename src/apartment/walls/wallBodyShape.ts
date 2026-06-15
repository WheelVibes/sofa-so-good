import type { WallSpec } from '../types'

export interface WallBodyOutline {
  /** Outer contour points [x (along-axis, centred on the wall midpoint), y (height)]. */
  outline: [number, number][]
  /** Interior hole contours (floating cutouts, e.g. windows with a sill). */
  holes: [number, number][][]
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

  const cutouts = [...wall.cutouts]
    .map((c) => ({
      a: Math.max(x0, c.offset - half),
      b: Math.min(x1, c.offset + c.width - half),
      bottom: Math.max(0, c.sill),
      top: Math.min(c.head, wallTop),
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
