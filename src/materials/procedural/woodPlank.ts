/**
 * PC2-WOOD-GRAIN-FLOW — per-plank grain-direction variation for the wood painters
 * (`patterns/wood.ts`: straight planks, parquet, herringbone).
 *
 * Real timber boards are cut from different parts of the log, so each board's
 * cathedral/flame figure leans at a slightly different angle. The painters
 * already vary per-plank value/warmth/phase; what made the floor read repetitive
 * was that every board's grain ran in the *same* direction. This module supplies a
 * tiny, deterministic per-plank grain *lean* (a shear of the across-coordinate by
 * the along-coordinate) so the grain "flows" board-to-board.
 *
 * Pure + deterministic (a stateless integer hash, not a stateful RNG stream) so
 * adding it never perturbs the painters' existing value/warmth/phase derivation —
 * it only adds the new shear — and it unit-tests in isolation (determinism +
 * bounded range + actual board-to-board variation), like `upholsterySeams.ts`.
 *
 * Keep it **subtle**: the default lean is a couple of degrees. A larger angle
 * reads as warped/cheap laminate, not solid timber.
 */

/** Stateless 32-bit integer hash → float in [0, 1). The same mix the parquet /
 *  herringbone painters used inline; centralised here so all three share it. */
export function plankHash(n: number): number {
  let t = (n * 2654435761) >>> 0
  t ^= t >>> 15
  t = (t * 2246822519) >>> 0
  return (t >>> 8) / 16777216
}

/** Default peak grain lean, radians (~2.6°). Subtle by design. */
export const DEFAULT_GRAIN_LEAN = 0.045

/**
 * Deterministic per-plank grain lean in `[-maxRad, +maxRad]`, keyed by a seed and
 * the plank's identity number. Two distinct planks get (almost always) distinct
 * leans; the same plank always gets the same lean.
 */
export function grainLean(seed: number, plankId: number, maxRad = DEFAULT_GRAIN_LEAN): number {
  return (plankHash((seed + 1) * 73856093 + plankId * 19349663) - 0.5) * 2 * maxRad
}

/**
 * Shear the across-the-plank coordinate by the along-the-plank coordinate so the
 * grain bands (iso-lines of `across`) tilt by `leanRad`. Centred on the plank
 * mid-length so the lean pivots about the board's middle rather than sliding the
 * whole figure sideways.
 */
export function shearAcross(across: number, along: number, leanRad: number): number {
  return across + (along - 0.5) * leanRad
}
