/**
 * MAT-003 — procedural painted-plaster / concrete "roller-nap" micro-detail.
 *
 * Painted plaster and microcement walls read as a dead-flat matte colour without
 * the one cue a roller-applied paint always carries:
 *
 *  - **roller-nap roughness drift** — a paint roller leaves a faint stipple /
 *    "orange peel": broad patches of slightly heavier vs lighter coverage (the
 *    nap loading/unloading as it rolls) overlaid with a fine pebbly micro-texture
 *    (the nap fibres themselves). On a matte wall this shows up as a *very* subtle
 *    drift in the roughness (and a whisper of relief under grazing light), never a
 *    gloss change — the wall stays matte, it just stops reading as a single flat
 *    specular value.
 *
 * This module is the pure, deterministic, worker-safe helper (mirrors
 * `stoneSurface.ts` / `tileSurface.ts` / `upholsterySeams.ts`): tiny tunable
 * params, integer fbm freq, every channel behind a `0..1` intensity with a
 * conservative default. It does NOT own the wall colour — the painter
 * (`patterns/wall.ts:plasterFields`) / singleton (`generators.ts:getPlasterNormal`)
 * paints the tint and asks this helper for the signed roughness drift. The helper's
 * job is the ROUGHNESS drift the plan called out (the existing orange-peel field in
 * `plasterFields` already supplies the whisper of normal relief).
 *
 * No geometry — material maps only, so there is nothing to z-fight.
 *
 * Tasteful by default (the fabric/stone lesson): the drift is a whisper and stays
 * MATTE (these are matte walls — over-doing it looks like stucco / textured-coat).
 * `nap: 0` cleanly drops the drift back to the surface's single flat roughness.
 */
import { makeFbm } from './noise'

/** Tuning for the roller-nap micro-detail. Intensity is a 0..1 multiplier over a
 *  baked-in tasteful amplitude; `0` cleanly drops the channel. */
export interface PlasterSurfaceParams {
  /** Roller-nap roughness-drift intensity. Default tasteful, `0` = flat matte. */
  nap: number
}

/** Sensible default: a faint roller-nap drift. Deliberately gentle — the goal is
 *  "reads as real painted plaster", never a visible stucco/texture-coat crust. */
export const DEFAULT_PLASTER_SURFACE_PARAMS: PlasterSurfaceParams = { nap: 1 }

/** Peak signed roughness drift (0..1 roughness units) at full intensity. A
 *  whisper: ±~0.035 so the matte wall is non-uniform but stays clearly matte
 *  (a base of ~0.92 drifts within ~0.885..0.955 — never near gloss). */
export const NAP_DRIFT_AMPLITUDE = 0.035
/** Broad-patch fbm frequency (integer, see `noise.ts`): the slow coverage drift a
 *  roller leaves as the nap loads/unloads — large soft patches, not a speckle. */
const NAP_BROAD_FREQ = 4
/** Fine-stipple fbm frequency (integer): the pebbly nap-fibre micro-texture.
 *  Fine so it reads as a sheen stipple, not a resolvable bumpy texture. */
const NAP_FINE_FREQ = 64
/** Share of the drift carried by the broad patches vs the fine stipple. The broad
 *  coverage drift dominates (a roller's heaviest tell); the fine stipple seasons. */
const NAP_BROAD_WEIGHT = 0.6

/**
 * Build the roller-nap roughness-drift sampler.
 *
 * Returns a function giving a signed roughness *delta* (centred on 0, scaled by
 * `nap`) to ADD to the surface's base matte roughness — a broad coverage drift
 * plus a fine nap stipple so the matte wall is non-uniform without ever leaving
 * the matte range. The mean is preserved, so the overall matte baseline is
 * unchanged (no gloss creep, no regression to a glossy wall).
 *
 * Sampling in 0..1 UV (`u = x / S`, `v = y / S`) keeps it seamless (the fbm
 * lattice wraps on its period). `nap: 0` returns a constant-zero sampler.
 */
export function makeRollerNap(seed: number, nap: number): (u: number, v: number) => number {
  if (nap <= 0) return () => 0
  // Distinct seed offsets (+97 / +109) so the nap doesn't correlate with the
  // painter's existing peel / broad fields (+17 / +23).
  const broad = makeFbm(seed + 97, 3, NAP_BROAD_FREQ)
  const fine = makeFbm(seed + 109, 3, NAP_FINE_FREQ)
  const amp = NAP_DRIFT_AMPLITUDE * nap
  return (u: number, v: number) => {
    const b = (broad(u, v) - 0.5) * 2 // signed -1..1
    const f = (fine(u, v) - 0.5) * 2 // signed -1..1
    return (b * NAP_BROAD_WEIGHT + f * (1 - NAP_BROAD_WEIGHT)) * amp
  }
}
