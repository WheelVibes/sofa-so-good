/**
 * WOOD-PORE-NYQUIST — the open-pore streaks in the FURNITURE wood tile, sampled
 * inside the tile's resolution instead of ~27x past it.
 *
 * ## The defect
 *
 * `furnitureMaterials.ts:getWoodMaps` builds one shared 256² wood tile and
 * describes its pore field as "long open pores streaking along the grain
 * (sampled wide in u, narrow in v so the noise smears into lengthwise hairlines,
 * not dots)". The intent is right; the magnitude was not. The field was
 * `makeFbm(seed, 3, 48)` evaluated at `(u * 18, v * 1.2)`, and `makeFbm` scales
 * its input by `baseFreq * 2 ** octave` — so across one tile the u axis carried
 *
 *     octave 0:  48 * 18      =   864 cycles  =  3.4 cycles per texel
 *     octave 2:  48 * 4 * 18  = 3456 cycles  = 13.5 cycles per texel
 *
 * against a Nyquist limit of 0.5 cycles per texel. EVERY octave was
 * undersampled, the lowest by a factor of seven — so the field was not hairlines
 * at all, it was deterministic white noise. `heightToNormalRGBA(height, N, 3)`
 * then turned that per-texel noise into a per-texel random normal.
 *
 * ## Why it mattered
 *
 * White noise in the height channel reads as a pebbly dimple pattern under
 * specular light, which is what made every wood furniture surface look like
 * moulded plastic or gingerbread rather than timber. Measured on the default
 * flat's dining chairs at walk/Medium/09:00, over WOOD PIXELS ONLY (a raycast
 * mask — see `scripts/dev-probes/wood-detail.mjs`), the grain was invisible at
 * the shipped `repeat = 1` while the aliased speckle dominated the surface.
 *
 * ## The parameters
 *
 * Anisotropy is what makes a pore a streak rather than a dot, so the fix keeps
 * the original 15:1 u:v ratio exactly and only brings the absolute frequency
 * inside the tile. `V_SCALE = U_SCALE / PORE_ANISOTROPY` by construction, so the
 * ratio cannot drift when someone retunes the density.
 *
 * `NYQUIST` is checked by `woodPore.test.ts` rather than asserted at runtime —
 * this runs inside a texture bake on the main thread and in the procedural
 * worker, and a throw there would take the whole material down for a tuning
 * mistake that a test catches for free.
 */
import { clamp01, makeFbm } from './noise'

/** Highest spatial frequency a tile of `size` texels can represent, in cycles
 *  per texel. Above this a field aliases into noise instead of carrying detail. */
export const NYQUIST_CYCLES_PER_TEXEL = 0.5

/**
 * Cycles per texel in the TOP (finest) octave of an fbm field — the octave that
 * decides whether the field is resolvable at all.
 *
 * `makeFbm(seed, octaves, baseFreq)` multiplies its input by
 * `baseFreq * 2 ** octave`, and callers additionally scale the input
 * (`fbm(u * uvScale, …)`), so the finest octave lands at
 * `baseFreq * 2 ** (octaves - 1) * uvScale` cycles across the tile.
 */
export function topOctaveCyclesPerTexel(
  baseFreq: number,
  octaves: number,
  uvScale: number,
  size: number,
): number {
  return (baseFreq * 2 ** (octaves - 1) * uvScale) / size
}

/** How much longer a pore is along the grain than across it. Preserved from the
 *  original field so the streak character is unchanged — only the absolute
 *  frequency moved. */
export const PORE_ANISOTROPY = 15

export const WOOD_PORE = {
  seed: 0x2c7a,
  octaves: 2,
  baseFreq: 2.7,
  /** Across the grain: ~49 cycles per tile at octave 0, ~97 at the top — a
   *  hairline every ~2.6 texels, comfortably inside Nyquist. */
  uScale: 18,
  vScale: 18 / PORE_ANISOTROPY,
  /** Pores are sparse: the field is thresholded so only the darkest fraction
   *  becomes an open pore, then scaled back to 0..1. */
  threshold: 0.6,
  gain: 2.5,
} as const

/**
 * The pore field for one wood tile: `(u, v) -> 0..1`, where 1 is a fully open
 * pore. Deterministic and worker-safe; no canvas, no three.
 */
export function makeWoodPore(): (u: number, v: number) => number {
  const { seed, octaves, baseFreq, uScale, vScale, threshold, gain } = WOOD_PORE
  const fbm = makeFbm(seed, octaves, baseFreq)
  return (u, v) => clamp01((fbm(u * uScale, v * vScale) - threshold) * gain)
}
