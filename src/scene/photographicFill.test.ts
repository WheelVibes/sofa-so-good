import { describe, expect, it } from 'vitest'
import { FEATURE_FLAGS, resolveFlags } from '../features/featureFlags'
import {
  fixturesRender,
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

describe('fixturesRender — the user’s switch vs what a view draws', () => {
  const DAY = 1
  const NIGHT = 0

  it('is exactly the user’s switch when the flag is off, in every view and hour', () => {
    for (const cam of ['firstPerson', 'orbit', 'ortho']) {
      for (const d of [DAY, 0.5, NIGHT]) {
        expect(fixturesRender(true, cam, d, false)).toBe(true)
        expect(fixturesRender(false, cam, d, false)).toBe(false)
      }
    }
  })

  it('never lights fixtures the user switched OFF', () => {
    for (const cam of ['firstPerson', 'orbit']) {
      for (const photo of [true, false]) {
        expect(fixturesRender(false, cam, NIGHT, photo)).toBe(false)
      }
    }
  })

  it('skips them ONLY in first person, in full daylight, under the flag', () => {
    expect(fixturesRender(true, 'firstPerson', DAY, true)).toBe(false)
    // …and nowhere else:
    expect(fixturesRender(true, 'orbit', DAY, true)).toBe(true) // the dollhouse keeps its warmth
    expect(fixturesRender(true, 'firstPerson', NIGHT, true)).toBe(true) // legibility after dark
    expect(fixturesRender(true, 'firstPerson', 0.9, true)).toBe(true) // not yet full daylight
    expect(fixturesRender(true, 'firstPerson', DAY, false)).toBe(true) // flag off
  })

  it('keeps the lights on when daylight is nonsense, rather than risking a black room', () => {
    expect(fixturesRender(true, 'firstPerson', Number.NaN, true)).toBe(true)
  })
})
