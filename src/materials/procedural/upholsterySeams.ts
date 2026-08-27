/**
 * RZ6 — procedural upholstery seam stitching + soft fabric wrinkle.
 *
 * Builds the *height field* for the enhanced fabric normal map: the woven
 * micro-texture (warp/weft interlace + slubs) the legacy generator already
 * carried, PLUS two new touches that make upholstery read as real sewn cloth
 * rather than a flat plastic shell:
 *
 *  - **soft wrinkle** — broad, low-frequency creases (a few millimetres of
 *    relief) so a seat/back panel gathers and folds like tensioned fabric
 *    instead of a dead-flat sheet, and
 *  - **seam stitching** — a faint recessed channel along the panel edges (where
 *    two upholstery panels are sewn together) flanked by a row of raised
 *    stitch bumps, so a tiled cushion reads as panelled + topstitched.
 *
 * Pure + deterministic given a seed and `SeamParams`: returns a row-major
 * `Float32Array` height field (values ~0..1) so it can be unit-tested for
 * dimensions / determinism without a WebGL or 2D-canvas context, then handed to
 * `heightToNormalRGBA` by the material factory. No geometry is added — this is a
 * material normal map only, so there is nothing to z-fight.
 *
 * Tasteful by default: `seam`/`wrinkle` intensities are gentle so the cloth
 * reads soft, not quilted. Pass `seam: 0` and/or `wrinkle: 0` to disable either
 * channel (e.g. for a flat-pack panel) without touching the weave.
 */
import { clamp01, makeFbm } from './noise'

/** Tuning for the upholstery height field. All intensities are 0..1 multipliers
 *  over a sensible baked-in amplitude; `0` cleanly drops that channel. */
export interface SeamParams {
  /** Seam-channel + topstitch intensity. Default tasteful, `0` = no seams. */
  seam: number
  /** Soft fabric-wrinkle intensity. Default tasteful, `0` = no wrinkle. */
  wrinkle: number
  /** Number of sewn panels across the tile (≥1). Seams fall on panel edges. */
  panels: number
}

/** Sensible default: a faint perimeter seam (one panel → the seam sits on the
 *  tile edge, so a cushion reads as a single sewn panel with a piped border)
 *  plus a soft wrinkle. Kept gentle so cloth reads soft, never quilted. */
export const DEFAULT_SEAM_PARAMS: SeamParams = { seam: 1, wrinkle: 1, panels: 1 }

/** Distance to the nearest panel-seam line along one axis, expressed in 0..1 of
 *  a panel cell (0 = on the seam, 0.5 = mid-panel). `panels` cells across [0,1). */
function seamDistance(t: number, panels: number): number {
  const cell = t * panels
  const frac = cell - Math.floor(cell)
  return Math.min(frac, 1 - frac)
}

/**
 * Build the upholstery height field (row-major, length `size*size`, values ~0..1).
 *
 * Channels combined:
 *  - woven warp/weft interlace with low-freq phase warp + occasional slubs
 *    (the cloth micro-texture), then
 *  - a soft wrinkle (broad fbm creases), then
 *  - per-axis seam channels: a smooth recess on the panel edges plus a faint
 *    row of topstitch bumps just inside the recess.
 *
 * Seams run along BOTH axes so a tiled cushion shows a panel grid; with
 * `panels = 1` the seam sits only at the tile boundary (so adjacent tiles share
 * one seam) — i.e. effectively a single sewn panel.
 */
/**
 * The fbm fields the upholstery height is built from, as data so their spatial
 * frequencies can be bounded by a test (FABRIC-FINE-NYQUIST).
 *
 * All four are sampled at `(u, v)` (or a small multiple), so
 * `topOctaveCyclesPerTexel(baseFreq, octaves, uvScale, size)` gives what each
 * one costs in cycles per texel — and a tile of `size` texels can only carry
 * `NYQUIST_CYCLES_PER_TEXEL` (0.5) before a field stops being detail and becomes
 * deterministic white noise.
 *
 * `fine` was `{ octaves: 4, baseFreq: 120 }` = **3.75 cycles/texel** at 256², so
 * a fifth of the height amplitude (`fine(u, v) * 0.2`) was aliased noise, which
 * `heightToNormalRGBA` then turned into a per-texel random normal — the same
 * defect and the same visual signature (pebbly, plastic-looking) as
 * WOOD-PORE-NYQUIST. It cannot simply be "finer than the weave" either: the weave
 * itself already sits at `sin(x * 2.4)` ≈ 0.38 cycles/texel, close to the limit,
 * so there is no room below it in a 256² tile. The fuzz is now comparable to the
 * weave rather than pretending to be ten times finer.
 */
