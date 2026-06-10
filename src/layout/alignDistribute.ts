/**
 * Pure align / distribute maths for multi-selected furniture, kept render- and
 * store-agnostic so it can be unit-tested in isolation. The inspector computes
 * each item's axis-aligned extent (from its footprint OBB) and feeds these
 * boxes in; the helpers return the new centre per id along that one axis.
 */

/** A 1-D projection of an item onto the align/distribute axis. */
export interface AxisBox {
  id: string
  /** Centre coordinate along the axis (metres). */
  center: number
  /** Half-extent along the axis (metres) — the AABB half-width of the footprint. */
  half: number
}

/**
 * Align centres to the mean centre of the selection (footprint-independent).
 * Returns the shared target centre, or `null` for fewer than two boxes.
 */
export function alignCenter(boxes: AxisBox[]): number | null {
  if (boxes.length < 2) return null
  return boxes.reduce((a, b) => a + b.center, 0) / boxes.length
}

/**
 * Align one edge of every box to the matching extreme edge of the selection:
 * `min` snaps every near-edge to the smallest near-edge, `max` every far-edge to
 * the largest far-edge. Footprint-aware. Returns new centres by id.
 */
export function alignEdge(boxes: AxisBox[], side: 'min' | 'max'): Map<string, number> {
  const out = new Map<string, number>()
  if (boxes.length < 2) return out
  const target =
    side === 'min'
      ? Math.min(...boxes.map((b) => b.center - b.half))
      : Math.max(...boxes.map((b) => b.center + b.half))
  for (const b of boxes) {
    out.set(b.id, side === 'min' ? target + b.half : target - b.half)
  }
  return out
}

/**
 * Distribute boxes with **even gaps** between their edges. The two extreme boxes
 * stay put; the rest are spaced so every consecutive edge-to-edge gap is equal —
 * unlike a naive centre-spacing, this stays even when items differ in size.
 * Returns new centres by id (needs at least three boxes, else empty).
 */
export function distributeEvenGaps(boxes: AxisBox[]): Map<string, number> {
  const out = new Map<string, number>()
  if (boxes.length < 3) return out
  const sorted = [...boxes].sort((a, b) => a.center - b.center)
  const first = sorted[0]
  const last = sorted[sorted.length - 1]
  const lo = first.center - first.half
  const hi = last.center + last.half
  const totalWidth = sorted.reduce((a, b) => a + b.half * 2, 0)
  const gap = (hi - lo - totalWidth) / (sorted.length - 1)
  let cursor = lo
  for (const b of sorted) {
    const newCenter = cursor + b.half
    out.set(b.id, newCenter)
    cursor = newCenter + b.half + gap
  }
  return out
}

/**
 * Half-extent of a footprint OBB projected onto an axis (0 = X, 1 = Z) — the
 * axis-aligned bounding half-width of a possibly-rotated box.
 */
export function obbAxisHalf(hx: number, hz: number, rot: number, axis: 0 | 1): number {
  const c = Math.abs(Math.cos(rot))
  const s = Math.abs(Math.sin(rot))
  return axis === 0 ? hx * c + hz * s : hx * s + hz * c
}
