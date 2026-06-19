/**
 * MAT-002 — procedural ceramic/tile glaze micro-detail.
 *
 * Glazed tile reads flat without two cues that real ceramic always carries:
 *
 *  - **glaze orange-peel** — a glossy fired glaze is never optically flat; it has
 *    a *very* fine, low-amplitude undulation ("orange peel") that catches grazing
 *    light. This is a micro-NORMAL touch baked onto the **tile face only** (never
 *    the grout), and
 *  - **glaze ↔ grout roughness contrast** — the glaze is glossy (low roughness),
 *    the grout is a matte cement (high roughness). That *contrast* is what sells
 *    the surface as ceramic: shiny faces framed by dead-matte joints.
 *
 * This module is the pure, deterministic, worker-safe helper (mirrors
 * `upholsterySeams.ts`): tiny tunable params, integer fbm freq, every channel
 * behind a `0..1` intensity with a conservative default. It does NOT own the tile
 * grid — the painter (`patterns/tile.ts`) decides per-texel whether a pixel is
 * face or grout from its existing layout, then asks this helper for the glaze-peel
 * height add (face) and the contrasted roughness. So the micro-normal + roughness
 * ALIGN with the visible grout for free, regardless of tile shape (square / hex /
 * subway) or grout colour/width.
 *
 * No geometry — material maps only, so there is nothing to z-fight.
 *
 * Tasteful by default (the fabric lesson): the peel pitch is fine and its
 * amplitude small; `glaze: 0` cleanly drops the orange-peel, `grout: 0` collapses
 * the roughness contrast back to a single value.
 */
import { clamp01, makeFbm } from './noise'

/** Tuning for the ceramic glaze micro-detail. Intensities are 0..1 multipliers
 *  over a baked-in tasteful amplitude; `0` cleanly drops that channel. */
export interface TileSurfaceParams {
  /** Orange-peel glaze micro-normal intensity. Default tasteful, `0` = flat glaze. */
  glaze: number
  /** Glaze↔grout roughness-contrast intensity. `0` = no contrast (uniform). */
  grout: number
}

/** Sensible default: a faint orange-peel glaze + the full glaze↔grout roughness
 *  contrast. Deliberately gentle — the goal is "reads as fired ceramic", never a
 *  visible bumpy crust. */
export const DEFAULT_TILE_SURFACE_PARAMS: TileSurfaceParams = { glaze: 1, grout: 1 }

/** Glossy fired-glaze roughness (low → sharp specular sheen). */
export const GLAZE_ROUGHNESS = 0.16
/** Matte cement-grout roughness (high → diffuse, no sheen). */
export const GROUT_ROUGHNESS = 0.92

/** Peak amplitude of the orange-peel height undulation (0..1 height units).
 *  Tiny on purpose — a glaze ripples by microns, not millimetres. */
const PEEL_AMPLITUDE = 0.06
/** Lattice frequency of the orange-peel fbm (integer, see `noise.ts`). Fine so it
 *  reads as a sheen micro-ripple, not a resolvable bumpy texture, at the cap. */
const PEEL_FREQ = 90

/**
 * Build the orange-peel sampler for a tile face. Returns a function giving a
 * signed height *delta* (centred on 0, scaled by `glaze`) to ADD to the painter's
 * face height — so the glaze gains a faint undulation while the mean face height
 * (and thus the flat-tile baseline) is preserved.
 *
 * Sampling in 0..1 UV (`u = x / S`, `v = y / S`) keeps it seamless with the tile
 * (the fbm lattice wraps on its period).
 */
export function makeGlazePeel(seed: number, glaze: number): (u: number, v: number) => number {
  if (glaze <= 0) return () => 0
  // Distinct seed offset (131) so the peel doesn't correlate with the painter's
  // speck / grout-dirt / micro-rough fields (which use +3 / +17 / +53).
  const peel = makeFbm(seed + 131, 3, PEEL_FREQ)
  const amp = PEEL_AMPLITUDE * glaze
  return (u: number, v: number) => (peel(u, v) - 0.5) * 2 * amp
}

/**
 * Roughness for a glazed-tile texel, with explicit glaze↔grout contrast.
 *
 *  - `isGrout` faces resolve toward {@link GROUT_ROUGHNESS} (matte),
 *  - tile faces toward {@link GLAZE_ROUGHNESS} (glossy),
 *
 * blended by `grout` (0 → no contrast, both collapse to the glaze value; 1 →
 * full matte-grout / glossy-glaze separation). `micro` is the painter's existing
 * per-texel roughness break-up (signed, ~±0.1) folded in so the sheen isn't a
 * dead-uniform mirror. Result clamped to 0..1.
 */
export function glazeRoughness(isGrout: boolean, grout: number, micro: number): number {
  const g = clamp01(grout)
  const target = isGrout ? GROUT_ROUGHNESS : GLAZE_ROUGHNESS
  // grout=0 → everything sits at the glaze roughness (no contrast); grout=1 →
  // each texel reaches its own target.
  const base = GLAZE_ROUGHNESS + (target - GLAZE_ROUGHNESS) * g
  return clamp01(base + micro)
}
