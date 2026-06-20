import { describe, expect, it } from 'vitest'
import {
  equirectDir,
  paintSkyEquirect,
  type SkyParams,
  skyRadiance,
  type Vec3,
} from './skyGradient'

/** Relative luminance (Rec.709) of a linear RGB triple. */
function lum(c: Vec3): number {
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
}

/** A sun roughly at the given altitude/azimuth (radians), scene space. */
function sunAt(altDeg: number, azDeg = 0): Vec3 {
  const alt = (altDeg * Math.PI) / 180
  const az = (azDeg * Math.PI) / 180
  return [Math.cos(alt) * Math.sin(az), Math.sin(alt), Math.cos(alt) * Math.cos(az)]
}

const ZENITH: Vec3 = [0, 1, 0]
const HORIZON_N: Vec3 = [0, 0.02, -1] // just above the horizon, looking -Z

describe('skyRadiance — analytic Preetham', () => {
  it('zenith is brighter than the horizon for a high midday sun', () => {
    const params: SkyParams = { sunDir: sunAt(80), turbidity: 3 }
    expect(lum(skyRadiance(ZENITH, params))).toBeGreaterThan(lum(skyRadiance(HORIZON_N, params)))
  })

  it('the sun side of the sky is brighter than the anti-sun side', () => {
    // Sun low in the +Z(north of looking) direction, compare two horizon views.
    const params: SkyParams = { sunDir: sunAt(15, 0), turbidity: 4 }
    const towardSun: Vec3 = [0, 0.05, 1] // matches sun azimuth (z+)
    const awayFromSun: Vec3 = [0, 0.05, -1]
    expect(lum(skyRadiance(towardSun, params))).toBeGreaterThan(
      lum(skyRadiance(awayFromSun, params)),
    )
  })

  it('higher turbidity whitens the sky near the sun (less saturated blue)', () => {
    const sun = sunAt(40, 0)
    const nearSun: Vec3 = [0, Math.sin((38 * Math.PI) / 180), Math.cos((38 * Math.PI) / 180)]
    const sat = (c: Vec3) => {
      const max = Math.max(c[0], c[1], c[2]) || 1
      const min = Math.min(c[0], c[1], c[2])
      return (max - min) / max
    }
    const clear = skyRadiance(nearSun, { sunDir: sun, turbidity: 2 })
    const hazy = skyRadiance(nearSun, { sunDir: sun, turbidity: 9 })
    // Hazy sky near the sun is whiter (lower saturation) than a clear sky.
    expect(sat(hazy)).toBeLessThan(sat(clear))
  })

  it('a low sun warms the horizon (more red than blue near the sun)', () => {
    const params: SkyParams = { sunDir: sunAt(3, 0), turbidity: 4 }
    const nearSunHorizon: Vec3 = [0, 0.04, 1]
    const c = skyRadiance(nearSunHorizon, params)
    // Warm: red channel exceeds blue.
    expect(c[0]).toBeGreaterThan(c[2])
  })

  it('below-horizon (night) sun darkens the whole sky', () => {
    const day = skyRadiance(ZENITH, { sunDir: sunAt(40), turbidity: 4 })
    const night = skyRadiance(ZENITH, { sunDir: sunAt(-12), turbidity: 4 })
    expect(lum(night)).toBeLessThan(lum(day))
    // Deep night is essentially dark.
    expect(lum(night)).toBeLessThan(0.02)
  })

  it('returns finite, non-negative RGB for many directions and sun altitudes', () => {
    for (let alt = -20; alt <= 90; alt += 10) {
      const params: SkyParams = { sunDir: sunAt(alt, 30), turbidity: 6 }
      for (let i = 0; i < 24; i++) {
        const dir = equirectDir(i * 4, (i * 3) % 32, 96, 48)
        const c = skyRadiance(dir, params)
        for (const v of c) {
          expect(Number.isFinite(v)).toBe(true)
          expect(v).toBeGreaterThanOrEqual(0)
        }
      }
    }
  })

  it('the lower hemisphere is a ground tint that darkens toward the nadir', () => {
    const params: SkyParams = { sunDir: sunAt(50), turbidity: 4 }
    const nearHorizon: Vec3 = [0, -0.05, 1]
    const nadir: Vec3 = [0, -1, 0]
    expect(lum(skyRadiance(nearHorizon, params))).toBeGreaterThan(lum(skyRadiance(nadir, params)))
  })
})

describe('equirectDir', () => {
  it('maps the top row to (near) the zenith and the bottom row to the nadir', () => {
    const top = equirectDir(0, 0, 8, 4)
    const bottom = equirectDir(0, 3, 8, 4)
    expect(top[1]).toBeGreaterThan(0.5) // upward
    expect(bottom[1]).toBeLessThan(-0.5) // downward
  })

  it('returns unit-length directions', () => {
    const d = equirectDir(3, 2, 8, 4)
    expect(Math.hypot(d[0], d[1], d[2])).toBeCloseTo(1, 5)
  })
})

describe('paintSkyEquirect', () => {
  it('fills the whole RGBA buffer with finite bytes (alpha = 255)', () => {
    const w = 16
    const h = 8
    const buf = new Uint8ClampedArray(w * h * 4)
    paintSkyEquirect(buf, w, h, { sunDir: sunAt(45), turbidity: 4 })
    for (let i = 0; i < buf.length; i += 4) {
      expect(buf[i + 3]).toBe(255)
    }
    // Top row (sky) should be brighter than bottom row (ground) for a day sun.
    const topG = buf[1]
    const bottomG = buf[(w * (h - 1) + 0) * 4 + 1]
    expect(topG).toBeGreaterThan(bottomG)
  })

  it('paints a brighter buffer at midday than at night', () => {
    const w = 16
    const h = 8
    const day = new Uint8ClampedArray(w * h * 4)
    const night = new Uint8ClampedArray(w * h * 4)
    paintSkyEquirect(day, w, h, { sunDir: sunAt(60), turbidity: 4 })
    paintSkyEquirect(night, w, h, { sunDir: sunAt(-12), turbidity: 4 })
    const sum = (b: Uint8ClampedArray) => b.reduce((a, v) => a + v, 0)
    expect(sum(day)).toBeGreaterThan(sum(night))
  })
})
