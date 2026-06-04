import { useEffect, useState } from 'react'

/**
 * Client for the local price sidecar (`npm run price-server`). Dev-only: it
 * resolves a furniture name to a real Singapore retailer price + buy link for
 * the Shopping panel's "live prices" toggle. Everything degrades gracefully —
 * if the sidecar isn't running or a lookup fails, callers fall back to the
 * bundled estimate.
 */

export interface LivePrice {
  price: number
  currency: string
  url: string | null
  title: string
  retailer: string
  image: string | null
  source: 'live' | 'cache'
}

const PORT = 5175
const BASE = `http://localhost:${PORT}`

/** Module cache (query -> resolved/failed) so the panel doesn't re-fetch a name
 *  every render. Promise dedupes concurrent lookups of the same query. */
const cache = new Map<string, LivePrice | null>()
const inflight = new Map<string, Promise<LivePrice | null>>()

let sidecarUp: boolean | null = null

export function resetLivePriceCache(): void {
  cache.clear()
  inflight.clear()
  sidecarUp = null
}

/** Is the sidecar reachable? Cached after the first probe. */
export async function pingPriceSidecar(): Promise<boolean> {
  if (sidecarUp !== null) return sidecarUp
  try {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 1500)
    const r = await fetch(`${BASE}/health`, { signal: ctrl.signal })
    clearTimeout(t)
    sidecarUp = r.ok
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

/**
 * Resolve live prices for a set of queries (keyed by an id). Returns a map of
 * id -> LivePrice (only the resolved ones). Re-runs when `enabled` flips or the
 * query set changes. Fully cancellable-safe (state set guarded by a mounted ref).
 */
export function useLivePrices(
  entries: Array<{ id: string; query: string }>,
  enabled: boolean,
): Record<string, LivePrice> {
  const [prices, setPrices] = useState<Record<string, LivePrice>>({})
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
        const v = await fetchLivePrice(query)
        if (!alive) return
        if (v) setPrices((prev) => (prev[id] === v ? prev : { ...prev, [id]: v }))
      }
    })()
    return () => {
      alive = false
    }
  }, [sig, enabled])

  return prices
}
