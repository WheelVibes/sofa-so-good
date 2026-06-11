import { useEffect, useState } from 'react'

/**
 * Client for the local price sidecar (`npm run price-server`). Dev-only: it
 * resolves a furniture name to real Singapore retailer prices + buy links
 * (IKEA SG / Courts / HipVan / Castlery) for the Shopping panel's "live
 * prices" toggle. Everything degrades gracefully — if the sidecar isn't
 * running or a lookup fails, callers fall back to the bundled estimate.
 */

export interface LivePrice {
  price: number
  currency: string
  url: string | null
  title: string
  retailer: string
  /** Human label for the retailer (e.g. 'Courts'), sent by the sidecar. */
  retailerLabel?: string
  image: string | null
  source: 'live' | 'cache'
}

const PORT = 5175
const BASE = `http://localhost:${PORT}`
/** Fallback retailer set when the sidecar's /health doesn't list any. */
const DEFAULT_RETAILERS = ['ikea-sg']

/** Module cache (query -> resolved/failed) so the panel doesn't re-fetch a name
 *  every render. Promise dedupes concurrent lookups of the same query. */
const cache = new Map<string, LivePrice | null>()
const inflight = new Map<string, Promise<LivePrice | null>>()

let sidecarUp: boolean | null = null
let sidecarRetailers: string[] = DEFAULT_RETAILERS

export function resetLivePriceCache(): void {
  cache.clear()
  inflight.clear()
  sidecarUp = null
  sidecarRetailers = DEFAULT_RETAILERS
}

/** Retailer ids advertised by the sidecar's /health (after a successful ping). */
export function sidecarRetailerIds(): string[] {
  return sidecarRetailers
}

/** Sort offers cheapest-first (stable for equal prices). Pure. */
export function cheapestFirst(offers: LivePrice[]): LivePrice[] {
  return [...offers].sort((a, b) => a.price - b.price)
}

/** Is the sidecar reachable? Cached after the first probe; also captures the
 *  retailer list it advertises so the client never hardcodes the set. */
export async function pingPriceSidecar(): Promise<boolean> {
  if (sidecarUp !== null) return sidecarUp
  try {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 1500)
    const r = await fetch(`${BASE}/health`, { signal: ctrl.signal })
    clearTimeout(t)
    sidecarUp = r.ok
    if (r.ok) {
      const body = (await r.json()) as { retailers?: string[] }
      if (Array.isArray(body.retailers) && body.retailers.length > 0)
        sidecarRetailers = body.retailers
    }
  } catch {
    sidecarUp = false
  }
  return sidecarUp
}

export async function fetchLivePrice(
  query: string,
  retailer = 'ikea-sg',
): Promise<LivePrice | null> {
  const key = `${retailer}:${query.toLowerCase()}`
  if (cache.has(key)) return cache.get(key) ?? null
  const existing = inflight.get(key)
  if (existing) return existing
  const p = (async () => {
    try {
      const ctrl = new AbortController()
      const t = setTimeout(() => ctrl.abort(), 6000)
      const r = await fetch(
        `${BASE}/price?q=${encodeURIComponent(query)}&retailer=${encodeURIComponent(retailer)}`,
        { signal: ctrl.signal },
      )
      clearTimeout(t)
      if (!r.ok) {
        cache.set(key, null)
        return null
      }
      const value = (await r.json()) as LivePrice
      cache.set(key, value)
      return value
    } catch {
      cache.set(key, null)
      return null
    } finally {
      inflight.delete(key)
    }
  })()
  inflight.set(key, p)
  return p
}

/** Resolve one query against every sidecar retailer (in parallel; per-retailer
 *  failures just drop out). Returns the found offers cheapest-first. */
export async function fetchLivePrices(query: string): Promise<LivePrice[]> {
  const offers = await Promise.all(sidecarRetailers.map((r) => fetchLivePrice(query, r)))
  return cheapestFirst(offers.filter((o): o is LivePrice => o !== null))
}

/**
 * Resolve live prices for a set of queries (keyed by an id). Returns a map of
 * id -> offers (cheapest-first; only ids with at least one offer). Re-runs when
 * `enabled` flips or the query set changes. Fully cancellable-safe (state set
 * guarded by a mounted ref).
 */
export function useLivePrices(
  entries: Array<{ id: string; query: string }>,
  enabled: boolean,
): Record<string, LivePrice[]> {
  const [prices, setPrices] = useState<Record<string, LivePrice[]>>({})
  // Stable signature of the query set so the effect only re-runs on real change
  // (a caller may rebuild the array each render).
  const sig = entries.map((e) => `${e.id}=${e.query}`).join('|')

  useEffect(() => {
    if (!enabled) {
      setPrices({})
      return
    }
    let alive = true
    const queries = sig ? sig.split('|').map((s) => s.split('=')) : []
    ;(async () => {
      if (!(await pingPriceSidecar())) return
      for (const [id, query] of queries) {
        const offers = await fetchLivePrices(query)
        if (!alive) return
        if (offers.length > 0) setPrices((prev) => ({ ...prev, [id]: offers }))
      }
    })()
    return () => {
      alive = false
    }
  }, [sig, enabled])

  return prices
}
