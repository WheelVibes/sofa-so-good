import { describe, expect, it } from 'vitest'
import { FEATURE_FLAGS, resolveFlags } from '../features/featureFlags'
import { PHOTO_FILL_SCALE, PHOTO_WEAVE, photographicFillScale, photographicWeave } from './look'

describe('photographicFillScale — an opt-in key:fill rebalance', () => {
  it('is a no-op when off, so the shipped look cannot move', () => {
    expect(photographicFillScale(false)).toBe(1)
  })

  it('pulls the positionless fill DOWN when on', () => {
    expect(photographicFillScale(true)).toBe(PHOTO_FILL_SCALE)
    expect(PHOTO_FILL_SCALE).toBeGreaterThan(0)
    expect(PHOTO_FILL_SCALE).toBeLessThan(1)
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
