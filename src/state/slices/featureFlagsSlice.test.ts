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

  it('re-resolving flags after an admin session change keeps the map coherent (re-resolution wiring)', () => {
    useStore.getState().signOut()
    useStore.getState().resetFeatureFlags()
    // A backend admin session sets currentUser; sign-in/out both call
    // reresolveFeatureFlags. Set it directly (no client-side gate any more) and
    // confirm re-resolution still yields a coherent map + report on (Pro).
    useStore.setState({ currentUser: { id: 'admin', name: 'Admin', role: 'admin' } })
    useStore.getState().reresolveFeatureFlags()
    expect(useStore.getState().featureFlags.report).toBe(true)
    useStore.getState().signOut()
    expect(useStore.getState().currentUser).toBeNull()
  })
})
