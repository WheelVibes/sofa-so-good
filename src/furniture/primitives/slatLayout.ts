/**
 * Pure layout maths for slatted / battened / grid primitives (room dividers,
 * fluted feature walls, screens, cube shelves). Kept render-agnostic so it can
 * be unit-tested without a GPU and reused by any primitive that lays out a run
 * of evenly-spaced battens. The primitive maps the returned centres onto
 * meshes or — for the common case of many identical boxes sharing one material
 * — onto a single `InstancedBoxes` draw call.
 */

/** Batten count for a span that places `n` battens of `battenW` separated by a
 *  target `gap`, matching the `Math.max(1, Math.round((span-battenW)/(battenW+
 *  gap)))` idiom shared by the room divider's slats/grid. */
export function battenCount(span: number, battenW: number, gap: number): number {
  return Math.max(1, Math.round((span - battenW) / (battenW + gap)))
}

/** Even step between `n` battens spanning `span`, with the first/last centred
 *  `battenW/2` inside the ends (0 when there is a single batten). */
export function battenStep(span: number, battenW: number, n: number): number {
  return n > 1 ? (span - battenW) / (n - 1) : 0
}

/** Centre offset of batten `i` for the above step layout. */
export function battenOffset(span: number, battenW: number, step: number, i: number): number {
  return -span / 2 + battenW / 2 + i * step
}

/** Vertical-batten count for a fixed pitch (≥ a floor count). Mirrors the
 *  `Math.max(min, Math.round(width / pitch))` idiom used by the feature wall. */
export function pitchedCount(width: number, pitch: number, min: number): number {
  return Math.max(min, Math.round(width / pitch))
}

/** Centre offsets for `count` battens at a uniform `step = width/count`, each
 *  centred in its cell: `-width/2 + step/2 + i*step`. Used by the fixed-pitch
 *  feature wall. */
export function pitchedOffsets(width: number, count: number): number[] {
  const step = width / count
  return Array.from({ length: count }, (_, i) => -width / 2 + step / 2 + i * step)
}
