import { describe, expect, it } from 'vitest'
import { weatherGrade } from '../../scene/lighting/weather'
import { visDayScale } from '../../scene/visibilityLightmap'
import { FEATURE_FLAGS } from './registry'
import { resolveFlags } from './resolve'

/**
 * WEATHER-BAKED-GI. A **simple**-tier render-quality fix: `weatherConditions` is simple-tier and is
 * the app default, so a pro-tier gate here would hide the fix from exactly the users who see the
 * defect. Tested in BOTH modes per CLAUDE.md.
 *
 * The defect: `weatherGrade` reached the sun, the fill, the IBL probe, the estate and the sky
 * backdrop, and did NOT reach the two levels the baked-GI injection writes — so under a full cloud
 * deck, where the direct beam is exactly zero and every other indirect source in the room is down
 * to 0.55, the baked bounce kept its whole clear-sky midday value. That is rule 8 of
 * `src/scene/CLAUDE.md`'s lightmap bullet with the level INCOMPLETE rather than missing.
 */
describe('weatherBakedGi feature flag', () => {
  it('is registered as a simple-tier feature, default on', () => {
    const def = FEATURE_FLAGS.weatherBakedGi
    expect(def).toBeDefined()
    expect(def.tier).toBe('simple')
    expect(def.default).toBe(true)
    // Pure code over already-shipped assets: nothing licensed or sidecar-dependent to dev-gate.
    expect(def.devOnly).toBeUndefined()
  })

  it('is ON in Simple mode, the default experience', () => {
    expect(resolveFlags(false, {}, false, 'simple').weatherBakedGi).toBe(true)
  })

  it('is ON in Pro mode', () => {
    expect(resolveFlags(false, {}, false, 'pro').weatherBakedGi).toBe(true)
  })

  it('can be turned off, in both modes', () => {
    // `isDev` true: `resolveFlags` only honours an override for a privileged caller, so passing
    // false here would assert nothing.
    const off = { weatherBakedGi: false }
    expect(resolveFlags(true, off, false, 'simple').weatherBakedGi).toBe(false)
    expect(resolveFlags(true, off, false, 'pro').weatherBakedGi).toBe(false)
  })

  it('defaulting ON cannot move the shipped render, because `clear` is an exact identity', () => {
    // This is why the flag is safe at `true`. It is not a claim about rounding: `weatherGrade`
    // returns literal 1s for `clear`, so the injected levels are multiplied by the NUMBER 1 —
    // the same guarantee `weatherConditions` itself shipped on.
    for (const daylight of [0, 0.37, 1]) {
      const grade = weatherGrade('clear', daylight)
      expect(grade.bounce).toBe(1)
      expect(grade.blowout).toBe(1)
      expect(visDayScale(daylight, true, grade.bounce)).toBe(visDayScale(daylight, true))
    }
  })
})
