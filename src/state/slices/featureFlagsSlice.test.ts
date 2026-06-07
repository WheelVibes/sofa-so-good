import { beforeEach, describe, expect, it } from 'vitest'
import { isFeatureEnabled } from '../../features/featureFlags'
import { useStore } from '../store'

describe('featureFlagsSlice', () => {
  beforeEach(() => {
    useStore.getState().resetFeatureFlags()
  })

  it('seeds the store with the resolved flags (report on by default)', () => {
    expect(useStore.getState().featureFlags.report).toBe(true)
  })

  it('setFeatureFlag toggles the store and keeps isFeatureEnabled in sync (dev)', () => {
    // Tests run with import.meta.env.DEV true, so overrides apply.
    useStore.getState().setFeatureFlag('report', false)
    expect(useStore.getState().featureFlags.report).toBe(false)
    expect(isFeatureEnabled('report')).toBe(false)
  })

  it('resetFeatureFlags restores registry defaults', () => {
    useStore.getState().setFeatureFlag('report', false)
    useStore.getState().resetFeatureFlags()
    expect(useStore.getState().featureFlags.report).toBe(true)
    expect(isFeatureEnabled('report')).toBe(true)
  })

  it('signing in as admin re-resolves flags (re-resolution wiring)', async () => {
    useStore.getState().signOut()
    useStore.getState().resetFeatureFlags()
    await useStore.getState().signIn({ password: 'sofa-admin' })
    // The re-resolution ran on sign-in; flags still cover every key + report on.
    expect(useStore.getState().featureFlags.report).toBe(true)
    useStore.getState().signOut()
  })
})
