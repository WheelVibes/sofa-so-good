/**
 * MAT-004 — procedural brushed / satin metal micro-detail.
 *
 * Stainless appliances read as flat grey plastic without the one cue real
 * brushed steel always carries:
 *
 *  - **directional brush streaks** — a brushed/satin finish is abraded along
 *    ONE axis, so it carries fine lengthwise hairlines: a micro-NORMAL relief
 *    plus a faint roughness streak that together make the swept anisotropic
 *    highlight read under reflection. The streaks run along U (the brush
 *    direction); scanning ACROSS U (along a row) crosses many hairlines (high
 *    variance), scanning ALONG U (down a column) stays on a hairline (low
 *    variance). That row-variance ≫ column-variance asymmetry IS the brush.
 *
 * This module is the pure, deterministic, worker-safe helper (mirrors
 * `upholsterySeams.ts` / `stoneSurface.ts`): tiny tunable params, integer noise
 * periods, every channel behind a `0..1` intensity with a conservative default.
 * It returns row-major `Float32Array`s (a height field for the baked normal + a
 * signed roughness streak delta) so it can be unit-tested for dimensions /
 * determinism / directionality without a WebGL or 2D-canvas context, then handed
 * to `heightToNormalRGBA` by the material factory.
 *
 * No geometry — material maps only, so there is nothing to z-fight.
 *
 * Tasteful by default (the fabric lesson): brushed steel is mostly smooth, so
 * the streak amplitude is small — the goal is "reads as brushed stainless", not
 * a scratched, grooved or chrome-mirror crust. `streak: 0` cleanly drops the
 * directional relief (a plain satin metal).
 *
 * Directionality, not isotropic fbm: a plain fbm doubles frequency in BOTH axes
 * each octave, which leaks variance into the cross-brush (V) direction and
 * washes out the asymmetry. Instead the hairlines come from a single value-noise
 * lattice sampled WIDE across U (many cells → fine hairlines) and NARROW along V
 * (a fraction of a cell → near-constant down the brush), with a slow drift warp
 * so the hairlines waver gently rather than reading as ruled lines.
 */
import { clamp01, makeValueNoise } from './noise'

/** Tuning for the brushed-metal micro-detail. Intensities are 0..1 multipliers
 *  over a baked-in tasteful amplitude; `0` cleanly drops that channel. */
export interface BrushParams {
  /** Brush-streak normal + roughness intensity. `0` = plain (smooth) metal. */
  streak: number
  /** Three.js anisotropy strength for the swept highlight (0..1). Material-level,
   *  not baked into the field; surfaced here so the resolver keeps one knob. */
  anisotropy: number
}

/** Sensible default: a subtle directional brush + a moderate swept highlight.
 *  Deliberately gentle — brushed steel is smooth, so this is a whisper of grain,
 *  never a visibly scratched surface. */
export const DEFAULT_BRUSH_PARAMS: BrushParams = { streak: 0.5, anisotropy: 0.5 }

/** Peak height a brush hairline contributes (0..1 height units). Tiny on
 *  purpose — a brushed finish abrades by microns, so the normal only just
 *  catches grazing light. */
const STREAK_HEIGHT_AMPLITUDE = 0.5
/** Peak signed roughness streak delta (0..1 roughness units) at full intensity.
 *  A whisper: the steel scatters a touch more along the abraded grain. */
const STREAK_ROUGH_AMPLITUDE = 0.06
/** Hairlines across the tile (lattice cells across U). Fine, so the brush reads
 *  as a satin sweep at the texture cap, not resolvable grooves. */
const HAIRLINE_CELLS = 128
/** Cells the brush spans along V across the whole tile. Well under 1 → the value
 *  is near-constant down a column, the low-cross-brush-variance the brush needs. */
const ALONG_SPAN = 0.3
/** How far (in hairline cells) the slow drift bends a hairline along its length,
 *  so the grain wavers organically instead of reading as ruled straight lines. */
const DRIFT_AMOUNT = 1.2

/**
 * Build the brushed-metal micro-detail fields (row-major, length `size*size`).
 *
 *  - `height` ~0..1: the brush hairline relief, fed to `heightToNormalRGBA`.
 *  - `rough` signed (centred on 0, scaled by `streak`): a roughness streak delta
 *    to ADD to the base roughness so the abraded grain scatters slightly more.
 *
 * The brush runs along **U** (`x`/columns): the hairline noise is sampled wide
 * across U (`u * HAIRLINE_CELLS`) and narrow along V (`v * ALONG_SPAN`), so the
 * value smears into lengthwise hairlines (row-variance ≫ column-variance). A slow
 * drift warp bends each hairline gently so the grain wavers. Sampling on the
 * lattice keeps it seamless (value noise wraps on its integer period).
 *
 * `streak: 0` returns a flat height (0.5 everywhere) and a zero roughness delta —
 * a plain satin metal with no directional grain.
 */
export function buildBrushedMetalFields(
  size: number,
  seed: number,
  params: BrushParams,
): { height: Float32Array; rough: Float32Array } {
  const height = new Float32Array(size * size)
  const rough = new Float32Array(size * size)
  const streak = clamp01(params.streak)
  if (streak <= 0) {
    height.fill(0.5)
    // rough stays all-zero (no delta).
    return { height, rough }
  }
  // Hairline lattices for the two channels (distinct seeds so the roughness
  // streak doesn't mirror the normal hairlines exactly) + a shared slow drift so
  // both channels waver together (the grain is one physical brushing).
  const grain = makeValueNoise(HAIRLINE_CELLS, seed)
  const roughGrain = makeValueNoise(HAIRLINE_CELLS, seed + 211)
  const drift = makeValueNoise(4, seed + 877)
  const hAmp = STREAK_HEIGHT_AMPLITUDE * streak
  const rAmp = STREAK_ROUGH_AMPLITUDE * streak
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size
      const v = y / size
      const along = v * ALONG_SPAN
      const warp = (drift(u * 2, along) - 0.5) * 2 * DRIFT_AMOUNT
      const ucell = u * HAIRLINE_CELLS + warp
      const i = y * size + x
      // Centre the relief on 0.5 so the baked normal's flat baseline is mid-grey.
      height[i] = clamp01(0.5 + (grain(ucell, along) - 0.5) * hAmp)
      rough[i] = (roughGrain(ucell, along) - 0.5) * 2 * rAmp
    }
  }
  return { height, rough }
}
