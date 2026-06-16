/** Soft-furnishing procedural patterns (carpet, stripe, grasscloth). */
import { blank, type Fields, setPx, shade } from '../fieldKit'
import { clamp01, makeFbm } from '../noise'

export function carpetFields(base: [number, number, number], seed: number, S: number): Fields {
  const f = blank(S)
  f.normalStrength = 6
  const fibre = makeFbm(seed + 11, 4, 110)
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
  const warp = makeFbm(seed + 7, 3, 70)
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
