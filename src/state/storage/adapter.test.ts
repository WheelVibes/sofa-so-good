import { describe, expect, it } from 'vitest'
import { getStorageAdapter, isCloudActive } from './adapter'
import { LocalStorageAdapter } from './LocalStorageAdapter'

/**
 * Adapter selection. With no backend configured (the test env leaves
 * `VITE_API_BASE` unset, matching the GitHub Pages / offline build) cloud sync
 * is inactive and every save/load must go to `LocalStorageAdapter` — guests are
 * never routed through the network.
 */
describe('storage adapter selection', () => {
  it('is local-only when no backend is configured', () => {
    expect(isCloudActive()).toBe(false)
    expect(getStorageAdapter()).toBe(LocalStorageAdapter)
  })
})
