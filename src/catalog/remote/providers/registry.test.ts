import { beforeEach, describe, expect, it, vi } from 'vitest'

// The dispatch reads the flag per call, so control it directly.
const enabled = { value: true }
vi.mock('../../../features/featureFlags', () => ({
  isFeatureEnabled: () => enabled.value,
}))
vi.mock('./acgLibrary', () => ({
  acgLibrary: { id: 'ambientcg', fetchIndex: vi.fn(async () => ['r2']) },
}))
vi.mock('./ambientcg', () => ({
  ambientcg: { id: 'ambientcg', fetchIndex: vi.fn(async () => ['live']) },
}))
vi.mock('./polyhaven', () => ({ polyhaven: { id: 'polyhaven' } }))

const { PROVIDERS, activeProviderIds } = await import('./index')

describe('ambientcg transport dispatch', () => {
  beforeEach(() => {
    enabled.value = true
  })

  it('uses the R2 mirror when the flag is on', async () => {
    expect(await PROVIDERS.ambientcg.fetchIndex()).toEqual(['r2'])
  })

  it('falls back to the live (dev-proxy) API when the flag is off', async () => {
    enabled.value = false
    expect(await PROVIDERS.ambientcg.fetchIndex()).toEqual(['live'])
  })

  it('re-reads the flag per call, so a runtime toggle needs no reload', async () => {
    expect(await PROVIDERS.ambientcg.fetchIndex()).toEqual(['r2'])
    enabled.value = false
    expect(await PROVIDERS.ambientcg.fetchIndex()).toEqual(['live'])
  })

  it('keeps the ambientcg id on both transports so finish ids round-trip', () => {
    expect(PROVIDERS.ambientcg.id).toBe('ambientcg')
  })
})

describe('activeProviderIds', () => {
  beforeEach(() => {
    enabled.value = true
  })

  it('bootstraps ambientCG in production once the R2 mirror is enabled', () => {
    // The live API has no CORS headers; the mirror is same-origin, so this is
    // the change that makes ambientCG prod-viable at all.
    expect(activeProviderIds(false)).toContain('ambientcg')
  })

  it('leaves production Poly Haven-only when the mirror is disabled', () => {
    enabled.value = false
    expect(activeProviderIds(false)).toEqual(['polyhaven'])
  })

  it('bootstraps every provider in dev regardless of the flag', () => {
    enabled.value = false
    expect(activeProviderIds(true).sort()).toEqual(['ambientcg', 'polyhaven'])
  })
})
