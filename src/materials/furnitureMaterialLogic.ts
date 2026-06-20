/**
 * Pure, three-free material logic for furniture finishes — deterministic
 * hashing and the roughness / sheen / appliance-finish computations extracted
 * out of `furnitureMaterials.ts` so they can be reasoned about + unit-tested
 * without constructing any three.js `Material`. Everything here takes
 * primitives / plain data and returns primitives / plain data; the three.js
 * material construction stays in `furnitureMaterials.ts`.
 */

import { clamp01 } from './procedural/noise'

/** Deterministic 0..1 hash for per-plank / per-cell variation (no allocation).
 *  The classic `fract(sin(n) * C)` hash: stable across runs (same input → same
 *  output) and well-spread for distinct integer-ish seeds. */
export function hash01(n: number): number {
  const s = Math.sin(n * 12.9898) * 43758.5453
  return s - Math.floor(s)
}

/** Continuous "shine" 0..1 → roughness: 0 keeps the material's natural matte
 *  `base` roughness, 1 drives it to a high-gloss `0.04`. Lets any colour +
 *  material be tuned matte → satin → gloss. `sheen` is clamped to [0,1]. */
export function sheenRough(base: number, sheen: number): number {
  const s = Math.min(1, Math.max(0, sheen))
  return base * (1 - s) + 0.04 * s
}

/** A pair of `meshStandardMaterial` scalar props. */
export interface SurfaceFinishProps {
  roughness: number
  metalness: number
}

/**
 * Surface-finish presets for hard appliance / fixture bodies. Returns plain
 * roughness / metalness so the same painted / steel / gloss look is consistent
 * across the fridge, washer, oven, hood, microwave, etc. Colour is supplied
 * separately. Unknown finishes (and `'matte'`) fall back to the painted-matte
 * preset.
 */
export function applianceFinish(finish: string): SurfaceFinishProps {
  switch (finish) {
    case 'steel': // brushed stainless steel
      return { roughness: 0.3, metalness: 0.88 }
    case 'gloss': // glossy lacquer / glass front
      return { roughness: 0.12, metalness: 0.25 }
    default: // 'matte' (painted matte) and any unknown finish
      return { roughness: 0.55, metalness: 0.1 }
  }
}

/**
 * Lift a colour's components toward white (`1,1,1`) by `amount` (clamped to
 * [0,1]) — the per-component lerp behind a velvet / satin sheen lobe that reads
 * brighter than the cloth body. Operates on whatever component space it is
 * given (the caller passes three's linear-RGB components), so it stays three
 * free while preserving byte-identical results. `amount` 0 returns the input
 * unchanged; 1 returns pure white.
 */
export function liftedSheenRgb(
  rgb: readonly [number, number, number],
  amount: number,
): [number, number, number] {
  const t = clamp01(amount)
  return [rgb[0] + (1 - rgb[0]) * t, rgb[1] + (1 - rgb[1]) * t, rgb[2] + (1 - rgb[2]) * t]
}
