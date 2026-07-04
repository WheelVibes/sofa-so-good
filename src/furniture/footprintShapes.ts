/**
 * Round/oval footprint approximation for `footprintParts` (TODO "More composite
 * footprints"). `footprintParts` is a UNION of OBBs — it can only add area, never
 * carve a rectangle down to a disc — so a true circle/ellipse isn't representable
 * exactly. This approximates one with a small "staircase" of axis-aligned boxes
 * inscribed in the ellipse, which is enough to open up the bbox corners a round/
 * oval table never actually occupies (the case placement/collision cares about)
 * without an intersection/polygon footprint primitive.
 *
 * Pure geometry — render-agnostic, no store/three imports — so it's unit-tested
 * directly (see footprintShapes.test.ts).
 */

import type { FootprintPart } from './types'

/**
 * Approximates an ellipse (or circle, when `width === depth`) inscribed in a
 * `width` × `depth` bounding box as a union of axis-aligned {@link FootprintPart}
 * boxes, each entirely inside the ellipse.
 *
 * Method: sample `steps` angles over a quarter-ellipse (0 → π/2) and build one
 * horizontal band per angle interval, sized to the ellipse's extent at the
 * band's *outer* (larger-|z|) angle. Because `cos²θ + sin²θ = 1`, that band's far
 * corner always lands exactly ON the ellipse and every other point in the band is
 * strictly inside it — so the whole union is a subset of the true ellipse (and
 * therefore of the `width`×`depth` bbox), never poking past either. The band
 * that straddles the centre axis (z ≈ 0) is emitted once (not mirrored, since it
 * already spans both sides); the outermost band is always zero-width (the
 * ellipse's extent at θ=π/2 is 0) and is skipped. That yields `2*steps - 3`
 * boxes for `steps >= 2` — `steps=4` (the default) gives 5, enough to visibly
 * free the bbox corners while keeping collision cost bounded.
 *
 * Degenerates to a single full-size box (identical to the old single-OBB
 * footprint) when either extent is non-positive or `steps < 2`.
 */
export function ellipseFootprintParts(width: number, depth: number, steps = 4): FootprintPart[] {
  const rx = width / 2
  const rz = depth / 2
  const n = Math.round(steps)
  if (!(rx > 0) || !(rz > 0) || n < 2) {
    return [{ dx: 0, dz: 0, w: Math.max(width, 0), d: Math.max(depth, 0) }]
  }

  const theta = (i: number) => (i / n) * (Math.PI / 2)
  const xAt = (t: number) => rx * Math.cos(t)
  const zAt = (t: number) => rz * Math.sin(t)

  const parts: FootprintPart[] = []

  // Centre band (k=0), spanning both sides of z=0 in one box.
  const z1 = zAt(theta(1))
  const x1 = xAt(theta(1))
  parts.push({ dx: 0, dz: 0, w: x1 * 2, d: z1 * 2 })

  // Side bands k=1..n-2, mirrored above/below the centre band.
  // (k=n-1 is the degenerate 0-width outer band at θ=π/2 — always skipped.)
  for (let k = 1; k <= n - 2; k++) {
    const zLo = zAt(theta(k))
    const zHi = zAt(theta(k + 1))
    const xHi = xAt(theta(k + 1))
    const bandD = zHi - zLo
    const bandZ = (zLo + zHi) / 2
    parts.push({ dx: 0, dz: bandZ, w: xHi * 2, d: bandD })
    parts.push({ dx: 0, dz: -bandZ, w: xHi * 2, d: bandD })
  }
  return parts
}
