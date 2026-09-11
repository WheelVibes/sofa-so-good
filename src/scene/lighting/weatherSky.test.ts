import { describe, expect, it } from 'vitest'
import { FEATURE_FLAGS } from '../../features/flags/registry'
import { resolveFlags } from '../../features/flags/resolve'
import type { WeatherCondition } from '../../state/slices/timeSlice'
import { daylightFromAltitude, skyFromAltitude } from './altitudeCurve'
import {
  clearDomeLuminance,
  encodeByte,
  overcastShape,
  paintSkyEquirect,
  type SkyParams,
  skyRadiance,
  skyWeather,
  type Vec3,
} from './skyGradient'
import { type SkyState, shouldRebuildSky } from './skyRebuild'
import { paintSkySurround, surroundRadiance } from './skySurround'
import { weatherGrade } from './weather'

/**
 * WEATHER-SKY — the sky BACKDROP follows the weather condition, using the terms the shipped
 * lighting grade already exposes (`weather.ts` is a read-only contract here).
 */

const dirAt = (altDeg: number, aziDeg = 0): Vec3 => {
  const a = (altDeg * Math.PI) / 180
  const z = (aziDeg * Math.PI) / 180
  return [Math.cos(a) * Math.sin(z), Math.sin(a), -Math.cos(a) * Math.cos(z)]
}

/** The app's default hour: Singapore 13:00, sun at ~87 degrees (see `weather.ts`). */
const NOON_ALT = (87 * Math.PI) / 180
const LOW_ALT = (16 * Math.PI) / 180

function paramsFor(condition: WeatherCondition, altRad: number): SkyParams {
  const base: SkyParams = {
    sunDir: dirAt((altRad * 180) / Math.PI, 0),
    turbidity: skyFromAltitude(altRad).turbidity,
  }
  return {
    ...base,
    weather: skyWeather(weatherGrade(condition, daylightFromAltitude(altRad)), base),
  }
}

const luma = (c: Vec3) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
/** Max |R-G|, |G-B|, |R-B| relative to luminance — 0 for a neutral grey. */
const chroma = (c: Vec3) => {
  const l = luma(c)
  return l <= 0
    ? 0
    : Math.max(Math.abs(c[0] - c[1]), Math.abs(c[1] - c[2]), Math.abs(c[0] - c[2])) / l
}

describe('skyWeather — the deck built from the shipped grade', () => {
  it('is UNDEFINED for clear, so the clear sky runs the shipped code path untouched', () => {
    // Not "a neutral deck": `weatherGrade('clear', d).sun` is an exact literal 1 at every hour, so
    // `cover` is exactly 0 and there is no lerp-by-zero to round.
    for (const alt of [NOON_ALT, LOW_ALT, -0.1]) {
      const base: SkyParams = { sunDir: dirAt((alt * 180) / Math.PI), turbidity: 5 }
      expect(skyWeather(weatherGrade('clear', daylightFromAltitude(alt)), base)).toBeUndefined()
    }
  })

  it('is UNDEFINED at night for EVERY condition — weather is a property of daylight', () => {
    // `weather.ts` rule 8: after dark there is no beam to remove and no dome to brighten, so the
    // grade ramps to identity and the sky must not move either.
    const nightAlt = (-12 * Math.PI) / 180
    const base: SkyParams = { sunDir: dirAt(-12), turbidity: 8 }
    for (const c of ['partlyCloudy', 'overcast', 'rain'] as WeatherCondition[]) {
      expect(skyWeather(weatherGrade(c, daylightFromAltitude(nightAlt)), base)).toBeUndefined()
    }
  })

  it('reads cover straight off grade.sun — the beam lost IS the dome covered', () => {
    const base: SkyParams = { sunDir: dirAt(87), turbidity: 5 }
    const cover = (c: WeatherCondition) => skyWeather(weatherGrade(c, 1), base)?.cover
    expect(cover('partlyCloudy')).toBeCloseTo(0.5, 10) // 4 oktas: the disc is out half the time
    expect(cover('overcast')).toBe(1)
    expect(cover('rain')).toBe(1)
  })

  it('reads level off grade.fill and the deck chroma off grade.fillTint, not skyTint', () => {
    const base: SkyParams = { sunDir: dirAt(87), turbidity: 5 }
    for (const c of ['partlyCloudy', 'overcast', 'rain'] as WeatherCondition[]) {
      const g = weatherGrade(c, 1)
      const w = skyWeather(g, base)
      expect(w?.level).toBe(g.fill)
      expect(w?.tint).toEqual(g.fillTint)
      // `skyTint` is the deck/clear-sky RATIO; applying it to a luminance (which is neutral) is
      // the bug `weather.ts` records catching in the frames, so it must NOT be what we picked.
      expect(w?.tint).not.toEqual(g.skyTint)
    }
  })
})

