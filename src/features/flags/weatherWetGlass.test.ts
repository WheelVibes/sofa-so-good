import { describe, expect, it } from 'vitest'
import { BACKDROP_PRESETS } from '../../scene/backdropEquirect'
import { backdropWeather, presetForWeather } from '../../scene/backdropWeather'
import { weatherGrade } from '../../scene/lighting/weather'
import { wetGlassGrade, wetGlassLevel } from '../../scene/lighting/wetGlass'
import { FEATURE_FLAGS } from './registry'
import { resolveFlags } from './resolve'

/**
 * WEATHER-WET-GLASS + WEATHER-BACKDROP. Both are **simple**-tier, for the reason WEATHER-SKY
 * already had to argue twice: `weatherConditions` is simple-tier and the picker is part of the
 * default experience, so a pro gate here would hide the fix from exactly the users who see the
 * defect. Tested in BOTH modes per CLAUDE.md.
 */
describe.each(['weatherWetGlass', 'weatherBackdrop'] as const)('%s feature flag', (key) => {
  it('is registered as a simple-tier feature, default on, not dev-gated', () => {
    const def = FEATURE_FLAGS[key]
    expect(def).toBeDefined()
    expect(def.tier).toBe('simple')
    expect(def.default).toBe(true)
    // Pure code over procedurally generated pixels: nothing licensed to dev-gate.
    expect(def.devOnly).toBeUndefined()
  })

  it('is ON in Simple mode, the default experience', () => {
    expect(resolveFlags(false, {}, false, 'simple')[key]).toBe(true)
  })

  it('is ON in Pro mode', () => {
    expect(resolveFlags(false, {}, false, 'pro')[key]).toBe(true)
  })

  it('can be turned off, in both modes', () => {
    // `isDev` true: `resolveFlags` only honours an override for a privileged caller.
    const off = { [key]: false }
    expect(resolveFlags(true, off, false, 'simple')[key]).toBe(false)
    expect(resolveFlags(true, off, false, 'pro')[key]).toBe(false)
  })
})

describe('defaulting both ON cannot move the shipped render', () => {
  it('wet glass is the exact dry identity under every condition but rain', () => {
    for (const condition of ['clear', 'partlyCloudy', 'overcast'] as const) {
      const o = { condition, tier: 'realistic' as const, enabled: true, reduceMotion: false }
      const g = wetGlassGrade(wetGlassLevel(o), o)
      expect(g.maps).toBe(false)
      expect(g.roughness).toBe(0)
      expect(g.opacityAdd).toBe(0)
    }
  })

  it('the backdrop grade is skipped entirely for clear, and at night for everything', () => {
    expect(backdropWeather(weatherGrade('clear', 1))).toBeUndefined()
    expect(backdropWeather(weatherGrade('rain', 0))).toBeUndefined()
    // ...and "skipped" means the caller gets the authored object back, not a re-rounded copy.
    expect(presetForWeather(BACKDROP_PRESETS.city, undefined)).toBe(BACKDROP_PRESETS.city)
  })
})
