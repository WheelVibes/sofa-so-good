import { describe, expect, it } from 'vitest'
import { WEATHER_CONDITIONS } from '../../state/slices/timeSlice'
import { daylightFromAltitude, daytimeSkyTint } from './altitudeCurve'
import { BEAM, daylightChroma, FILL, GLOBAL_TRANSMITTANCE, weatherGrade } from './weather'

const DEG = Math.PI / 180

describe('weatherGrade — the safety property', () => {
  it("'clear' is the EXACT identity at every daylight level", () => {
    // The load-bearing one. `clear` is the default condition, so a user who never opens the picker
    // must get the shipped render — and `=== 1` is a stronger claim than `toBeCloseTo(1)`.
    for (const d of [0, 0.01, 0.5, 0.999, 1, 2, -1, Number.NaN]) {
      const g = weatherGrade('clear', d)
      expect(g.sun).toBe(1)
      expect(g.fill).toBe(1)
      expect(g.blowout).toBe(1)
      expect(g.skyTint).toEqual([1, 1, 1])
      expect(g.fillTint).toEqual([1, 1, 1])
    }
  })

  it('every condition is the EXACT identity at night', () => {
    // Rule 8: a term must be scaled by the source it came from. Weather is a daylight phenomenon;
    // after dark there is no beam to remove, so the night render must be untouched by the picker.
    for (const c of WEATHER_CONDITIONS) {
      const g = weatherGrade(c, 0)
      expect(g.sun).toBe(1)
      expect(g.fill).toBe(1)
      expect(g.blowout).toBe(1)
      expect(g.skyTint).toEqual([1, 1, 1])
      expect(g.fillTint).toEqual([1, 1, 1])
    }
  })

  it('the night level really is reached by a real altitude', () => {
    // Guards the pairing rather than the function: `daylightFromAltitude` is what the callers feed
    // in, and if it never returned 0 the clause above would be unreachable in the running app.
    expect(daylightFromAltitude(-20 * DEG)).toBe(0)
    expect(daylightFromAltitude(10 * DEG)).toBe(1)
  })
})

describe('weatherGrade — the direction of every term', () => {
  it('removes the beam entirely under a full deck, and halves it at 4 oktas', () => {
    expect(weatherGrade('overcast', 1).sun).toBe(0)
    expect(weatherGrade('rain', 1).sun).toBe(0)
    expect(weatherGrade('partlyCloudy', 1).sun).toBeCloseTo(0.5, 6)
  })

  it('darkens the fill under a deck and lifts it slightly at 4 oktas', () => {
    expect(weatherGrade('overcast', 1).fill).toBeCloseTo(0.55, 6)
    expect(weatherGrade('rain', 1).fill).toBeCloseTo(0.48, 6)
    expect(weatherGrade('partlyCloudy', 1).fill).toBeGreaterThan(1)
  })

  it('orders the conditions lightest → heaviest on the fill', () => {
    // `WEATHER_CONDITIONS` is documented as a progression; `partlyCloudy` is the exception and is
    // asserted separately above, so this checks the three that must descend.
    const heavy = ['clear', 'overcast', 'rain'] as const
    const fills = heavy.map((c) => weatherGrade(c, 1).fill)
    expect(fills[0]).toBeGreaterThan(fills[1])
    expect(fills[1]).toBeGreaterThan(fills[2])
  })

  it('collapses the window blow-out, and derives it from the other two numbers', () => {
    for (const c of WEATHER_CONDITIONS) {
      expect(weatherGrade(c, 1).blowout).toBeCloseTo(GLOBAL_TRANSMITTANCE[c] / FILL[c], 6)
    }
    expect(weatherGrade('overcast', 1).blowout).toBeLessThan(0.4)
    expect(weatherGrade('rain', 1).blowout).toBeLessThan(0.4)
  })

  it('ramps every term linearly to identity as the day level falls', () => {
    const half = weatherGrade('overcast', 0.5)
    const full = weatherGrade('overcast', 1)
    expect(half.sun).toBeCloseTo(1 + (full.sun - 1) * 0.5, 6)
    expect(half.fill).toBeCloseTo(1 + (full.fill - 1) * 0.5, 6)
    expect(half.blowout).toBeCloseTo(1 + (full.blowout - 1) * 0.5, 6)
  })

  it('clamps a daylight level outside 0..1 rather than extrapolating', () => {
    expect(weatherGrade('overcast', 5).fill).toBeCloseTo(weatherGrade('overcast', 1).fill, 6)
    expect(weatherGrade('overcast', -5)).toEqual(weatherGrade('overcast', 0))
    expect(weatherGrade('overcast', Number.NaN)).toEqual(weatherGrade('overcast', 0))
  })
})

