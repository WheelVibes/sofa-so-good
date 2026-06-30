/**
 * Unit tests for priceRulesSlice.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_PRICE_RULES } from '../../analysis/renovationCost'
import { useStore } from '../store'

describe('priceRulesSlice', () => {
  beforeEach(() => {
    useStore.getState().__resetForTest()
  })

  it('starts with the default rate card', () => {
    expect(useStore.getState().priceRules).toEqual(DEFAULT_PRICE_RULES)
  })

  it('setPriceRules updates the rate card in one undo step', () => {
    const s = useStore.getState()
    const past = s.past.length
    s.setPriceRules({ ...DEFAULT_PRICE_RULES, carpentryPerM: 450 })
    expect(useStore.getState().priceRules.carpentryPerM).toBe(450)
    expect(useStore.getState().past.length).toBe(past + 1)
    useStore.getState().undo()
    expect(useStore.getState().priceRules.carpentryPerM).toBe(DEFAULT_PRICE_RULES.carpentryPerM)
  })

  it('resetPriceRules restores the default rate card', () => {
    const s = useStore.getState()
    s.setPriceRules({
      ...DEFAULT_PRICE_RULES,
      floor: { ...DEFAULT_PRICE_RULES.floor, wood: 999 },
    })
    s.resetPriceRules()
    expect(useStore.getState().priceRules).toEqual(DEFAULT_PRICE_RULES)
  })
})
