import { describe, expect, it } from 'vitest'
import { FEATURE_FLAGS, resolveFlags } from '../features/featureFlags'
import { useStore } from '../state/store'

describe('schemeOptions flag', () => {
  it('is a pro-tier flag, on by default', () => {
    const flag = FEATURE_FLAGS['schemeOptions']
    expect(flag).toBeDefined()
    expect(flag.tier).toBe('pro')
    expect(flag.default).toBe(true)
  })

  it('is OFF in Simple mode and ON in Pro mode', () => {
    expect(resolveFlags(false, {}, false, 'simple').schemeOptions).toBe(false)
    expect(resolveFlags(false, {}, false, 'pro').schemeOptions).toBe(true)
  })
})

describe('scheme modal open state', () => {
  it('starts closed and toggles', () => {
    const s = useStore.getState()
    expect(useStore.getState().schemeOptionsOpen).toBe(false)
    s.setSchemeOptionsOpen(true)
    expect(useStore.getState().schemeOptionsOpen).toBe(true)
    s.setSchemeOptionsOpen(false)
    expect(useStore.getState().schemeOptionsOpen).toBe(false)
  })
})