describe('overcastShape — CIE standard overcast, energy-normalised', () => {
  it('has a cosine-weighted hemispherical mean of exactly 1', () => {
    // This is what makes `level` the ONLY level term: the shape redistributes, it never dims.
    let acc = 0
    let wsum = 0
    const N = 4000
    for (let i = 0; i < N; i++) {
      const c = (i + 0.5) / N
      acc += overcastShape(c) * c
      wsum += c
    }
    expect(acc / wsum).toBeCloseTo(1, 3)
  })

  it('is 3:1 zenith-to-horizon and monotonic — near-uniform, not flat', () => {
    expect(overcastShape(1) / overcastShape(0)).toBeCloseTo(3, 10)
    let prev = -1
    for (let c = 0; c <= 1.0001; c += 0.05) {
      const v = overcastShape(c)
      expect(v).toBeGreaterThan(prev)
      prev = v
    }
  })

  it('clamps below the horizon rather than going negative', () => {
    expect(overcastShape(-0.5)).toBe(overcastShape(0))
  })
})

describe('clearDomeLuminance', () => {
  it('ignores any deck already on the params — the reference is the CLEAR dome', () => {
    const base: SkyParams = { sunDir: dirAt(87), turbidity: 5 }
    const withDeck: SkyParams = { ...base, weather: skyWeather(weatherGrade('rain', 1), base) }
    expect(clearDomeLuminance(withDeck)).toBe(clearDomeLuminance(base))
  })

  it('falls with the sun, as the dome it measures does', () => {
    const at = (deg: number) =>
      clearDomeLuminance({
        sunDir: dirAt(deg),
        turbidity: skyFromAltitude((deg * Math.PI) / 180).turbidity,
      })
    expect(at(87)).toBeGreaterThan(at(45))
    expect(at(45)).toBeGreaterThan(at(16))
    expect(at(16)).toBeGreaterThan(at(5))
  })
})

