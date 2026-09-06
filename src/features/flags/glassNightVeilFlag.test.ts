// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { windowTransmission, windowTransmissionRealView } from '../../materials/materialRealism'
import { FEATURE_FLAGS } from './registry'
import { parseFlagOverrides, resolveFlags } from './resolve'

/**
 * GLASS-NIGHT-VEIL + EXTERIOR-FACE-DAYLIGHT ship one flag each, both `tier: 'simple'` and both
 * default ON. Simple is where the move-in default lives — the 4-room flat's living-room window at
 * dusk and its own outside wall seen through that window — so a `pro` tier would silence both
 * fixes in the only mode most users ever see. CLAUDE.md requires both modes to be tested.
 */
describe('glassNightVeil flag', () => {
  it('is registered, simple-tier and ON by default', () => {
    const def = FEATURE_FLAGS.glassNightVeil
    expect(def.tier).toBe('simple')
    expect(def.default).toBe(true)
    // Pure code (one coefficient in the pane's per-frame drive) — nothing to keep out of prod.
    expect(def.devOnly).toBeUndefined()
  })

  it('is ON in BOTH modes', () => {
    expect(resolveFlags(false, {}, false, 'simple').glassNightVeil).toBe(true)
    expect(resolveFlags(false, {}, false, 'pro').glassNightVeil).toBe(true)
  })

  it('can be turned OFF in BOTH modes by a privileged session, and not otherwise', () => {
    const off = { glassNightVeil: false }
    expect(resolveFlags(true, off, false, 'simple').glassNightVeil).toBe(false)
    expect(resolveFlags(true, off, false, 'pro').glassNightVeil).toBe(false)
    expect(resolveFlags(false, off, false, 'simple').glassNightVeil).toBe(true)
  })
})

describe('exteriorFaceDaylight flag', () => {
  it('is registered, simple-tier and ON by default', () => {
    const def = FEATURE_FLAGS.exteriorFaceDaylight
    expect(def.tier).toBe('simple')
    expect(def.default).toBe(true)
    expect(def.devOnly).toBeUndefined()
  })

  it('is ON in BOTH modes', () => {
    expect(resolveFlags(false, {}, false, 'simple').exteriorFaceDaylight).toBe(true)
    expect(resolveFlags(false, {}, false, 'pro').exteriorFaceDaylight).toBe(true)
  })

  it('can be turned OFF in BOTH modes by a privileged session, and not otherwise', () => {
    const off = { exteriorFaceDaylight: false }
    expect(resolveFlags(true, off, false, 'simple').exteriorFaceDaylight).toBe(false)
    expect(resolveFlags(true, off, false, 'pro').exteriorFaceDaylight).toBe(false)
    expect(resolveFlags(false, off, false, 'simple').exteriorFaceDaylight).toBe(true)
  })
})

describe('the ?ff= override the verify scenarios rely on', () => {
  it('parses BOTH flags off from one comma-separated value', () => {
    // `scripts/scenarios/glass-night-veil-verify-off.json` boots with
    // `?ff=glassNightVeil:off,exteriorFaceDaylight:off`, and the lightmap attach reads its flag
    // once at boot — a post-boot `setFeatureFlag` is too late for the exterior half (the same
    // trap ESTATE-CORRIDOR-NIGHT documents). So this syntax is load-bearing for the -off arm.
    expect(parseFlagOverrides('glassNightVeil:off,exteriorFaceDaylight:off')).toEqual({
      glassNightVeil: false,
      exteriorFaceDaylight: false,
    })
  })
})

describe('windowTransmissionRealView', () => {
  it('is the IDENTITY by day, which is what keeps the 13:00 frame unchanged', () => {
    // The day pane runs `windowTransmission(1)` = 0.92 and must keep running it: the veil is a
    // night defect, and a day change here would be a regression against the GLASS-CLARITY frames.
    const day = windowTransmission(1)
    expect(windowTransmissionRealView(day, 0)).toBe(day)
  })

  it('reaches the measured 0.99 at full dark, from the estate-damped 0.812', () => {
    // 0.812 is what ESTATE-NIGHT-GLASS's `dn = d * 0.15` leaves at 20:00, and the ~19 % remainder
    // is the diffuse veil. 0.99 measured +1.24 counts off the pane-hidden façade against +62.7
    // before — see `docs/open-graphics-decisions.md` item (ae).
    const night = windowTransmission(1 - 0.15)
    expect(night).toBeCloseTo(0.812, 6)
    expect(windowTransmissionRealView(night, 1)).toBeCloseTo(0.99, 6)
  })

  it('is monotonic through the dusk band and never exceeds the night value', () => {
    const base = windowTransmission(1 - 0.15 * 0.5)
    const mid = windowTransmissionRealView(base, 0.5)
    expect(mid).toBeGreaterThan(base)
    expect(mid).toBeLessThan(0.99)
    // Clamped, so an unnormalised darkness signal cannot push transmission past 1 and make the
    // pane render darker than no pane at all (the T = 1.00 arm in item (ae)).
    expect(windowTransmissionRealView(0.812, 4)).toBeCloseTo(0.99, 6)
    expect(windowTransmissionRealView(0.812, -1)).toBeCloseTo(0.812, 6)
  })
})
