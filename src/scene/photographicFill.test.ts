import { describe, expect, it } from 'vitest'
import { FEATURE_FLAGS, resolveFlags } from '../features/featureFlags'
import {
  fixturesLevel,
  PHOTO_FILL_SCALE,
  PHOTO_WEAVE,
  photographicFillScale,
  photographicWeave,
} from './look'

describe('photographicFillScale — an opt-in key:fill rebalance, per tier', () => {
  const TIERS = ['performance', 'medium', 'high', 'maximum'] as const

  it('is a no-op when off, on every tier, so the shipped look cannot move', () => {
    for (const t of TIERS) expect(photographicFillScale(false, t)).toBe(1)
    expect(photographicFillScale(false, 'nonsense')).toBe(1)
  })

  it('pulls the positionless fill DOWN on every tier', () => {
    for (const t of TIERS) {
      const v = photographicFillScale(true, t)
      expect(v).toBeGreaterThan(0)
      expect(v).toBeLessThan(1)
    }
  })

  it('cuts MORE on the lower tiers, which make less shadow of their own', () => {
    // Calibrated against the photographic band: at 0.8 the same pose reads
    // %<64 10.93 % on maximum but only 6.84 % on medium and 3.25 % on performance.
    expect(PHOTO_FILL_SCALE.medium).toBeLessThan(PHOTO_FILL_SCALE.maximum)
    expect(PHOTO_FILL_SCALE.performance).toBeLessThan(PHOTO_FILL_SCALE.medium)
  })

  it('falls back to the boot-default tier on an unknown one', () => {
    expect(photographicFillScale(true, 'nonsense')).toBe(PHOTO_FILL_SCALE.medium)
  })
})

describe('the photographicFill flag', () => {
  it('is OFF by default in BOTH modes — the DEFAULT-GLOOM trade is the user’s call', () => {
    expect(FEATURE_FLAGS.photographicFill.default).toBe(false)
    expect(resolveFlags(false, {}, false, 'simple').photographicFill).toBe(false)
    expect(resolveFlags(false, {}, false, 'pro').photographicFill).toBe(false)
  })

  it('is REACHABLE in both modes — a look preference, not a pro tool', () => {
    // A `pro`-tier flag would be forced off in Simple, which is exactly what this
    // must NOT be: the comparison has to be available to the default user.
    expect(FEATURE_FLAGS.photographicFill.tier).toBe('simple')
    expect(resolveFlags(true, { photographicFill: true }, false, 'simple').photographicFill).toBe(
      true,
    )
    expect(resolveFlags(true, { photographicFill: true }, false, 'pro').photographicFill).toBe(true)
  })

  it('is not devOnly — it must survive a production build', () => {
    expect(FEATURE_FLAGS.photographicFill.devOnly).toBeUndefined()
  })
})

describe('photographicWeave — relief paired with the light balance', () => {
  it('is the shipped value when the flag is off, so the default look cannot move', () => {
    expect(photographicWeave(0.65, PHOTO_WEAVE.drapery, false)).toBe(0.65)
    expect(photographicWeave(1.3, PHOTO_WEAVE.upholstery, false)).toBe(1.3)
  })

  it('raises relief when the balance can carry it', () => {
    // Measured: under the shipped fill, 0.65 -> 2.2 buys +10 % of surface
    // micro-contrast; under `photographicFill` the same change buys +138 %.
    expect(photographicWeave(0.65, PHOTO_WEAVE.drapery, true)).toBe(PHOTO_WEAVE.drapery)
    expect(PHOTO_WEAVE.drapery).toBeGreaterThan(0.65)
    expect(PHOTO_WEAVE.upholstery).toBeGreaterThan(1.3)
    expect(PHOTO_WEAVE.draperyLinen).toBeGreaterThan(0.95)
  })

  it('keeps linen coarser than cotton, as the shipped pair does', () => {
    expect(PHOTO_WEAVE.draperyLinen).toBeGreaterThan(PHOTO_WEAVE.drapery)
  })
})

describe('fixturesLevel — the user’s switch vs what a view draws', () => {
  // `lightingFromAltitude(...).sun`: 1.0 above 30°, 0.85 at 10°, 0.4 at 0°.
  const DAY = 1
  const NIGHT = 0
  const EVENING = 0.47 // 19:00 in Singapore — sun 1.6° up, an hour from dark

  it('is exactly the user’s switch when the flag is off, in every view and hour', () => {
    for (const cam of ['firstPerson', 'orbit', 'ortho']) {
      for (const d of [DAY, 0.5, NIGHT]) {
        expect(fixturesLevel(true, cam, d, false)).toBe(1)
        expect(fixturesLevel(false, cam, d, false)).toBe(0)
      }
    }
  })

  it('never lights fixtures the user switched OFF', () => {
    for (const cam of ['firstPerson', 'orbit']) {
      for (const photo of [true, false]) {
        expect(fixturesLevel(false, cam, NIGHT, photo)).toBe(0)
      }
    }
  })

  it('skips them ONLY in first person, in full daylight, under the flag', () => {
    expect(fixturesLevel(true, 'firstPerson', DAY, true)).toBe(0)
    // …and nowhere else:
    expect(fixturesLevel(true, 'orbit', DAY, true)).toBe(1) // the dollhouse keeps its warmth
    expect(fixturesLevel(true, 'firstPerson', NIGHT, true)).toBe(1) // legibility after dark
    // Between the fade points it is partial, not on — a hard cut-off popped the
    // room's brightness as the time slider crossed it (mean 175 -> 109).
    const mid = fixturesLevel(true, 'firstPerson', 0.9, true)
    expect(mid).toBeGreaterThan(0)
    expect(mid).toBeLessThan(1)
    expect(fixturesLevel(true, 'firstPerson', EVENING, true)).toBe(1) // 19:00 keeps its lamps
    expect(fixturesLevel(true, 'firstPerson', DAY, false)).toBe(1) // flag off
  })

  it('keeps the lights on when the sun reading is nonsense, rather than risking a black room', () => {
    expect(fixturesLevel(true, 'firstPerson', Number.NaN, true)).toBe(1)
  })

  it('is monotonic in sun strength — never brighter as the sun gets stronger', () => {
    let prev = 1
    for (let i = 0; i <= 20; i++) {
      const v = fixturesLevel(true, 'firstPerson', i / 20, true)
      expect(v).toBeLessThanOrEqual(prev + 1e-9)
      prev = v
    }
  })
})