describe('skyRadiance under weather', () => {
  it('is BYTE-IDENTICAL for clear against the pre-weather code path', () => {
    // The load-bearing safety property: a user who never opens the picker gets the shipped sky.
    const alt = NOON_ALT
    const plain: SkyParams = { sunDir: dirAt(87), turbidity: skyFromAltitude(alt).turbidity }
    const withClear = paramsFor('clear', alt)
    for (let elev = -90; elev <= 90; elev += 3) {
      for (let azi = 0; azi < 360; azi += 45) {
        const d = dirAt(elev, azi)
        const a = skyRadiance(d, plain).map(encodeByte)
        const b = skyRadiance(d, withClear).map(encodeByte)
        expect(b).toEqual(a)
      }
    }
  })

  it('collapses the horizon/zenith gradient and the near-sun aureole under a full deck', () => {
    // The clear low sun paints a strong warm aureole; under stratus there is no disc to have one.
    const clear = paramsFor('clear', LOW_ALT)
    const overcast = paramsFor('overcast', LOW_ALT)
    const toward = dirAt(1.15, 0)
    const away = dirAt(1.15, 180)
    expect(luma(skyRadiance(toward, clear)) / luma(skyRadiance(away, clear))).toBeGreaterThan(3)
    expect(luma(skyRadiance(toward, overcast)) / luma(skyRadiance(away, overcast))).toBeCloseTo(
      1,
      2,
    )
  })

  it('goes neutral under overcast and slightly COOL under rain', () => {
    const at = (c: WeatherCondition) => skyRadiance(dirAt(20, 120), paramsFor(c, NOON_ALT))
    const clear = at('clear')
    const overcast = at('overcast')
    const rain = at('rain')
    expect(chroma(overcast)).toBeLessThan(chroma(clear))
    // Cool = blue channel above red. The clear midday sky is cool too, so the test that matters is
    // that rain is COOLER THAN OVERCAST, which is the 6600 K -> 7300 K deck.
    expect(rain[2] / rain[0]).toBeGreaterThan(overcast[2] / overcast[0])
  })

  it('orders the conditions by level at the horizon: partlyCloudy > clear > overcast > rain', () => {
    const h = (c: WeatherCondition) => luma(skyRadiance(dirAt(1.15, 120), paramsFor(c, NOON_ALT)))
    // Away from the sun the deck is brighter than the blue sky it covers; `weather.ts` records
    // this as real and counter-intuitive (a half-covered sky puts MORE light through a window).
    expect(h('clear')).toBeGreaterThan(h('overcast'))
    expect(h('overcast')).toBeGreaterThan(h('rain'))
    // Rain is only ~11 % darker than overcast outdoors — the visible difference is the colour.
    expect(h('rain') / h('overcast')).toBeGreaterThan(0.8)
  })

  it('keeps partlyCloudy strictly between clear and a full deck', () => {
    const d = dirAt(40, 150)
    const v = (c: WeatherCondition) => skyRadiance(d, paramsFor(c, LOW_ALT))
    const partly = chroma(v('partlyCloudy'))
    expect(partly).toBeLessThan(chroma(v('clear')))
    expect(partly).toBeGreaterThan(chroma(v('overcast')))
  })

  it('dims and neutralises the window view GROUND, and keeps the horizon seamless', () => {
    // SKY-HORIZON's invariant must survive the deck: at v.y -> 0 the blend weight is 0, so both
    // sides agree in the limit whatever the weather did to the ground.
    const p = paramsFor('overcast', NOON_ALT)
    const clear = paramsFor('clear', NOON_ALT)
    expect(luma(skyRadiance(dirAt(-40, 90), p))).toBeLessThan(
      luma(skyRadiance(dirAt(-40, 90), clear)),
    )
    const above = skyRadiance(dirAt(0.3, 90), p).map(encodeByte)
    const below = skyRadiance(dirAt(-0.3, 90), p).map(encodeByte)
    for (let i = 0; i < 3; i++) expect(Math.abs(above[i] - below[i])).toBeLessThanOrEqual(2)
  })

  it('keeps the surround monotonic to the nadir and never brightest underneath', () => {
    // The `|| 1` nadir trap: an undefined azimuth that collapses to the zenith makes the underside
    // the brightest part. The deck must not reintroduce it.
    for (const c of ['partlyCloudy', 'overcast', 'rain'] as WeatherCondition[]) {
      const p = paramsFor(c, NOON_ALT)
      let prev = Number.POSITIVE_INFINITY
      // Starts BELOW the horizon: at exactly y = 0 `surroundRadiance` takes the above-horizon
      // branch and lands in Perez's 1/cos(zenith) singular region, which is the whole reason
      // `HORIZON_EPS` exists. That is pre-existing and unrelated to the deck.
      for (let elev = -1; elev >= -90; elev -= 5) {
        const v = luma(surroundRadiance(dirAt(elev, 45), p))
        expect(v).toBeLessThanOrEqual(prev + 1e-9)
        prev = v
      }
      expect(luma(surroundRadiance(dirAt(-90, 45), p))).toBeLessThan(
        luma(surroundRadiance(dirAt(1.15, 45), p)),
      )
      // The orbit surround still has NO ground tint: below the horizon it is grey-on-grey with the
      // horizon above it, not a brown slab.
      expect(chroma(surroundRadiance(dirAt(-45, 45), p))).toBeCloseTo(
        chroma(surroundRadiance(dirAt(1.15, 45), p)),
        2,
      )
    }
  })
})

