import { beforeEach, describe, expect, it, vi } from 'vitest'

// `activeProviderIds` reads the flag per call, so control it directly.
const enabled = { value: true }
vi.mock('../../../features/featureFlags', () => ({
  isFeatureEnabled: () => enabled.value,
}))
vi.mock('./acgLibrary', () => ({
  acgLibrary: { id: 'ambientcg', fetchIndex: vi.fn(async () => ['r2']) },
}))
vi.mock('./polyhaven', () => ({ polyhaven: { id: 'polyhaven' } }))

const { PROVIDERS, activeProviderIds } = await import('./index')

describe('ambientcg transport', () => {
  it('is the R2 mirror, with no live-API fallback left to dispatch to', async () => {
    // The live ambientcg.com transport was removed (dead CDN host, 100-asset
    // page cap, null categories) — a stale index pointing at it is what made
    // every card load forever.
    expect(await PROVIDERS.ambientcg.fetchIndex()).toEqual(['r2'])
  })

  it('keeps the ambientcg id so persisted finish ids round-trip', () => {
    expect(PROVIDERS.ambientcg.id).toBe('ambientcg')
  })
})

describe('activeProviderIds', () => {
  beforeEach(() => {
    enabled.value = true
  })

  it('bootstraps ambientCG whenever the R2 mirror is enabled', () => {
    expect(activeProviderIds()).toContain('ambientcg')
  })

  it('leaves the catalog Poly Haven-only when the mirror is disabled', () => {
    enabled.value = false
    expect(activeProviderIds()).toEqual(['polyhaven'])
  })

  it('answers the same in dev and prod — one same-origin transport, no env split', () => {
    expect(activeProviderIds()).toEqual(['polyhaven', 'ambientcg'])
  })
})
