import { describe, expect, it } from 'vitest'
import { skyRadiance, type Vec3 } from './skyGradient'
import { DEFAULT_NADIR_DIM, HORIZON_EPS, paintSkySurround, surroundRadiance } from './skySurround'

const HIGH_SUN: Vec3 = [0.1, 0.97, 0.2]
const LOW_SUN: Vec3 = [0.9, 0.25, 0.35]
const params = (sunDir: Vec3) => ({ sunDir, turbidity: 3 })

const sat = (c: Vec3) => {
  const m = Math.max(...c)
  return m === 0 ? 0 : (m - Math.min(...c)) / m
}
const lum = (c: Vec3) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]

describe('surroundRadiance', () => {
  it('matches the plain sky above the horizon', () => {
    // The upper hemisphere must be untouched — this replaces only the ground.
    for (const v of [
      [0, 1, 0],
      [0.6, 0.7, 0.3],
      [0.9, 0.12, 0.4],
    ] as Vec3[]) {
      expect(surroundRadiance(v, params(HIGH_SUN))).toEqual(skyRadiance(v, params(HIGH_SUN)))
    }
  })

  it('gives a BLUE zenith, which the drei dome it replaces did not', () => {
    // The dome measured 0.017 saturation on screen and never above 0.03 at any
    // hour. This is the whole reason for the swap.
    expect(sat(surroundRadiance([0, 1, 0], params(HIGH_SUN)))).toBeGreaterThan(0.3)
  })

  it('never returns the brown ground tint below the horizon', () => {
    // `skyRadiance`'s default groundAlbedo is [0.32, 0.30, 0.28] — warm, r > g > b.
    // Reusing it put the dollhouse on dirt; the surround must stay sky-coloured
    // (b >= r) everywhere the orbit camera can look.
    for (const v of [
      [0.5, -0.2, 0.5],
      [0.2, -0.6, 0.1],
      [0, -1, 0],
    ] as Vec3[]) {
      const c = surroundRadiance(v, params(HIGH_SUN))
      const ground = skyRadiance(v, params(HIGH_SUN))
      // The tint being avoided is distinctly warm (groundAlbedo r/b ~= 1.14).
      expect(ground[0] / ground[2]).toBeGreaterThan(1.1)
      // Ours inherits the horizon sky, which near a high sun is pale rather than
      // vividly blue — so assert it is NOT warm like soil, not that it is blue.
      expect(c[0] / c[2]).toBeLessThan(1.05)
    }
  })

  it('dims monotonically toward the nadir but never to black', () => {
    // Compare samples that all take the LOWER-hemisphere branch: the reference has
    // to use the same horizon sample the implementation does, or it lands in
    // Perez's singular region near the horizon and reads ~1.5x different
    // (see HORIZON_EPS).
    const justBelow = surroundRadiance([1, -0.001, 0], params(HIGH_SUN))
    const mid = surroundRadiance([1, -0.5, 0], params(HIGH_SUN))
    const nadir = surroundRadiance([0, -1, 0], params(HIGH_SUN))
    expect(lum(mid)).toBeLessThan(lum(justBelow))
    expect(lum(nadir)).toBeLessThan(lum(mid))
    // Dimmed, not extinguished — a black underside would just be the dark "ground"
    // this replaces.
    expect(lum(nadir)).toBeGreaterThan(lum(justBelow) * (DEFAULT_NADIR_DIM - 0.05))
  })

  it('is continuous across the horizon (no seam or Mach band)', () => {
    // A visible ring where the hemispheres meet is the classic failure of this
    // approach, so pin it: just-below must be within a whisker of just-above.
    // Sampled at HORIZON_EPS either side, so both are outside Perez's singular
    // region and the comparison measures the JOIN rather than that instability.
    const above = surroundRadiance([1, HORIZON_EPS, 0], params(HIGH_SUN))
    const below = surroundRadiance([1, -0.002, 0], params(HIGH_SUN))
    for (let i = 0; i < 3; i++) expect(Math.abs(above[i] - below[i])).toBeLessThan(0.02)
  })

  it('follows the sun: a low sun warms the horizon', () => {
    const low = surroundRadiance([0.9, 0.05, 0.35], params(LOW_SUN))
    expect(low[0]).toBeGreaterThan(low[2]) // sunset glow is warm
  })

  it('darkens the whole surround at night, below AND above the horizon', () => {
    const night = params([0.2, -0.5, 0.3] as Vec3)
    expect(lum(surroundRadiance([0, 1, 0], night))).toBeLessThan(0.02)
    expect(lum(surroundRadiance([0, -1, 0], night))).toBeLessThan(0.02)
  })
})

describe('paintSkySurround', () => {
  it('fills every pixel opaque and in range', () => {
    const w = 16
    const h = 8
    const buf = new Uint8ClampedArray(w * h * 4)
    paintSkySurround(buf, w, h, params(HIGH_SUN))
    for (let i = 0; i < buf.length; i += 4) {
      expect(buf[i + 3]).toBe(255)
      for (let c = 0; c < 3; c++) expect(buf[i + c]).toBeGreaterThanOrEqual(0)
    }
  })

  it('is brighter at the top row than the bottom row', () => {
    const w = 32
    const h = 16
    const buf = new Uint8ClampedArray(w * h * 4)
    paintSkySurround(buf, w, h, params(HIGH_SUN))
    const rowMean = (row: number) => {
      let s = 0
      for (let col = 0; col < w; col++) s += buf[(row * w + col) * 4 + 1]
      return s / w
    }
    expect(rowMean(0)).toBeGreaterThan(rowMean(h - 1))
  })

  it('is deterministic', () => {
    const w = 8
    const h = 4
    const a = new Uint8ClampedArray(w * h * 4)
    const b = new Uint8ClampedArray(w * h * 4)
    paintSkySurround(a, w, h, params(HIGH_SUN))
    paintSkySurround(b, w, h, params(HIGH_SUN))
    expect([...a]).toEqual([...b])
  })
})