describe('weatherGrade — colour', () => {
  it('makes the sky tint carry CHROMA only, never brightness', () => {
    // A tint that changed luminance would silently re-open the `fill` fit, which was measured
    // against Cycles. Rec.709 luminance of the tint applied to the clear sky must equal the clear
    // sky's own, because both chromas are luminance-normalised by construction.
    const sky = daytimeSkyTint()
    for (const c of WEATHER_CONDITIONS) {
      const t = weatherGrade(c, 1).skyTint
      const tinted = [sky[0] * t[0], sky[1] * t[1], sky[2] * t[2]]
      const luma = (v: number[]) => 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]
      expect(luma(tinted)).toBeCloseTo(luma([...sky]), 2)
    }
  })

  it('takes the blue out of the sky under a deck — a cloud deck is near-neutral', () => {
    const sky = daytimeSkyTint()
    const t = weatherGrade('overcast', 1).skyTint
    // Blue down, red up: the clear hemisphere is [0.55, 0.66, 0.92] and a 6600 K deck is not.
    expect(t[2]).toBeLessThan(0.85)
    expect(t[0]).toBeGreaterThan(1.1)
    // And the RESULT is near-neutral, which is the claim that matters.
    const tinted = [sky[0] * t[0], sky[1] * t[1], sky[2] * t[2]]
    expect(Math.abs(tinted[0] - tinted[2])).toBeLessThan(0.1)
  })

  it('keeps the NEUTRAL fill neutral — `fillTint` is not the ratio', () => {
    // The bug this pins: applying `skyTint` (a clear-sky-to-deck RATIO, [1.18, 0.99, 0.72] at
    // 6600 K) to the already-white `ambientLight` tinted the flat fill WARM, which is the opposite
    // of what a cloud deck does. `fillTint` is the deck's absolute chroma instead.
    const ov = weatherGrade('overcast', 1).fillTint
    expect(ov[0]).toBeCloseTo(1, 1)
    expect(ov[2]).toBeCloseTo(1, 1)
    expect(ov[2]).toBeGreaterThan(ov[0]) // a 6600 K deck is a shade cooler than D65
    const rain = weatherGrade('rain', 1).fillTint
    expect(rain[2] / rain[0]).toBeGreaterThan(ov[2] / ov[0])
  })

  it('leaves rain colder than overcast', () => {
    const ov = weatherGrade('overcast', 1).skyTint
    const rain = weatherGrade('rain', 1).skyTint
    expect(rain[2] / rain[0]).toBeGreaterThan(ov[2] / ov[0])
  })
})

describe('daylightChroma', () => {
  it('returns neutral at D65, which is what proves the chain', () => {
    // D65 IS the sRGB white point, so any error in xy → XYZ → linear sRGB shows up here first.
    const [r, g, b] = daylightChroma(6500)
    expect(r).toBeCloseTo(1, 2)
    expect(g).toBeCloseTo(1, 2)
    expect(b).toBeCloseTo(1, 2)
  })

  it('gets bluer as the colour temperature rises', () => {
    const warm = daylightChroma(5000)
    const cool = daylightChroma(9000)
    expect(cool[2] / cool[0]).toBeGreaterThan(warm[2] / warm[0])
  })

  it('matches the Blender-side port at the temperatures the grade uses', () => {
    // Pinned against `python/scripts/blender/weather_sky.py:daylight_linear_srgb`, which is what
    // the Cycles references were rendered with. Two implementations of the same curve that drift
    // apart would make the reference and the app disagree for a reason nothing would report.
    expect(daylightChroma(6600).map((v) => +v.toFixed(4))).toEqual([0.9913, 1.0011, 1.0144])
    expect(daylightChroma(7300).map((v) => +v.toFixed(4))).toEqual([0.941, 1.0058, 1.1168])
  })

  it('clamps outside the locus rather than returning nonsense', () => {
    expect(daylightChroma(1000)).toEqual(daylightChroma(4000))
    expect(daylightChroma(99999)).toEqual(daylightChroma(25000))
    expect(daylightChroma(Number.NaN)).toEqual(daylightChroma(6500))
  })
})

describe('published constants', () => {
  it('keeps Kasten & Czeplak at 4 oktas rather than a rounded copy of it', () => {
    expect(GLOBAL_TRANSMITTANCE.partlyCloudy).toBeCloseTo(0.92895, 5)
    expect(GLOBAL_TRANSMITTANCE.clear).toBe(1)
  })

  it('covers every shipped condition in all three tables', () => {
    for (const c of WEATHER_CONDITIONS) {
      expect(GLOBAL_TRANSMITTANCE[c]).toBeGreaterThan(0)
      expect(BEAM[c]).toBeGreaterThanOrEqual(0)
      expect(FILL[c]).toBeGreaterThan(0)
    }
  })
})
