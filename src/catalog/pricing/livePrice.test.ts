import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resolveFlags } from '../../features/featureFlags'
import {
  cheapestFirst,
  fetchLivePrice,
  fetchLivePrices,
  type LivePrice,
  pingPriceSidecar,
  resetLivePriceCache,
  sidecarRetailerIds,
} from './livePrice'

const offer = (retailer: string, price: number): LivePrice => ({
  price,
  currency: 'SGD',
  url: `https://example.com/${retailer}`,
  title: `Sofa at ${retailer}`,
  retailer,
  image: null,
  source: 'live',
})

describe('cheapestFirst', () => {
  it('sorts offers by ascending price without mutating the input', () => {
    const input = [offer('a', 300), offer('b', 100), offer('c', 200)]
    const sorted = cheapestFirst(input)
    expect(sorted.map((o) => o.price)).toEqual([100, 200, 300])
    expect(input.map((o) => o.price)).toEqual([300, 100, 200])
  })
})

describe('multi-retailer sidecar client', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    resetLivePriceCache()
    vi.stubGlobal('fetch', fetchMock)
    fetchMock.mockReset()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    resetLivePriceCache()
  })

  const json = (body: unknown, ok = true) =>
    Promise.resolve({ ok, json: () => Promise.resolve(body) })

  it('adopts the retailer list advertised by /health', async () => {
    expect(sidecarRetailerIds()).toEqual(['ikea-sg']) // pre-ping fallback
    fetchMock.mockImplementation((url: string) => {
      if (String(url).includes('/health'))
        return json({ ok: true, retailers: ['ikea-sg', 'courts-sg', 'hipvan-sg', 'castlery-sg'] })
      return json({ error: 'no match' }, false)
    })
    expect(await pingPriceSidecar()).toBe(true)
    expect(sidecarRetailerIds()).toEqual(['ikea-sg', 'courts-sg', 'hipvan-sg', 'castlery-sg'])
  })

  it('fetches every retailer, drops failures, returns cheapest-first', async () => {
    fetchMock.mockImplementation((url: string) => {
      const u = String(url)
      if (u.includes('/health'))
        return json({ ok: true, retailers: ['ikea-sg', 'courts-sg', 'hipvan-sg'] })
      if (u.includes('retailer=ikea-sg')) return json(offer('ikea-sg', 450))
      if (u.includes('retailer=courts-sg')) return json(offer('courts-sg', 399))
      // hipvan-sg: sidecar found no match -> 404 -> dropped, not thrown.
      return json({ error: 'no match' }, false)
    })
    await pingPriceSidecar()
    const offers = await fetchLivePrices('fabric sofa')
    expect(offers.map((o) => o.retailer)).toEqual(['courts-sg', 'ikea-sg'])
    expect(offers[0].price).toBe(399)
  })

  it('caches a successful lookup — the same key never hits the network twice', async () => {
    fetchMock.mockImplementation(() => json(offer('ikea-sg', 200)))
    const first = await fetchLivePrice('lamp', 'ikea-sg')
    expect(first?.price).toBe(200)
    const second = await fetchLivePrice('lamp', 'ikea-sg')
    expect(second).toEqual(first)
    expect(fetchMock).toHaveBeenCalledTimes(1) // served from cache
  })

  it('caches a failed lookup as null — no retry storms on a miss', async () => {
    fetchMock.mockImplementation(() => json({ error: 'no match' }, false))
    expect(await fetchLivePrice('nope', 'ikea-sg')).toBeNull()
    expect(await fetchLivePrice('nope', 'ikea-sg')).toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('returns null (and caches it) when the network throws', async () => {
    fetchMock.mockRejectedValue(new Error('offline'))
    expect(await fetchLivePrice('x', 'ikea-sg')).toBeNull()
    expect(await fetchLivePrice('x', 'ikea-sg')).toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('keys the cache by retailer — same query, different retailer, fetches each', async () => {
    fetchMock.mockImplementation((url: string) =>
      json(offer(String(url).includes('courts-sg') ? 'courts-sg' : 'ikea-sg', 150)),
    )
    await fetchLivePrice('sofa', 'ikea-sg')
    await fetchLivePrice('sofa', 'courts-sg')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('dedupes concurrent lookups of the same key into a single fetch', async () => {
    let release: () => void = () => {}
    const gate = new Promise<void>((r) => {
      release = r
    })
    fetchMock.mockImplementation(async () => {
      await gate
      return { ok: true, json: () => Promise.resolve(offer('ikea-sg', 99)) }
    })
    const p1 = fetchLivePrice('dup', 'ikea-sg')
    const p2 = fetchLivePrice('dup', 'ikea-sg')
    release()
    const [a, b] = await Promise.all([p1, p2])
    expect(a).toEqual(b)
    expect(fetchMock).toHaveBeenCalledTimes(1) // shared in-flight promise
  })

  it('caches the /health probe — no re-ping until the cache is reset', async () => {
    fetchMock.mockImplementation(() => json({ ok: true, retailers: ['ikea-sg'] }))
    expect(await pingPriceSidecar()).toBe(true)
    const calls = fetchMock.mock.calls.length
    expect(await pingPriceSidecar()).toBe(true)
    expect(fetchMock.mock.calls.length).toBe(calls) // cached, no second probe
    // …until a reset forces a fresh probe.
    resetLivePriceCache()
    await pingPriceSidecar()
    expect(fetchMock.mock.calls.length).toBe(calls + 1)
  })

  it('reports the sidecar down (false) when /health throws', async () => {
    fetchMock.mockRejectedValue(new Error('connection refused'))
    expect(await pingPriceSidecar()).toBe(false)
  })

  it('keeps the default retailer when /health omits a retailer list', async () => {
    fetchMock.mockImplementation(() => json({ ok: true }))
    expect(await pingPriceSidecar()).toBe(true)
    expect(sidecarRetailerIds()).toEqual(['ikea-sg'])
  })
})

describe('livePrices dev/tier gate (unchanged by retailer expansion)', () => {
  it('is forced off in prod, in both Simple and Pro modes', () => {
    expect(resolveFlags(false, {}, false, 'simple').livePrices).toBe(false)
    expect(resolveFlags(false, {}, false, 'pro').livePrices).toBe(false)
  })

  it('in dev it is pro-tier and default-off: hidden in Simple, off in Pro unless overridden on', () => {
    expect(resolveFlags(true, {}, false, 'simple').livePrices).toBe(false)
    // Prod default is now off, so even a privileged Pro session stays off by default…
    expect(resolveFlags(true, {}, false, 'pro').livePrices).toBe(false)
    // …but a dev/admin override can still turn it on (devOnly unlocked when privileged).
    expect(resolveFlags(true, { livePrices: true }, false, 'pro').livePrices).toBe(true)
  })
})