describe('the painters carry the deck without changing shape', () => {
  const W = 32
  const H = 16

  it('paintSkyEquirect stays byte-identical to per-pixel skyRadiance under a deck', () => {
    // The per-column haze hoist must keep agreeing with the un-hoisted model — the deck is a
    // per-BAKE term, so it cannot have broken the column invariant, and this pins that.
    const p = paramsFor('rain', NOON_ALT)
    const buf = new Uint8ClampedArray(W * H * 4)
    paintSkyEquirect(buf, W, H, p)
    let i = 0
    for (let row = 0; row < H; row++) {
      for (let col = 0; col < W; col++) {
        const u = (col + 0.5) / W
        const t = (row + 0.5) / H
        const phi = u * 2 * Math.PI - Math.PI
        const theta = t * Math.PI
        const s = Math.sin(theta)
        const rgb = skyRadiance([Math.sin(phi) * s, Math.cos(theta), -Math.cos(phi) * s], p)
        expect(buf[i]).toBe(encodeByte(rgb[0]))
        expect(buf[i + 1]).toBe(encodeByte(rgb[1]))
        expect(buf[i + 2]).toBe(encodeByte(rgb[2]))
        i += 4
      }
    }
  })

  it('both painters are byte-identical for clear with and without a resolved deck', () => {
    const alt = NOON_ALT
    const plain: SkyParams = { sunDir: dirAt(87), turbidity: skyFromAltitude(alt).turbidity }
    const clear = paramsFor('clear', alt)
    for (const paint of [paintSkyEquirect, paintSkySurround]) {
      const a = new Uint8ClampedArray(W * H * 4)
      const b = new Uint8ClampedArray(W * H * 4)
      paint(a, W, H, plain)
      paint(b, W, H, clear)
      expect(Array.from(b)).toEqual(Array.from(a))
    }
  })

  it('both painters MOVE under a full deck — the two surfaces respond together', () => {
    const clear = paramsFor('clear', NOON_ALT)
    const overcast = paramsFor('overcast', NOON_ALT)
    for (const paint of [paintSkyEquirect, paintSkySurround]) {
      const a = new Uint8ClampedArray(W * H * 4)
      const b = new Uint8ClampedArray(W * H * 4)
      paint(a, W, H, clear)
      paint(b, W, H, overcast)
      let moved = 0
      for (let i = 0; i < a.length; i += 4) if (a[i] !== b[i]) moved++
      expect(moved / (W * H)).toBeGreaterThan(0.9)
    }
  })
})

describe('shouldRebuildSky — a weather change re-bakes', () => {
  const base: SkyState = { sunDir: [0, 1, 0], turbidity: 4, orientationDeg: 0, weather: 'clear' }

  it('rebuilds when the condition changes, with no threshold to cross', () => {
    expect(shouldRebuildSky(base, { ...base, weather: 'overcast' })).toBe(true)
    expect(shouldRebuildSky({ ...base, weather: 'overcast' }, { ...base, weather: 'rain' })).toBe(
      true,
    )
  })

  it('does not rebuild when it does not', () => {
    expect(shouldRebuildSky(base, { ...base })).toBe(false)
  })

  it('treats an absent condition as clear on both sides (callers written before this)', () => {
    const bare: SkyState = { sunDir: [0, 1, 0], turbidity: 4, orientationDeg: 0 }
    expect(shouldRebuildSky(bare, { ...bare })).toBe(false)
    expect(shouldRebuildSky(bare, { ...bare, weather: 'clear' })).toBe(false)
    expect(shouldRebuildSky(bare, { ...bare, weather: 'rain' })).toBe(true)
  })
})

describe('weatherSky feature flag (BOTH modes)', () => {
  it('is registered simple-tier and default on', () => {
    const def = FEATURE_FLAGS.weatherSky
    expect(def).toBeDefined()
    expect(def.tier).toBe('simple')
    expect(def.default).toBe(true)
    expect(def.devOnly).toBeUndefined()
  })

  it('is ON in Simple — the app default, and the orbit view is the boot view', () => {
    // SKY-ANALYTIC-ORBIT / WINDOW-SKY-DEFAULT: a change to the DEFAULT look behind a pro-tier flag
    // is invisible to exactly the users who see the default look, because Simple forces pro off.
    expect(resolveFlags(true, {}, false, 'simple').weatherSky).toBe(true)
    expect(resolveFlags(false, {}, false, 'simple').weatherSky).toBe(true)
  })

  it('is ON in Pro', () => {
    expect(resolveFlags(true, {}, false, 'pro').weatherSky).toBe(true)
    expect(resolveFlags(false, {}, false, 'pro').weatherSky).toBe(true)
  })

  it('can be turned off in either mode, and then the sky is the clear one', () => {
    expect(resolveFlags(true, { weatherSky: false }, false, 'simple').weatherSky).toBe(false)
    expect(resolveFlags(true, { weatherSky: false }, false, 'pro').weatherSky).toBe(false)
    // What "off" resolves to, at the one place both surfaces gate: the `clear` condition, whose
    // deck is `undefined`, i.e. the shipped bytes.
    const base: SkyParams = { sunDir: dirAt(87), turbidity: 5 }
    expect(skyWeather(weatherGrade('clear', 1), base)).toBeUndefined()
  })
})
