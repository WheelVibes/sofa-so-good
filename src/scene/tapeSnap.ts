/**
 * Snap a tape-measure click to the nearest candidate point (furniture footprint
 * corner or wall endpoint) within a radius, so distances catch exact corners
 * instead of approximate floor taps. Pure + unit-tested; the candidate set is
 * assembled by `TapeMeasure` from the live scene.
 */
export const TAPE_SNAP_DISTANCE = 0.3

export function snapToNearest(
  px: number,
  pz: number,
  candidates: ReadonlyArray<readonly [number, number]>,
  threshold = TAPE_SNAP_DISTANCE,
): [number, number] {
  let best: [number, number] | null = null
  let bestSq = threshold * threshold
  for (const [cx, cz] of candidates) {
    const dsq = (cx - px) ** 2 + (cz - pz) ** 2
    if (dsq < bestSq) {
      bestSq = dsq
      best = [cx, cz]
    }
  }
  return best ?? [px, pz]
}
