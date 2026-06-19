/** Stone / mineral procedural patterns (concrete, marble, terrazzo). */
import { blank, type Fields, setPx, shade } from '../fieldKit'
import { clamp01, makeFbm, mulberry32 } from '../noise'
import { DEFAULT_STONE_SURFACE_PARAMS, makeRoughDrift, veinHeight } from '../stoneSurface'

export function concreteFields(base: [number, number, number], seed: number, S: number): Fields {
  const f = blank(S)
  f.normalStrength = 7
  const mottle = makeFbm(seed + 5, 5, 5)
  const pores = makeFbm(seed + 41, 4, 90)
  // Low-frequency cloudy staining — the broad water-mark / cure-blotch tonal
  // variation real poured concrete always has, on a larger scale than the mottle
  // (RZ4). Darkens in big soft patches + makes those patches a touch less rough
  // (sealed/stained sheen). `baseFreq` MUST be an integer (it sizes the value-
  // noise grid) — 3 gives patches larger than the freq-5 mottle.
  const stain = makeFbm(seed + 19, 2, 3)
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const u = x / S
      const v = y / S
      const m = mottle(u, v)
      const p = pores(u, v)
      const st = stain(u, v)
      const pore = p > 0.86 ? (p - 0.86) / 0.14 : 0
      const factor = (0.86 + (m - 0.5) * 0.22 - pore * 0.25) * (0.9 + st * 0.1)
      const [r, g, b] = shade(base, clamp01(factor))
      setPx(
        f,
        y * S + x,
        r,
        g,
        b,
        clamp01(m * 0.6 + pore),
        0.78 + (m - 0.5) * 0.1 - (st - 0.5) * 0.06,
      )
    }
  }
  return f
}

export function marbleFields(base: [number, number, number], seed: number, S: number): Fields {
  const f = blank(S)
  f.normalStrength = 4
  const turb = makeFbm(seed + 13, 5, 4)
  const fine = makeFbm(seed + 71, 4, 30)
  // Polished marble still has faint smudge/wipe variation in its sheen — a fine
  // roughness break-up so it doesn't read as a dead-uniform mirror (RZ4).
  const microRough = makeFbm(seed + 53, 3, 70)
  // MAT-001 — broad low-frequency polished/honed drift so the slab isn't a
  // single flat specular plane (uneven polish patches). Distinct seed offset
  // (+89) so it doesn't correlate with the vein / fine / micro-rough fields.
  const { veinRelief, roughDrift } = DEFAULT_STONE_SURFACE_PARAMS
  const drift = makeRoughDrift(seed, roughDrift)
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const u = x / S
      const v = y / S
      // Veins: a warped sinusoid threshold.
      const t = turb(u, v)
      const vein = Math.abs(Math.sin((u + v) * 6.28 * 2 + t * 6.0))
      const veinMask = vein < 0.12 ? 1 - vein / 0.12 : 0
      const baseFac = 0.96 + (fine(u, v) - 0.5) * 0.08
      // Veins darken slightly with a cool tint.
      const factor = clamp01(baseFac - veinMask * 0.28)
      const [r, g, b] = shade(base, factor)
      // MAT-001 — micro + broad polished drift. The drift is centred on 0 so the
      // mean sheen is preserved; it just adds glossier/mattter patches.
      const rough = clamp01(0.22 + veinMask * 0.1 + (microRough(u, v) - 0.5) * 0.07 + drift(u, v))
      // MAT-001 — vein normal-relief routed through the shared helper so the
      // relief amplitude is tunable and ALIGNS with the visible albedo vein
      // (same `veinMask`). Replaces the previous inline `veinMask * 0.4` — no
      // double-relief.
      setPx(f, y * S + x, r, g, b, veinHeight(veinMask, veinRelief), rough)
    }
  }
  return f
}

export function terrazzoFields(base: [number, number, number], seed: number, S: number): Fields {
  const f = blank(S)
  f.normalStrength = 2
  const rand = mulberry32(seed)
  const grain = makeFbm(seed + 9, 3, 60)
  // Light cement matrix with faint noise.
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const g = grain(x / S, y / S)
      const factor = 0.96 + (g - 0.5) * 0.06
      const [r, gg, b] = shade(base, clamp01(factor))
      setPx(f, y * S + x, r, gg, b, 0.1, 0.42 + (g - 0.5) * 0.08)
    }
  }
  // Scattered polished chips (with edge wrap so the tile is seamless).
  const CHIP_COLS: [number, number, number][] = [
    [196, 188, 174],
    [120, 96, 78],
    [150, 120, 110],
    [90, 110, 96],
    [86, 92, 110],
    [170, 150, 120],
    [60, 60, 64],
    [210, 205, 196],
  ]
  const chips = Math.round((S * S) / 1400)
  for (let c = 0; c < chips; c++) {
    const cxp = rand() * S
    const cyp = rand() * S
    const radius = 3 + rand() * (S / 70)
    const col = CHIP_COLS[Math.floor(rand() * CHIP_COLS.length)]
    const squish = 0.7 + rand() * 0.6
    const rad = Math.ceil(radius) + 1
    for (let dy = -rad; dy <= rad; dy++) {
      for (let dx = -rad; dx <= rad; dx++) {
        const d = Math.hypot(dx, dy / squish)
        if (d > radius) continue
        const px = (((Math.round(cxp) + dx) % S) + S) % S
        const py = (((Math.round(cyp) + dy) % S) + S) % S
        const i = py * S + px
        const edge = d > radius - 1 ? 0.8 : 1 // slight dark rim
        f.albedo[i * 4] = col[0] * edge
        f.albedo[i * 4 + 1] = col[1] * edge
        f.albedo[i * 4 + 2] = col[2] * edge
        f.height[i] = 0.5
        f.rough[i] = 0.28
      }
    }
  }
  return f
}

/** Tone-on-tone vertical stripe wallpaper — alternating slightly lighter
 *  bands over a faint paper texture. Subtle, tasteful (an accent wall). */
