/** Soft-furnishing procedural patterns (carpet, stripe, grasscloth). */
import { blank, type Fields, setPx, shade } from '../fieldKit'
import { clamp01, makeFbm } from '../noise'

export function carpetFields(base: [number, number, number], seed: number, S: number): Fields {
  const f = blank(S)
  // NYQUIST-AUDIT follow-up: 6 was tuned against the OLD per-texel `fibre` field,
  // where a strong bake turned fine noise into fine tooth. Over the corrected
  // low-frequency field it carved broad polished swirls and the carpet read as
  // stone. A live `normalScale` sweep on a close-up (1 / 0.5 / 0.25 / 0.1, one
  // run, first arm repeated and identical) gave microcontrast
  // 4.010 / 2.739 / 1.838 / 1.353. NOTE the two knobs are NOT proportional: this
  // 4x cut in bake strength measured **1.349**, i.e. where `normalScale` 0.1 (a
  // 10x cut) landed, because `heightToNormalRGBA` renormalises and saturates.
  // Carpet should be soft and matte, so the flatter result is right; the swirls
  // are gone and microcontrast is down 4.010 -> 1.349 (-66%).
  f.normalStrength = 1.5
  // NYQUIST-AUDIT: was baseFreq 110, whose top octave ran at 880 cycles = 3.44 per
  // texel on a 256 tile — the single worst-aliased field in the codebase, and
  // unlike the thresholded speckle fields it is UNTHRESHOLDED and drives three
  // channels at full amplitude (albedo `0.82 + fib * 0.3`, the ENTIRE height, and
  // roughness). It rendered as harsh black-and-white static, closer to TV snow
  // than to carpet pile. Real pile is 2-5 mm and this tile carries ~5.9 mm per
  // texel at its [1.5, 1.5] m uvScale, so pile is simply not representable here;
  // what IS representable is the broad tonal drift real carpet shows from pile
  // direction and wear. Bounded to ~0.38 cycles/texel at 256: microcontrast on a
  // close-up fell 9.08 -> 4.01 (-56%), the highest reading measured anywhere.
  //
  // **This does NOT yet make carpet read as carpet** — it now reads as mottled
  // grey stone. The remaining cue is `normalStrength = 6` above, which was tuned
  // against the old per-texel field and, over a smooth low-frequency one, carves
  // broad polished-looking swirls. Lowering it is the next step and needs its own
  // before/after. An attempt to fix the look by halving the albedo swing instead
  // (`0.82 + fib * 0.3` -> `0.90 + fib * 0.14`) was REVERTED: it moved
  // microcontrast 4.010 -> 4.007 and sigma 22.52 -> 22.40, i.e. nothing, and the
  // crop was indistinguishable. The albedo was never the dominant cue here.
  const fibre = makeFbm(seed + 11, 4, 12)
  const blotch = makeFbm(seed + 31, 3, 8)
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const u = x / S
      const v = y / S
      const fib = fibre(u, v)
      const bl = blotch(u, v)
      const factor = 0.82 + fib * 0.3 + (bl - 0.5) * 0.1
      const [r, g, b] = shade(base, clamp01(factor))
      setPx(f, y * S + x, r, g, b, fib, 0.93 + fib * 0.05)
    }
  }
  return f
}

export function stripeFields(base: [number, number, number], seed: number, S: number): Fields {
  const f = blank(S)
  f.normalStrength = 0.7
  const stripes = 6
  const sw = S / stripes
  const paper = makeFbm(seed + 11, 3, 40)
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const band = Math.floor(x / sw) % 2
      const edge = Math.min(x % sw, sw - (x % sw)) < 2 ? 0.97 : 1 // faint seam
      const alt = band === 0 ? 1.0 : 1.07
      const n = paper(x / S, y / S)
      const factor = alt * edge * (0.99 + (n - 0.5) * 0.02)
      const [r, g, b] = shade(base, clamp01(factor))
      setPx(f, y * S + x, r, g, b, 0.2 + n * 0.1, 0.86)
    }
  }
  return f
}

/** Grasscloth wallpaper — fine horizontal woven striation with subtle warp,
 *  reading as a natural textured paper. */
export function grasscloth(base: [number, number, number], seed: number, S: number): Fields {
  const f = blank(S)
  f.normalStrength = 1.4
  // NYQUIST-AUDIT: was baseFreq 70 = 1.09 cycles/texel at 256. This field is a
  // PHASE WARP — `sin(v * S * 0.85 + warp * 3)` — so per-texel noise displaced the
  // weave line by up to 3 radians (nearly half a cycle) at every texel, scrambling
  // the horizontal weave into noise rather than meandering it. `line` also carries
  // HALF the height field, so the damage was structural, not cosmetic. A warp
  // wants to be low-frequency by definition: 8 gives a gentle meander at ~0.13
  // cycles/texel.
  const warp = makeFbm(seed + 7, 3, 8)
  const slub = makeFbm(seed + 13, 2, 14)
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const u = x / S
      const v = y / S
      const line = Math.sin(v * S * 0.85 + warp(u, v) * 3) * 0.5 + 0.5 // horizontal weave
      const sl = slub(u, v)
      const factor = 0.95 + line * 0.05 + (sl - 0.5) * 0.05
      const [r, g, b] = shade(base, clamp01(factor))
      setPx(f, y * S + x, r, g, b, line * 0.5, 0.82 + line * 0.06)
    }
  }
  return f
}

/** Checkerboard tile floor — `base` is the light square, a dark derivative the
 *  other, with grout seams. Polished (low roughness). */
