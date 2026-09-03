/**
 * Key selection and azimuth offset. Tested against `skyGradient.equirectDir` — the function that
 * OWNS the app's equirect convention — because a sky that is correct and rotated the wrong way looks
 * like a working feature to every brightness metric and like nonsense out of the window.
 */
import { describe, expect, it } from 'vitest'
import { equirectDir } from './skyGradient'
import { SKY_KEY_ALTITUDES, skyKeyBlend, skyKeyUrl } from './skyKeys'

const DEG = Math.PI / 180
/** Sun TRAVEL vector for an altitude at the keys' baked azimuth (due −Z). */
const travelAt = (altDeg: number, azTurns = 0): [number, number, number] => {
  const a = altDeg * DEG
  const phi = azTurns * 2 * Math.PI
  // Direction TO the sun, then negated: travel points at the scene.
  const dir: [number, number, number] = [
    Math.sin(phi) * Math.cos(a),
    Math.sin(a),
    -Math.cos(phi) * Math.cos(a),
  ]
  return [-dir[0] * 25, -dir[1] * 25, -dir[2] * 25]
}

describe('skyKeyBlend — altitude', () => {
  it('resolves exactly to a key altitude when the sun is at one', () => {
    // Asserted on the EFFECTIVE altitude rather than on `loAlt`, because an exact key is equally
    // correctly expressed as `{lo: 0, hi: 30, t: 1}` or `{lo: 30, hi: 30, t: 0}` — the first
    // version of this test pinned the representation and failed on a correct implementation.
    for (const alt of SKY_KEY_ALTITUDES) {
      const b = skyKeyBlend(travelAt(alt))
      expect(b.loAlt * (1 - b.t) + b.hiAlt * b.t, `alt ${alt}`).toBeCloseTo(alt, 4)
    }
  })

  it('interpolates the altitude linearly across an interval', () => {
    for (const alt of [5, 15, 25, 40, 55, 70, 80]) {
      const b = skyKeyBlend(travelAt(alt))
      expect(b.loAlt * (1 - b.t) + b.hiAlt * b.t, `alt ${alt}`).toBeCloseTo(alt, 4)
    }
  })

  it('blends 50/50 at a midpoint', () => {
    const b = skyKeyBlend(travelAt(15))
    expect(b.loAlt).toBe(0)
    expect(b.hiAlt).toBe(30)
    expect(b.t).toBeCloseTo(0.5, 4)
  })

  it('picks the right bracket in each interval', () => {
    expect(skyKeyBlend(travelAt(45))).toMatchObject({ loAlt: 30, hiAlt: 60 })
    expect(skyKeyBlend(travelAt(70))).toMatchObject({ loAlt: 60, hiAlt: 88 })
  })

  it('CLAMPS below the lowest key instead of extrapolating', () => {
    // Twilight is the analytic continuation's job (`v0.31.7.116`); extrapolating a daylight key
    // into negative altitudes would fight it and re-introduce the black band from the other side.
    for (const alt of [-1, -8, -30]) {
      const b = skyKeyBlend(travelAt(alt))
      expect(b.loAlt, `alt ${alt}`).toBe(0)
      expect(b.hiAlt, `alt ${alt}`).toBe(0)
      expect(b.t, `alt ${alt}`).toBe(0)
    }
  })

  it('clamps above the highest key', () => {
    const b = skyKeyBlend(travelAt(89.9))
    expect(b.loAlt).toBe(88)
    expect(b.hiAlt).toBe(88)
  })
})

describe('skyKeyBlend — azimuth', () => {
  it('is ZERO at the baked azimuth, whatever the altitude', () => {
    // The keys are rendered with the sun due −Z. If this drifted, every sky would be rotated.
    for (const alt of [0, 15, 45, 88]) {
      expect(skyKeyBlend(travelAt(alt)).uOffset, `alt ${alt}`).toBeCloseTo(0, 6)
    }
  })

  it('matches the offset equirectDir implies, which owns the convention', () => {
    // For each azimuth, the sun direction should map to `u = 0.5 + uOffset` under the same mapping
    // `equirectDir` inverts. Built by finding the column whose direction is closest to the sun.
    const w = 720
    for (const azTurns of [0.1, 0.25, 0.5, 0.75, 0.9]) {
      const travel = travelAt(30, azTurns)
      const sun = travel.map((v) => -v / 25) as [number, number, number]
      let best = 0
      let bestDot = -2
      for (let col = 0; col < w; col += 1) {
        const d = equirectDir(col, 128, w, 256)
        const dot = d[0] * sun[0] + d[1] * sun[1] + d[2] * sun[2]
        if (dot > bestDot) {
          bestDot = dot
          best = col
        }
      }
      const uFromDir = (best + 0.5) / w
      const expected = (((uFromDir - 0.5) % 1) + 1) % 1
      expect(skyKeyBlend(travel).uOffset, `az ${azTurns}`).toBeCloseTo(expected, 2)
    }
  })

  it('wraps into [0, 1)', () => {
    for (const azTurns of [-0.3, 0, 0.4, 1.2, 2.7]) {
      const u = skyKeyBlend(travelAt(30, azTurns)).uOffset
      expect(u, `az ${azTurns}`).toBeGreaterThanOrEqual(0)
      expect(u, `az ${azTurns}`).toBeLessThan(1)
    }
  })
})

describe('skyKeyUrl', () => {
  it('names the committed assets', () => {
    expect(skyKeyUrl(0)).toBe('/assets/sky-keys/alt0.png')
    expect(skyKeyUrl(88)).toBe('/assets/sky-keys/alt88.png')
  })
})
