/**
 * MAT-001 — procedural stone/marble micro-detail.
 *
 * Polished stone reads flat without two cues real slabs always carry:
 *
 *  - **vein normal-relief** — a vein or fissure in a polished slab is not
 *    optically coplanar with the face; it sits very slightly proud (mineral
 *    crystallisation) or recessed (a filled fissure), so grazing light catches
 *    the veining. This is a micro-NORMAL touch that must FOLLOW the visible
 *    albedo veins, and
 *  - **polished roughness drift** — a honed/polished slab is never a
 *    dead-uniform mirror: broad, low-frequency patches read slightly glossier
 *    or slightly more matte (uneven polish / wipe sheen). That gentle drift is
 *    what stops marble looking like a single flat specular plane.
 *
 * This module is the pure, deterministic, worker-safe helper (mirrors
 * `tileSurface.ts` / `upholsterySeams.ts`): tiny tunable params, integer fbm
 * freq, every channel behind a `0..1` intensity with a conservative default. It
 * does NOT own the vein layout — the painter (`patterns/stone.ts`) /
 * singleton (`furnitureMaterials.ts:getMarbleMaps`) computes the vein mask from
 * its OWN turbulence field, then asks this helper for the height add (so the
 * normal relief ALIGNS with the visible albedo veins for free, regardless of
 * marble colour or vein pattern) and the polished roughness drift.
 *
 * No geometry — material maps only, so there is nothing to z-fight.
 *
 * Tasteful by default (the fabric lesson): the vein relief is shallow and the
 * roughness drift is a whisper; `veinRelief: 0` cleanly drops the relief,
 * `roughDrift: 0` collapses the polish back to a single value.
 */
import { makeFbm } from './noise'

/** Tuning for the stone/marble micro-detail. Intensities are 0..1 multipliers
 *  over a baked-in tasteful amplitude; `0` cleanly drops that channel. */
export interface StoneSurfaceParams {
  /** Vein normal-relief intensity. Default tasteful, `0` = veins albedo-only (flat). */
  veinRelief: number
  /** Polished roughness-drift intensity. `0` = uniform polish (no drift). */
  roughDrift: number
}

/** Sensible default: a faint vein relief + a subtle polished drift. Deliberately
 *  gentle — the goal is "reads as polished stone", never a visible ridged crust. */
export const DEFAULT_STONE_SURFACE_PARAMS: StoneSurfaceParams = { veinRelief: 1, roughDrift: 1 }

/** Tuning for the concrete pinhole-pore micro-detail (CONCRETE-PORES).
 *  `pores` is a 0..1 intensity over a baked-in tasteful amplitude; `0` cleanly
 *  drops the pinhole roughness term (back to the macro-only concrete). */
export interface ConcreteSurfaceParams {
  /** Fine pinhole-pore roughness intensity. `0` = no pinhole micro-variation. */
  pores: number
}

/** Sensible default: a subtle scattered pinhole field. Deliberately faint — the
 *  goal is "reads as floated concrete", never a visible spotted/blistered face. */
export const DEFAULT_CONCRETE_SURFACE_PARAMS: ConcreteSurfaceParams = { pores: 1 }

/** Peak height a fully-masked vein contributes (0..1 height units). Small on
 *  purpose — a polished vein lifts by microns, not millimetres. */
const VEIN_RELIEF_AMPLITUDE = 0.4
/** Peak signed roughness drift (0..1 roughness units) at full intensity. A
 *  whisper: ±~0.05 so the polish is non-uniform but never patchy/matte. */
const ROUGH_DRIFT_AMPLITUDE = 0.05
/** Lattice frequency of the polished-drift fbm (integer, see `noise.ts`). Broad
 *  so it reads as large polished/honed patches, not a fine speckle. */
const ROUGH_DRIFT_FREQ = 3

/* ── CONCRETE-PORES — fine pinhole-pore roughness micro-variation ──────────── */

/** Peak roughness lift a fully-open pinhole pore contributes (0..1 roughness
 *  units). Small on purpose — a pinhole is a speck that scatters light, not a
 *  crater; the sealed face still dominates the read. */
