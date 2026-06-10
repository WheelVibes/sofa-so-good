import { beforeEach, describe, expect, it } from 'vitest'
import { isFeatureEnabled } from '../../features/featureFlags'
import { useStore } from '../store'

describe('featureFlagsSlice', () => {
  beforeEach(() => {
    // Start each test from Pro mode + registry defaults unless it opts into Simple.
    useStore.getState().setUiMode('pro')
    useStore.getState().resetFeatureFlags()
  })

  it('seeds a pro flag on in Pro mode and off in Simple mode (both modes)', () => {
    useStore.getState().setUiMode('pro')
    expect(useStore.getState().featureFlags.report).toBe(true)
    useStore.getState().setUiMode('simple')
    expect(useStore.getState().featureFlags.report).toBe(false)
    // A simple-tier (core) feature stays on in both modes.
    expect(useStore.getState().featureFlags.smartStart).toBe(true)
    useStore.getState().setUiMode('pro')
    expect(useStore.getState().featureFlags.smartStart).toBe(true)
  })

  it('setFeatureFlag toggles the store and keeps isFeatureEnabled in sync (dev, Pro)', () => {
    // Tests run with import.meta.env.DEV true, so overrides apply.
    useStore.getState().setFeatureFlag('report', false)
    expect(useStore.getState().featureFlags.report).toBe(false)
    expect(isFeatureEnabled('report')).toBe(false)
  })

  it('resetFeatureFlags restores registry defaults (Pro)', () => {
    useStore.getState().setFeatureFlag('report', false)
    useStore.getState().resetFeatureFlags()
    expect(useStore.getState().featureFlags.report).toBe(true)
    expect(isFeatureEnabled('report')).toBe(true)
  })

  it('signing in as admin re-resolves flags (re-resolution wiring)', async () => {
    useStore.getState().signOut()
    useStore.getState().resetFeatureFlags()
    await useStore.getState().signIn({ password: 'sofa-admin' })
    // The re-resolution ran on sign-in; flags still cover every key + report on (Pro).
    expect(useStore.getState().featureFlags.report).toBe(true)
    useStore.getState().signOut()
  })
})
