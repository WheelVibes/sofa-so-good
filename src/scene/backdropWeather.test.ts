import { describe, expect, it } from 'vitest'
import type { WeatherCondition } from '../state/slices/timeSlice'
import { BACKDROP_PRESETS, type PhotoBackdropKind } from './backdropEquirect'
import { backdropWeather, presetForWeather } from './backdropWeather'
import { weatherGrade } from './lighting/weather'

const KINDS: PhotoBackdropKind[] = ['city', 'dusk', 'park', 'hills']

const hex = (s: string): [number, number, number] => {
  const n = Number.parseInt(s.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
const luma = (c: [number, number, number]) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
/** Max channel spread — a cheap, monotone stand-in for saturation on an 0..255 triple. */
const chroma = (c: [number, number, number]) => Math.max(...c) - Math.min(...c)

const forCondition = (condition: WeatherCondition, daylight = 1) =>
  backdropWeather(weatherGrade(condition, daylight))

describe('backdropWeather', () => {
  it('returns `undefined` for clear, so the shipped bake runs the shipped path', () => {
    for (const daylight of [0, 0.4, 1]) expect(forCondition('clear', daylight)).toBeUndefined()
  })

  it('returns `undefined` for EVERY condition at night — the grade is identity there', () => {
    for (const c of ['partlyCloudy', 'overcast', 'rain'] as WeatherCondition[]) {
      expect(forCondition(c, 0)).toBeUndefined()
    }
  })

  it('takes its three terms straight off the shipped grade, inventing nothing', () => {
    const grade = weatherGrade('overcast', 1)
    const w = forCondition('overcast')
    expect(w).toBeDefined()
    expect(w?.cover).toBe(1 - grade.sun)
    expect(w?.level).toBe(grade.fill)
    expect(w?.tint).toEqual(grade.fillTint)
  })

  it('covers the sky completely under a full deck and halfway at 4 oktas', () => {
    expect(forCondition('overcast')?.cover).toBe(1)
    expect(forCondition('rain')?.cover).toBe(1)
    expect(forCondition('partlyCloudy')?.cover).toBeCloseTo(0.5, 6)
  })
})

describe('presetForWeather', () => {
  it('returns the SAME OBJECT when there is no weather — byte-identical by identity', () => {
    for (const kind of KINDS) {
      const p = BACKDROP_PRESETS[kind]
      expect(presetForWeather(p, undefined)).toBe(p)
      expect(presetForWeather(p, forCondition('clear'))).toBe(p)
    }
  })

  it('desaturates and darkens every preset under overcast', () => {
    const w = forCondition('overcast')
    for (const kind of KINDS) {
      const before = BACKDROP_PRESETS[kind]
      const after = presetForWeather(before, w)
      for (const i of [0, 1, 2] as const) {
        expect(chroma(hex(after.sky[i]))).toBeLessThan(chroma(hex(before.sky[i])))
        expect(luma(hex(after.sky[i]))).toBeLessThan(luma(hex(before.sky[i])))
      }
    }
  })

  it('kills the DUSK preset’s sunset glow, which is the loudest lie under a deck', () => {
    const before = hex(BACKDROP_PRESETS.dusk.sky[2]) // the orange horizon stop
    const after = hex(presetForWeather(BACKDROP_PRESETS.dusk, forCondition('overcast')).sky[2])
    // Authored orange: red far above blue. Under a deck that separation has to collapse.
    expect(before[0] - before[2]).toBeGreaterThan(100)
    expect(after[0] - after[2]).toBeLessThan(30)
  })

  it('flattens the sky-to-horizon step, which is what an overcast frame actually looks like', () => {
    const before = BACKDROP_PRESETS.city
    const after = presetForWeather(before, forCondition('overcast'))
    const step = (p: typeof before) =>
      Math.abs(luma(hex(p.sky[0])) - luma(hex(p.sky[2]))) / Math.max(1, luma(hex(p.sky[2])))
    expect(step(after)).toBeLessThan(step(before))
  })

  it('leaves partlyCloudy a PARTIAL version of the same move, not a third case', () => {
    const p = BACKDROP_PRESETS.city
    const partly = hex(presetForWeather(p, forCondition('partlyCloudy')).sky[0])
    const over = hex(presetForWeather(p, forCondition('overcast')).sky[0])
    const clear = hex(p.sky[0])
    expect(chroma(partly)).toBeLessThan(chroma(clear))
    expect(chroma(partly)).toBeGreaterThan(chroma(over))
  })

  it('renders rain COOLER than overcast, which is the 6600 K → 7300 K deck', () => {
    const p = BACKDROP_PRESETS.city
    const over = hex(presetForWeather(p, forCondition('overcast')).sky[1])
    const rain = hex(presetForWeather(p, forCondition('rain')).sky[1])
    expect(rain[2] - rain[0]).toBeGreaterThan(over[2] - over[0])
  })

  it('never emits an out-of-range or malformed colour', () => {
    for (const c of ['partlyCloudy', 'overcast', 'rain'] as WeatherCondition[]) {
      for (const kind of KINDS) {
        const after = presetForWeather(BACKDROP_PRESETS[kind], forCondition(c))
        for (const s of [...after.sky, ...after.ground, after.haze]) {
          expect(s).toMatch(/^#[0-9a-f]{6}$/)
        }
      }
    }
  })

  it('grades the SKYLINE with the sky, so a backlit silhouette cannot end up brighter than it', () => {
    // Measured defect (R7-R, painted equirect bytes at 13:00): under `rain` the city sky fell to
    // byte 92 while the building band stayed at 141 — a backlit skyline reading as a lit one.
    const before = BACKDROP_PRESETS.city
    const after = presetForWeather(before, forCondition('rain'))
    expect(after.building).toBeDefined()
    expect(luma(after.building as [number, number, number])).toBeLessThan(
      luma(before.building as [number, number, number]),
    )
    // ...and the far end of the atmospheric fade now targets the DECK, not white.
    expect(after.atmosphere).toBeDefined()
    expect(Math.max(...(after.atmosphere as [number, number, number]))).toBeLessThan(255)
  })

  it('leaves the atmospheric fade at WHITE for clear, so the shipped bake is untouched', () => {
    expect(
      presetForWeather(BACKDROP_PRESETS.city, forCondition('clear')).atmosphere,
    ).toBeUndefined()
    // partlyCloudy is half-covered, so it is half-way between white and its own deck.
    const partly = presetForWeather(BACKDROP_PRESETS.city, forCondition('partlyCloudy'))
    const over = presetForWeather(BACKDROP_PRESETS.city, forCondition('overcast'))
    const p = partly.atmosphere as [number, number, number]
    const o = over.atmosphere as [number, number, number]
    expect(luma(p)).toBeGreaterThan(luma(o))
    expect(luma(p)).toBeLessThan(255)
  })

  it('leaves the rgba lit-window colour alone rather than mangling it', () => {
    const after = presetForWeather(BACKDROP_PRESETS.city, forCondition('rain'))
    expect(after.windowColor).toBe(BACKDROP_PRESETS.city.windowColor)
  })
})
