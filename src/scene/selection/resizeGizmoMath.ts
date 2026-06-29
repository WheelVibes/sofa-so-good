/**
 * Pure math for the group **resize** gizmo (PARITY-GROUP-RESIZE), shared by the
 * 2D plan editor's corner handles and the 3D `ResizeGizmo`. Dragging a corner
 * scales the whole selection uniformly about the opposite corner (the pivot):
 * each member's distance from the pivot AND its uniform scale multiply by the
 * same factor, so the selection grows/shrinks as one rigid block (Canva parity).
 *
 * Pure (no three/React/store) so it unit-tests in isolation.
 */

export const RESIZE_MIN_FACTOR = 0.2
export const RESIZE_MAX_FACTOR = 5

/** The uniform scale factor from the grab distance (pivot→grab) and the current
 *  pointer distance (pivot→cursor), clamped to a sane range. A non-positive /
 *  non-finite input collapses to 1 (no-op) or the clamp bound. */
export function groupResizeFactor(
  grabDist: number,
  currentDist: number,
  min = RESIZE_MIN_FACTOR,
  max = RESIZE_MAX_FACTOR,
): number {
  if (!Number.isFinite(grabDist) || grabDist <= 0) return 1
  const f = currentDist / grabDist
  if (!Number.isFinite(f) || f <= 0) return min
  return Math.max(min, Math.min(max, f))
}

/** A member's transform after a group resize: position scaled about the pivot,
 *  uniform scale multiplied by the factor (rounded to 3 dp for tidy values). */
export function resizedTransform(
  origPosition: readonly [number, number],
  origScale: number,
  pivot: readonly [number, number],
  factor: number,
): { position: [number, number]; scale: number } {
  return {
    position: [
      pivot[0] + (origPosition[0] - pivot[0]) * factor,
      pivot[1] + (origPosition[1] - pivot[1]) * factor,
    ],
    scale: Math.round(origScale * factor * 1000) / 1000,
  }
}