export const FABRIC_FIELDS = {
  /** Thread phase warp — makes rows/cols meander like real thread. */
  warp: { octaves: 3, baseFreq: 6, uvScale: 1 },
  /** Occasional slub thickenings in the yarn. */
  slub: { octaves: 3, baseFreq: 22, uvScale: 1.2 },
  /** Sub-weave fuzz. Bounded by the weave's own frequency, not by wishful thinking. */
  fine: { octaves: 4, baseFreq: 11, uvScale: 1 },
  /** Broad gathered creases. Deliberately very low frequency. */
  fold: { octaves: 3, baseFreq: 3, uvScale: 1 },
} as const

/** Cycles per texel of the WEAVE grid itself (`sin(x * 2.4)`), for the tests to
 *  bound the fuzz against. `2.4 rad/texel / (2*PI)` cycles per texel. */
export const FABRIC_WEAVE_CYCLES_PER_TEXEL = 2.4 / (2 * Math.PI)

export function buildUpholsteryHeight(
  size: number,
  seed: number,
  params: SeamParams,
): Float32Array {
  const { seam, wrinkle, panels } = params
  const p = Math.max(1, Math.round(panels))
  // Weave: low-freq phase warp + slub thickening, matching the legacy look.
  const warp = makeFbm(seed ^ 0x6d2f, FABRIC_FIELDS.warp.octaves, FABRIC_FIELDS.warp.baseFreq)
  const slub = makeFbm(seed ^ 0x1f88, FABRIC_FIELDS.slub.octaves, FABRIC_FIELDS.slub.baseFreq)
  const fine = makeFbm(seed ^ 0x4242, FABRIC_FIELDS.fine.octaves, FABRIC_FIELDS.fine.baseFreq)
  // Wrinkle: broad soft creases. Low frequency so they read as gathered cloth
  // folds, not noise.
  const fold = makeFbm(seed ^ 0x3c7e, FABRIC_FIELDS.fold.octaves, FABRIC_FIELDS.fold.baseFreq)
  const out = new Float32Array(size * size)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size
      const v = y / size
      // --- woven micro-texture -------------------------------------------
      // Fine thread pitch: at ~2.4 cycles/px-step the weave reads as soft cloth
      // grain rather than a coarse resolvable waffle when one tile maps across a
      // ~0.5 m cushion face. Phase-warped so rows/cols meander like real thread.
      const jx = (warp(u, v) - 0.5) * 1.6
      const jy = (warp(v + 3.1, u + 1.7) - 0.5) * 1.6
      const warpThread = 0.5 + 0.5 * Math.sin(x * 2.4 + jx)
      const weftThread = 0.5 + 0.5 * Math.sin(y * 2.4 + jy)
      const weave = warpThread * weftThread
      const sl = slub(u * 1.2, v * 1.2)
      const slubBump = sl > 0.78 ? (sl - 0.78) * 1.1 : 0
      // Lean a touch more on the fine fuzz than the regular grid so a light
      // upholstery doesn't read as a loud waffle under raking light. (FABRIC-FINE-
      // NYQUIST: this term used to be `makeFbm(seed, 4, 120)`, whose top octave
      // ran at 3.75 cycles per texel — ten times the weave's own 0.38 and seven
      // times the Nyquist limit — so a fifth of the height field was aliased
      // white noise rather than fuzz. See FABRIC_FIELDS.)
      let h = weave * 0.4 + slubBump * 0.22 + fine(u, v) * 0.2
      // --- soft wrinkle ---------------------------------------------------
      if (wrinkle > 0) {
        // Centred fbm so creases push and pull around the mean (signed relief).
        // Gentle — a soft gather, not a crumpled sheet.
        const crease = (fold(u, v) - 0.5) * 2
        h += crease * 0.1 * wrinkle
      }
      // --- seam channel + topstitch --------------------------------------
      if (seam > 0) {
        const du = seamDistance(u, p)
        const dv = seamDistance(v, p)
        const d = Math.min(du, dv) // distance to nearest seam (panel cell units)
        // Narrow recessed valley right on the seam (within ~2% of a panel).
        const valley = d < 0.02 ? (1 - d / 0.02) ** 2 : 0
        // Topstitch: a faint raised bump on a narrow band flanking the valley.
        const stitchBand = d > 0.02 && d < 0.035
        // Dashes along the seam so it reads as discrete stitches, not piping.
        const along = du < dv ? v : u
        const dash = 0.5 + 0.5 * Math.sin(along * size * 0.55)
        const stitch = stitchBand ? dash * 0.4 : 0
        // Subtle: the seam should whisper, not carve. Keep the valley shallow.
        h += (-valley * 0.32 + stitch * 0.2) * seam
      }
      out[y * size + x] = clamp01(h)
    }
  }
  return out
}
