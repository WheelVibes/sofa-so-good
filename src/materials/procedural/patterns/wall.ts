/** Wall-finish procedural patterns (plaster, batten, fluted panelling). */
import { blank, type Fields, setPx, shade } from '../fieldKit'
import { clamp01, makeFbm } from '../noise'

export function plasterFields(base: [number, number, number], seed: number, S: number): Fields {
  const f = blank(S)
  // Very gentle orange-peel: low bump, near-uniform colour so walls read as
  // clean matte paint rather than noisy stucco.
  f.normalStrength = 1.1
  const peel = makeFbm(seed + 17, 3, 48)
  const broad = makeFbm(seed + 23, 3, 5)
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const u = x / S
      const v = y / S
      const pk = peel(u, v)
      const br = broad(u, v)
      const factor = 0.985 + (br - 0.5) * 0.022 + (pk - 0.5) * 0.012
      const [r, g, b] = shade(base, clamp01(factor))
      setPx(f, y * S + x, r, g, b, pk * 0.5, 0.92)
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
