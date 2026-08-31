import { describe, expect, it } from 'vitest'
import { BACKDROP_PRESETS } from './backdropEquirect'

/**
 * CITY-DAYLIGHT (v0.31.5.93) — a preset sold as daytime must not paint a night scene.
 *
 * `buildingWindows` returns ONLY the LIT windows, and the equirect is baked ONCE, so
 * whatever `windowColor` says burns into the facade at every hour of the day. The
 * `city` preset shipped `rgba(255,221,160,0.55)` — warm interior glow — over dark
 * slate `[74,86,104]` blocks, i.e. a night skyline, while its picker entry read
 * "Daytime HDB skyline". Measured at the `win-mainBedroom-N` pose, 13:00, curtains
 * open: the exterior went from rgb(92.7, 96.0, 98.4) (dark, r-b = -5.7) to
 * rgb(132.6, 129.3, 123.0) (sunlit, r-b = +9.6).
 *
 * The invariant is the CONTRAST POLARITY between the glazing and the facade, because
 * that is what reads as time of day regardless of overall exposure:
 *  - by DAY a window is a hole into an unlit interior, so it is DARKER than the
 *    sunlit concrete around it;
 *  - by NIGHT the interior is the only light source, so it is BRIGHTER than the
 *    facade.
 * `city` must satisfy the first and `dusk` the second. Encoding it this way (rather
 * than pinning literal hexes) keeps the presets free to be re-tuned while making the
 * day/night inversion impossible to reintroduce silently.
 */

/** Rec. 709 relative luminance of an `[r,g,b]` triple. */
const lum = (r: number, g: number, b: number) => 0.2126 * r + 0.7152 * g + 0.0722 * b

/** Luminance of a `#rrggbb` string. */
function hexLum(hex: string): number {
  const h = hex.replace('#', '')
  return lum(
    Number.parseInt(h.slice(0, 2), 16),
    Number.parseInt(h.slice(2, 4), 16),
    Number.parseInt(h.slice(4, 6), 16),
  )
}

/** Luminance of an `rgba(r,g,b,a)` string — alpha ignored, we compare the ink. */
function rgbaLum(s: string): number {
  const m = s.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/)
  if (!m) throw new Error(`not an rgb(a) colour: ${s}`)
  return lum(Number(m[1]), Number(m[2]), Number(m[3]))
}

describe('city reads as DAYTIME, dusk reads as EVENING', () => {
  it('city glazing is DARKER than its facade (a daylit window is a dark hole)', () => {
    const p = BACKDROP_PRESETS.city
    const facade = lum(...(p.building as [number, number, number]))
    const glass = rgbaLum(p.windowColor as string)
    // The shipped night palette had glass 214 against facade 84 — inverted.
    expect(glass).toBeLessThan(facade)
  })

  it('dusk glazing is BRIGHTER than its facade (lit rooms after dark)', () => {
    // The counterpart, so the rule is a polarity per preset and not "always darker".
    const p = BACKDROP_PRESETS.dusk
    const facade = lum(...(p.building as [number, number, number]))
    const glass = rgbaLum(p.windowColor as string)
    expect(glass).toBeGreaterThan(facade)
  })

  it('city facades are sunlit concrete, not silhouettes', () => {
    // A daytime block catches light, so it cannot be darker than its own sky.
    // The old [74,86,104] sat far BELOW the sky and read as a cut-out.
    const p = BACKDROP_PRESETS.city
    expect(lum(...(p.building as [number, number, number]))).toBeGreaterThan(hexLum(p.sky[0]))
  })

  it('city sky still runs bright-to-brighter toward the horizon', () => {
    // Aerial perspective: the zenith is the deepest, the horizon the palest. This
    // held before and must survive any re-tune.
    const [zenith, mid, horizon] = BACKDROP_PRESETS.city.sky
    expect(hexLum(zenith)).toBeLessThan(hexLum(mid))
    expect(hexLum(mid)).toBeLessThan(hexLum(horizon))
  })

  it('every buildings preset declares the fields the polarity rule needs', () => {
    for (const [id, p] of Object.entries(BACKDROP_PRESETS)) {
      if (p.horizon !== 'buildings') continue
      expect(p.building, `${id}.building`).toBeDefined()
      expect(p.windowColor, `${id}.windowColor`).toBeDefined()
    }
  })
})
