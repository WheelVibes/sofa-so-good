const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org'
const USER_AGENT = 'sofa-so-good/0.0.0 (https://github.com/cwlroda/sofa-so-good)'

export interface Place {
  label: string
  lat: number
  lon: number
}

interface NominatimSearchResult {
  display_name: string
  lat: string
  lon: string
}

interface NominatimReverseResult {
  display_name?: string
  error?: string
}

/** Search for a place by free-text query. Returns up to 5 results.
 *  Empty / very short queries (<2 chars) return [] without hitting the
 *  network. Throws on non-ok HTTP responses (caller renders an error). */
export async function searchPlaces(query: string): Promise<Place[]> {
  const q = query.trim()
  if (q.length < 2) return []
  const url = new URL(`${NOMINATIM_BASE}/search`)
  url.searchParams.set('format', 'json')
  url.searchParams.set('q', q)
  url.searchParams.set('limit', '5')
  const res = await fetch(url.toString(), {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
  })
  if (!res.ok) {
    throw new Error(`Nominatim search failed: ${res.status} ${res.statusText ?? ''}`.trim())
  }
  const data = (await res.json()) as NominatimSearchResult[]
  return data.map((r) => ({
    label: r.display_name,
    lat: Number.parseFloat(r.lat),
    lon: Number.parseFloat(r.lon),
  }))
}

/** Reverse-geocode a coordinate. Returns the display_name or null when
 *  Nominatim has no result or the request fails. Never throws — callers
 *  treat null as "no label available". */
export async function reverseGeocode(lat: number, lon: number): Promise<string | null> {
  const url = new URL(`${NOMINATIM_BASE}/reverse`)
  url.searchParams.set('format', 'json')
  url.searchParams.set('lat', String(lat))
  url.searchParams.set('lon', String(lon))
  url.searchParams.set('zoom', '10')
  try {
    const res = await fetch(url.toString(), {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
    })
    if (!res.ok) return null
    const data = (await res.json()) as NominatimReverseResult
    return data.display_name ?? null
  } catch {
    return null
  }
}
