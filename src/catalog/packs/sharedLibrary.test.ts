import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../features/api/client', async (orig) => {
  const real = (await orig()) as Record<string, unknown>
  return { ...real, hasBackend: () => true, API_BASE: '/api' }
})

import { fetchSharedLibraryIndex } from './sharedLibrary'

const item = (over: Record<string, unknown> = {}) => ({
  group: 'alex-desk',
  name: 'ALEX Desk',
  type: 'Desk',
  category: 'tables',
  size: '',
  series: 'ALEX',
  variants: 1,
  thumbnail: null,
  price: 199,
  currency: 'SGD',
  ...over,
})

function stubFetch(body: unknown, ok = true) {
  const fn = vi.fn().mockResolvedValue({ ok, json: () => Promise.resolve(body) })
  vi.stubGlobal('fetch', fn)
  return fn
}

afterEach(() => vi.unstubAllGlobals())

describe('fetchSharedLibraryIndex', () => {
  it('passes through items that already carry a groupKey', async () => {
    stubFetch({ version: 1, generatedAt: '', count: 1, items: [item({ groupKey: 'gk-1' })] })
    const index = await fetchSharedLibraryIndex()
    expect(index?.items[0]?.groupKey).toBe('gk-1')
  })

  it('backfills a missing groupKey from the group slug (pre-groupKey manifests)', async () => {
    // A stale manifest without groupKey would otherwise collapse every card to
    // one `ikea-undefined` id in the unified-grid dedup.
    stubFetch({ version: 1, generatedAt: '', count: 2, items: [item(), item({ group: 'billy' })] })
    const index = await fetchSharedLibraryIndex()
    expect(index?.items.map((i) => i.groupKey)).toEqual(['alex-desk', 'billy'])
  })

  it('drops malformed items without a group', async () => {
    stubFetch({ version: 1, generatedAt: '', count: 2, items: [item(), { name: 'junk' }] })
    const index = await fetchSharedLibraryIndex()
    expect(index?.items).toHaveLength(1)
  })

  it('returns null when items is not an array', async () => {
    stubFetch({ version: 1, generatedAt: '', count: 0, items: 'nope' })
    expect(await fetchSharedLibraryIndex()).toBeNull()
  })

  it('returns null on a non-OK response', async () => {
    stubFetch({}, false)
    expect(await fetchSharedLibraryIndex()).toBeNull()
  })
})
