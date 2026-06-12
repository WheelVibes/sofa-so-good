import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resolveFlags } from '../../features/featureFlags'
import {
  cheapestFirst,
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
})

describe('livePrices dev/tier gate (unchanged by retailer expansion)', () => {
  it('is forced off in prod, in both Simple and Pro modes', () => {
    expect(resolveFlags(false, {}, false, 'simple').livePrices).toBe(false)
    expect(resolveFlags(false, {}, false, 'pro').livePrices).toBe(false)
  })

  it('in dev it is pro-tier: hidden in Simple, on in Pro', () => {
    expect(resolveFlags(true, {}, false, 'simple').livePrices).toBe(false)
    expect(resolveFlags(true, {}, false, 'pro').livePrices).toBe(true)
  })
})