const PORE_ROUGH_AMPLITUDE = 0.16
/** High lattice frequency (integer, see `noise.ts`) so the pores read as a
 *  fine, dense pinhole stipple — NOT macro blotches (the painter's own
 *  mottle/pore fields already own the larger scale). */
const PORE_ROUGH_FREQ = 110
/** Threshold on the fine noise above which a texel counts as an *open* pinhole.
 *  High so only the sparse peaks open — a scattered pinhole field, never an
 *  evenly-spotted polka-dot pattern. */
const PORE_ROUGH_THRESHOLD = 0.8

/**
 * Vein height contribution from a vein mask (0 = no vein, 1 = vein centre).
 *
 * Returns the height *to use for the vein* (>= 0, scaled by `veinRelief`) so the
 * caller writes `height = veinHeight(mask, veinRelief)` (the face baseline stays
 * 0). Because the caller passes its OWN vein mask, the resulting normal relief
 * lands exactly on the visible albedo veining — no separate field, no drift.
 *
 * `veinRelief: 0` returns 0 everywhere (veins become albedo-only, a flat face).
 */
export function veinHeight(veinMask: number, veinRelief: number): number {
  if (veinRelief <= 0) return 0
  return veinMask * VEIN_RELIEF_AMPLITUDE * veinRelief
}

/**
 * Build the polished roughness-drift sampler.
 *
 * Returns a function giving a signed roughness *delta* (centred on 0, scaled by
 * `roughDrift`) to ADD to the surface's base roughness — broad low-frequency
 * patches drift glossier (negative) / slightly more matte (positive) so the
 * polish is non-uniform. The mean is preserved, so the overall sheen baseline
 * is unchanged.
 *
 * Sampling in 0..1 UV (`u = x / S`, `v = y / S`) keeps it seamless (the fbm
 * lattice wraps on its period). `roughDrift: 0` returns a constant-zero sampler.
 */
export function makeRoughDrift(seed: number, roughDrift: number): (u: number, v: number) => number {
  if (roughDrift <= 0) return () => 0
  // Distinct seed offset (89) so the drift doesn't correlate with the painter's
  // turbulence / fine / micro-rough fields (which use +13 / +71 / +53).
  const drift = makeFbm(seed + 89, 2, ROUGH_DRIFT_FREQ)
  const amp = ROUGH_DRIFT_AMPLITUDE * roughDrift
  return (u: number, v: number) => (drift(u, v) - 0.5) * 2 * amp
}

/**
 * Build the fine pinhole-pore roughness sampler (CONCRETE-PORES).
 *
 * Real poured/floated concrete is a mostly-sealed face peppered with tiny air
 * pinholes — micro-pits that trap dust and scatter light, so they read
 * measurably rougher than the surrounding sealed face. This returns a function
 * giving a **non-negative roughness lift** (>= 0, scaled by `pores`) to ADD on
 * top of the surface's base roughness. It is layered onto the painter's
 * existing macro mottle/pore break-up — it does NOT replace it (it touches
 * roughness only; the macro pores already own the albedo darkening / height
 * recess).
 *
 * Only the sparse peaks of a high-frequency noise field cross the threshold and
 * open into pores, so the result is a scattered pinhole field rather than an
 * even polka-dot grid. Sampling in 0..1 UV (`u = x / S`, `v = y / S`) keeps it
 * seamless (the fbm lattice wraps on its period). `pores: 0` returns a
 * constant-zero sampler (no pinhole micro-variation).
 */
export function makePinholePores(seed: number, pores: number): (u: number, v: number) => number {
  if (pores <= 0) return () => 0
  // Distinct seed offset (137) so the fine pinhole field doesn't correlate with
  // the painter's mottle / pore / stain fields (+5 / +41 / +19) or the drift
  // (+89) — a collision would make the pinholes track those and read fake.
  const fine = makeFbm(seed + 137, 3, PORE_ROUGH_FREQ)
  const amp = PORE_ROUGH_AMPLITUDE * pores
  const span = 1 - PORE_ROUGH_THRESHOLD
  return (u: number, v: number) => {
    const n = fine(u, v)
    if (n <= PORE_ROUGH_THRESHOLD) return 0
    // Ramp 0..1 across the open band so a pore fades in at its rim — no hard
    // speckle edge.
    return ((n - PORE_ROUGH_THRESHOLD) / span) * amp
  }
}
