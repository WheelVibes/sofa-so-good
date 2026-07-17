/**
 * Nesting side-table set layout — shared pure geometry (no three/React) between
 * the `SideTable` primitive and the `side-table` def's `footprintParts`, so the
 * rendered stagger and the collision footprint can never drift.
 *
 * A nesting set is 2–3 round tables of decreasing size, staggered along the
 * item's local +X and re-centred so the set's extent is symmetric about the
 * item origin (the largest piece is the tallest; the smaller ones tuck under at
 * lower heights — the height stagger lives in the primitive). Footprint tracks
 * the WHOLE set extent (an honest over-report vs the single largest piece,
 * matching the pets.ts enum→footprint convention).
 */
export const NEST_SCALES: Record<string, number[]> = {
  nest2: [1, 0.8],
  nest3: [1, 0.8, 0.62],
}

/** Diameter-scale factors per piece for a `set` value (`[1]` = a single table). */
export function nestScales(set: string | undefined): number[] {
  return (set && NEST_SCALES[set]) || [1]
}

/** Whether a `set` value renders more than one table. */
export function isNestSet(set: string | undefined): boolean {
  return nestScales(set).length > 1
}

export interface NestPiece {
  /** Local-X centre of the piece (m), re-centred so the set is symmetric. */
  x: number
  /** Top radius of the piece (m). */
  r: number
  /** Diameter-scale factor (largest = 1). */
  scale: number
}

/** Per-piece local X centre + radius for the largest diameter `dia`. */
export function nestPieces(dia: number, set: string | undefined): NestPiece[] {
  const scales = nestScales(set)
  const offStep = dia * 0.18
  const raw = scales.map((s, i) => ({ x0: i * offStep, r: (dia / 2) * s, scale: s }))
  const xmin = Math.min(...raw.map((p) => p.x0 - p.r))
  const xmax = Math.max(...raw.map((p) => p.x0 + p.r))
  const centre = (xmin + xmax) / 2
  return raw.map((p) => ({ x: p.x0 - centre, r: p.r, scale: p.scale }))
}

/** Footprint (w×d, m) covering the whole set for the largest diameter `dia`. */
export function nestFootprint(dia: number, set: string | undefined): { w: number; d: number } {
  const pieces = nestPieces(dia, set)
  const xmin = Math.min(...pieces.map((p) => p.x - p.r))
  const xmax = Math.max(...pieces.map((p) => p.x + p.r))
  return { w: xmax - xmin, d: dia }
}
