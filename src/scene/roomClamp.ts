interface Rect {
  x0: number
  z0: number
  x1: number
  z1: number
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v
}

/**
 * Clamp a furniture footprint centre so it stays inside the room — IKEA-planner
 * style, where a piece can't be dragged out past the walls / room boundary. The
 * centre is constrained to the union of the room's footprint rects, each inset by
 * the item's (rotated-AABB) half-extents so the whole footprint stays inside. For
 * an L-shaped room (multiple rects) the nearest rect wins; a rect too small for
 * the item centres it on that rect rather than producing an inverted range.
 */
export function clampCentreToRects(
  cx: number,
  cz: number,
  hx: number,
  hz: number,
  rects: Rect[],
): [number, number] {
  if (rects.length === 0) return [cx, cz]
  let best: [number, number] | null = null
  let bestD = Number.POSITIVE_INFINITY
  for (const r of rects) {
    const minx = r.x0 + hx
    const maxx = r.x1 - hx
    const minz = r.z0 + hz
    const maxz = r.z1 - hz
    const px = minx <= maxx ? clamp(cx, minx, maxx) : (r.x0 + r.x1) / 2
    const pz = minz <= maxz ? clamp(cz, minz, maxz) : (r.z0 + r.z1) / 2
    const d = (px - cx) ** 2 + (pz - cz) ** 2
    if (d < bestD) {
      bestD = d
      best = [px, pz]
    }
  }
  return best ?? [cx, cz]
}

/**
 * True when a footprint centre already sits inside the room's placeable area
 * (the union of `rects`, inset by the item's half-extents) — i.e. clamping
 * wouldn't move it. Used to flag an out-of-room drag as invalid (red) instead
 * of silently clamping it back in (bug #5). No rects → no room constraint → true.
 */
export function isCentreInsideRects(
  cx: number,
  cz: number,
  hx: number,
  hz: number,
  rects: Rect[],
): boolean {
  if (rects.length === 0) return true
  const [px, pz] = clampCentreToRects(cx, cz, hx, hz, rects)
  return Math.abs(px - cx) < 1e-4 && Math.abs(pz - cz) < 1e-4
}
