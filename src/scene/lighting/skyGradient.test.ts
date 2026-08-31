import { describe, expect, it } from 'vitest'
import {
  encodeByte,
  equirectDir,
  horizonSampleDir,
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

/**
 * SKY-HORIZON (v0.31.5.97) — the walk-mode window backdrop must not butt a flat
 * ground tint against the sky.
 *
 * Measured before the fix, at 64 deg sun altitude / turbidity 5.0, looking due
 * east, as sRGB-byte luma against elevation:
 *   `5:178  2:176  0.5:175 | -0.5:113  -2:112  -5:109  -10:105  -20:97  -90:48`
 * — a HARD STEP of 62 luma across one degree at the horizon, and a lower
 * hemisphere so flat (113 -> 105 over ten degrees) that it read as one
 * featureless slab through the glass. Aerial perspective was the missing term.
 *
 * These assertions are discriminating: on the bare-tint version the seam test
 * sees 62 instead of ~0, and the continuity test sees the tint, not the sky.
 */
describe('SKY-HORIZON: the ground fades out of the horizon haze', () => {
  const params: SkyParams = { sunDir: sunAt(64), turbidity: 5 }
  /** sRGB-byte luma of a view direction at `deg` elevation, looking due east. */
  const at = (deg: number): number => {
    const t = (deg * Math.PI) / 180
    const rgb = skyRadiance([Math.cos(t), Math.sin(t), 0], params)
    const [r, g, b] = rgb.map((c) => encodeByte(c))
    return 0.2126 * r + 0.7152 * g + 0.0722 * b
  }

  it('has no seam at the horizon', () => {
    // The defect, stated directly. Was 62.
    expect(Math.abs(at(0.5) - at(-0.5))).toBeLessThan(3)
  })

  it('CONTROL: the sky ABOVE the horizon is untouched', () => {
    // The blend must live entirely in the lower hemisphere — if it leaked upward
    // these three would move. Pinned to the PRE-FIX measurements, so this scores
    // zero change by construction and fails loudly if the fix oversteps.
    expect(at(5)).toBeCloseTo(178, -0.5)
    expect(at(2)).toBeCloseTo(176, -0.5)
    expect(at(0.5)).toBeCloseTo(175, -0.5)
  })

  it('meets the sky exactly in the limit at the horizon', () => {
    // Continuity by construction: at v.y -> 0 the blend weight is 0, so the value
    // IS the near-horizon sky sample. This is WHY there is no seam, as opposed to
    // a seam that merely got small.
    const justBelow = skyRadiance([1, -1e-6, 0], params)
    const horizon = skyRadiance(horizonSampleDir([1, -1e-6, 0]), params)
    for (let c = 0; c < 3; c++) expect(justBelow[c]).toBeCloseTo(horizon[c], 5)
  })

  it('still darkens monotonically all the way to the nadir', () => {
    // The orbit surround hit exactly this trap once (it read BRIGHTER halfway down
    // than just below the horizon). Same sampling helper, so guard it here too.
    const degs = [-0.5, -2, -5, -10, -15, -20, -30, -45, -60, -90]
    for (let i = 1; i < degs.length; i++) {
      expect(at(degs[i]!)).toBeLessThanOrEqual(at(degs[i - 1]!) + 0.5)
    }
  })

  it('still resolves into GROUND further down, rather than deleting it', () => {
    // Deliberately NOT the orbit surround's treatment, which removes the ground
    // entirely — right for a dollhouse, wrong for a window. Past the haze span the
    // value must be the untouched ground tint: albedo * k * lvl, k = 0.55 + 0.45*y.
    const y = Math.sin((-45 * Math.PI) / 180)
    const k = 0.55 + 0.45 * y
    const expected = 0.32 * k // groundAlbedo[0], daylight lvl = 1
    const rgb = skyRadiance([Math.cos((-45 * Math.PI) / 180), y, 0], params)
    expect(rgb[0]).toBeCloseTo(expected, 3)
  })

  it('does not brighten the ground at night', () => {
    // The haze samples the sky, and the night sky is dark, so the blend must not
    // become a light leak after sunset.
    const night: SkyParams = { sunDir: sunAt(-20), turbidity: 5 }
    const rgb = skyRadiance([1, -0.2, 0], night)
    expect(lum(rgb)).toBeLessThan(0.05)
  })
})

describe('paintSkyEquirect hoists the haze sample without changing the result', () => {
  it('matches per-pixel skyRadiance everywhere, including below the horizon', () => {
    // The painter computes the SKY-HORIZON haze sample once per column (one column
    // = one azimuth) instead of once per lower-hemisphere pixel — 87ms -> 144ms ->
    // 90ms for a 1024x512 bake. That is a pure speed-up, so the bytes must be
    // IDENTICAL to calling `skyRadiance` per pixel; this test is what makes it a
    // hoist rather than an approximation.
    const params: SkyParams = { sunDir: sunAt(40), turbidity: 4 }
    const w = 32
    const h = 16
    const buf = new Uint8ClampedArray(w * h * 4)
    paintSkyEquirect(buf, w, h, params)
    let below = 0
    for (let row = 0; row < h; row++) {
      for (let col = 0; col < w; col++) {
        const dir = equirectDir(col, row, w, h)
        if (dir[1] < 0) below++
        const expected = skyRadiance(dir, params).map((c) => encodeByte(c))
        const i = (row * w + col) * 4
        expect([buf[i], buf[i + 1], buf[i + 2]]).toEqual(expected)
      }
    }
    // Guard the guard: if the sampling grid never dipped below the horizon this
    // would pass without testing the hoisted path at all.
    expect(below).toBeGreaterThan(0)
  })
})
