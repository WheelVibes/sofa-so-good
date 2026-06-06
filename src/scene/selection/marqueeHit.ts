/**
 * Pure screen-space hit test for marquee selection. Given an item's projected
 * footprint points (its 4 footprint corners + centre, in screen pixels) and the
 * marquee rectangle, returns true when the item's screen bounding box
 * *intersects* the rectangle — so dragging over part of a large piece selects it
 * (lasso-style), not only when its centre happens to fall inside the rect.
 *
 * The camera projection lives in `MarqueeSelector` (needs the live camera); this
 * is the testable geometry.
 */
export function marqueeHitsScreenPoints(
  points: ReadonlyArray<readonly [number, number]>,
  xMin: number,
  xMax: number,
  yMin: number,
  yMax: number,
): boolean {
  if (points.length === 0) return false
  let iMinX = Number.POSITIVE_INFINITY
  let iMaxX = Number.NEGATIVE_INFINITY
  let iMinY = Number.POSITIVE_INFINITY
  let iMaxY = Number.NEGATIVE_INFINITY
  for (const [x, y] of points) {
    if (x < iMinX) iMinX = x
    if (x > iMaxX) iMaxX = x
    if (y < iMinY) iMinY = y
    if (y > iMaxY) iMaxY = y
  }
  // Screen-space AABB intersection.
  return !(iMaxX < xMin || iMinX > xMax || iMaxY < yMin || iMinY > yMax)
}
