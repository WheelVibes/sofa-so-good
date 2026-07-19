/** Wall-finish procedural patterns (plaster, batten, fluted panelling). */
import { blank, type Fields, setPx, shade } from '../fieldKit'
import { clamp01, makeFbm } from '../noise'
import { DEFAULT_PLASTER_SURFACE_PARAMS, makeRollerNap } from '../plasterSurface'

/** Base matte roughness of painted plaster (kept in sync with the singleton flat
 *  value in `cache.ts` so Path A and Path B read the same matte baseline). */
const PLASTER_BASE_ROUGHNESS = 0.92

export function plasterFields(base: [number, number, number], seed: number, S: number): Fields {
  const f = blank(S)
  // Very gentle orange-peel: low bump, near-uniform colour so walls read as
  // clean matte paint rather than noisy stucco.
  f.normalStrength = 1.1
  const peel = makeFbm(seed + 17, 3, 48)
  const broad = makeFbm(seed + 23, 3, 5)
  // MAT-003 — roller-nap roughness drift: a whisper of broad coverage + fine nap
  // stipple so the matte wall isn't a single flat specular value. Centred on 0
  // (mean-preserving) and small, so the wall stays clearly MATTE — never gloss.
  const nap = makeRollerNap(seed, DEFAULT_PLASTER_SURFACE_PARAMS.nap)
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const u = x / S
      const v = y / S
      const pk = peel(u, v)
      const br = broad(u, v)
      const factor = 0.985 + (br - 0.5) * 0.022 + (pk - 0.5) * 0.012
      const [r, g, b] = shade(base, clamp01(factor))
      setPx(f, y * S + x, r, g, b, pk * 0.5, clamp01(PLASTER_BASE_ROUGHNESS + nap(u, v)))
    }
  }
  return f
}

/**
 * Limewash / mineral-wash wall (the "quiet luxury" matte-paint trend). Unlike
 * `plaster` (a near-uniform clean matte) and `concrete`/microcement (an
 * industrial mottle), limewash's signature is a soft, cloudy TONAL wash — broad
 * low-frequency colour drift laid down in overlapping brush strokes — so it
 * reads as a hand-applied mineral patina. Deliberately a stronger tonal
 * variation than `plaster` (±~0.1 vs ±~0.02) with a faint diagonal brush-drag,
 * kept flat + matte (near-zero relief, high roughness) so it never reads as
 * stucco or dirt.
 */
export function limewashFields(base: [number, number, number], seed: number, S: number): Fields {
  const f = blank(S)
  // Near-flat: only a whisper of brush relief so grazing light hints at strokes.
  f.normalStrength = 0.8
  const cloud = makeFbm(seed + 31, 4, 3) // broad tonal clouds
  const mid = makeFbm(seed + 47, 3, 6) // mid-scale drift
  const brush = makeFbm(seed + 59, 2, 40) // fine brush texture
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const u = x / S
      const v = y / S
      // Cloudy tonal wash — the limewash signature.
      const c = (cloud(u, v) - 0.5) * 0.14 + (mid(u, v) - 0.5) * 0.06
      // Brush drag: sample noise stretched along v so the strokes streak vertically.
      const drag = (brush(u * 3, v * 0.4) - 0.5) * 0.03
      const factor = 0.95 + c + drag
      const [r, g, b] = shade(base, clamp01(factor))
      setPx(f, y * S + x, r, g, b, 0.5 + c * 0.6 + drag, clamp01(0.9 + drag * 0.5))
    }
  }
  return f
}

export function battenFields(base: [number, number, number], seed: number, S: number): Fields {
  const f = blank(S)
  f.normalStrength = 7
  const battens = 6 // battens across the tile (divides S → seamless)
  const period = S / battens
  const bw = period * 0.16 // batten width
  const bevel = period * 0.03 // bevel ramp at each batten edge
  const grain = makeFbm(seed + 4, 3, 20)
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const xIn = x % period
      // Height: raised on the batten, ramped through the bevel, flat on panel.
      let h: number
      if (xIn < bevel) h = 0.3 + (xIn / bevel) * 0.5
      else if (xIn < bw - bevel) h = 0.8
      else if (xIn < bw) h = 0.8 - ((xIn - (bw - bevel)) / bevel) * 0.5
      else h = 0.3
      const onBatten = xIn < bw
      const g = grain(x / S, y / S)
      // Battens catch a touch more light; subtle painted-surface noise.
      const factor = (onBatten ? 1.02 : 0.95) * (0.98 + (g - 0.5) * 0.03)
      setPx(
        f,
        y * S + x,
        base[0] * factor,
        base[1] * factor,
        base[2] * factor,
        h,
        0.55, // matte paint
      )
    }
  }
  return f
}

/**
 * Fluted / reeded panel — close-packed rounded vertical ribs (no flat gaps,
 * unlike `batten`'s spaced slats), the on-trend feature-wall finish. A half-sine
 * height profile per rib gives the rounded relief (the normal map does the work);
 * the albedo carries faint lengthwise wood grain + a touch of groove shading.
 * Seamless — the rib count divides the tile.
 */
export function flutedFields(base: [number, number, number], seed: number, S: number): Fields {
  const f = blank(S)
  f.normalStrength = 20
  const ribs = 16 // divides S → seamless
  const period = S / ribs
  const grain = makeFbm(seed + 6, 3, 80)
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const frac = (x % period) / period // 0..1 across one rib
      // Half-sine bump: groove (0) at rib edges, peak (1) at rib centre.
      const h = Math.sin(Math.PI * frac)
      const g = grain(x / S, y / S) - 0.5
      // Rib faces catch light (lighter toward the peak); grooves sit darker.
      const factor = 0.88 + h * 0.14 + g * 0.04
      const [r, gg, b] = shade(base, clamp01(factor))
      setPx(f, y * S + x, r, gg, b, 0.15 + h * 0.85, 0.6 + g * 0.1)
    }
  }
  return f
}

/**
 * Herringbone parquet: rectangular wood planks (length L = n·W) laid in the
 * classic interlocking 45° zigzag — horizontal planks (L wide × W tall) and
 * vertical planks (W wide × L tall) alternate in diagonal bands. The plank a
 * texel belongs to is found from the orientation field `g = (⌊x⌋+⌊y⌋) mod 2n`
 * (in plank-width units; `g < n` → horizontal), then the run within that band.
 * Plank IDs use the run's canonical start position (mod the tile period) so the
 * per-plank tint + grain tile **seamlessly**, including planks that straddle the
 * tile edge. Shading reuses the wood look (latewood bands across the width,
 * per-plank warmth/value, recessed grooves at plank joints).
 */
