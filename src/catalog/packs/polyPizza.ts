import type { FurnitureCategory } from '../../furniture/types'

/**
 * Poly Pizza API client.
 *
 * Poly Pizza (https://poly.pizza) hosts 10,000+ low-poly CC0 / CC-BY models
 * behind a free API. Unlike Kenney/ambientCG, its API + CDN are CORS-friendly,
 * so the browser can fetch directly — no dev proxy — which is why this pack is
 * surfaced in production builds too.
 *
 * Auth: a free per-user key passed in the `x-auth-token` header (verified
 * against the live API — `x-api-key` is NOT accepted). The key is supplied by
 * the user in the Packs UI, never bundled.
 *
 * Response field casing varies across API versions/docs, so `parseModels` is
 * deliberately tolerant (accepts `Title`/`Name`, `License`/`Licence`,
 * `Download`/`downloadUrl`, `Creator.Username`/`Author`, …).
 */

const API_BASE = 'https://api.poly.pizza/v1.1'

export interface PolyPizzaModel {
  id: string
  name: string
  author: string
  license: 'CC0' | 'CC-BY'
  /** Direct GLB download URL (CORS-enabled CDN). */
  downloadUrl: string
  thumbnailUrl: string
  /** Display + stored attribution string (CC-BY models require it). */
  attribution: string
  category: FurnitureCategory
}

/** Thrown by the client with a user-facing, actionable message. */
export class PolyPizzaError extends Error {}

interface RawModel {
  ID?: string
  id?: string
  Title?: string
  Name?: string
  name?: string
  Author?: string
  author?: string
  License?: string
  Licence?: string
  license?: string
  Thumbnail?: string
  thumbnail?: string
  Download?: string
  downloadUrl?: string
  Url?: string
  Attribution?: string
  Creator?: { Username?: string; username?: string }
}

interface SearchResponse {
  results?: RawModel[]
  total?: number
}

const pick = (...vals: (string | undefined)[]): string => vals.find((v) => v) ?? ''

/** Heuristic furniture category from a model's title. Poly Pizza has no
 *  furniture-specific taxonomy, so we infer from keywords; unknown → 'others'. */
export function guessCategory(name: string): FurnitureCategory {
  const n = name.toLowerCase()
  if (/\b(bed|mattress|crib|bunk)\b/.test(n)) return 'beds'
  if (/\b(sofa|couch|chair|stool|bench|armchair|seat|ottoman)\b/.test(n)) return 'seating'
  if (/\b(table|desk|nightstand|counter)\b/.test(n)) return 'tables'
  if (/\b(shelf|shelves|bookcase|cabinet|wardrobe|drawer|dresser|storage|closet)\b/.test(n))
    return 'storage'
  if (/\b(lamp|light|chandelier|sconce|lantern)\b/.test(n)) return 'lighting'
  if (/\b(fridge|refrigerator|oven|stove|microwave|washer|dishwasher|appliance)\b/.test(n))
    return 'appliances'
  if (/\b(sink|toilet|bath|shower|tub)\b/.test(n)) return 'bathroom'
  if (/\b(kitchen)\b/.test(n)) return 'kitchen'
  if (/\b(tv|television|monitor|computer|speaker|console)\b/.test(n)) return 'electronics'
  if (/\b(rug|carpet|curtain|cushion|pillow|blanket)\b/.test(n)) return 'textiles'
  if (/\b(plant|vase|painting|frame|clock|decor|mirror|sculpture)\b/.test(n)) return 'decor'
  return 'others'
}

function normalizeLicense(raw: string): 'CC0' | 'CC-BY' {
  return raw.toLowerCase().replace(/[\s-]/g, '').includes('cc0') ? 'CC0' : 'CC-BY'
}

/** Pure parser: API JSON → typed models. Skips entries with no GLB url. */
export function parseModels(json: SearchResponse): PolyPizzaModel[] {
  const out: PolyPizzaModel[] = []
  for (const raw of json.results ?? []) {
    const downloadUrl = pick(raw.Download, raw.downloadUrl, raw.Url)
    if (!downloadUrl) continue
    const id = pick(raw.ID, raw.id)
    if (!id) continue
    const name = pick(raw.Title, raw.Name, raw.name) || 'Untitled'
    const author = pick(raw.Creator?.Username, raw.Creator?.username, raw.Author, raw.author)
    const license = normalizeLicense(pick(raw.License, raw.Licence, raw.license))
    const attribution =
      pick(raw.Attribution) || `${name}${author ? ` by ${author}` : ''} (${license}) — Poly Pizza`
    out.push({
      id,
      name,
      author,
      license,
      downloadUrl,
      thumbnailUrl: pick(raw.Thumbnail, raw.thumbnail),
      attribution,
      category: guessCategory(name),
    })
  }
  return out
}

export interface SearchOpts {
  limit?: number
  signal?: AbortSignal
  fetchImpl?: typeof fetch
}

/** Maps an HTTP failure to an actionable message. */
async function httpError(res: Response): Promise<PolyPizzaError> {
  let detail = ''
  try {
    const body = (await res.json()) as { error?: string }
    detail = body.error ? ` (${body.error})` : ''
  } catch {
    /* non-JSON body */
  }
  if (res.status === 401 || res.status === 403)
    return new PolyPizzaError(
      `Poly Pizza rejected the API key${detail}. Get a free key at poly.pizza → account → API, then paste it above.`,
    )
  if (res.status === 429)
    return new PolyPizzaError(
      `Poly Pizza rate limit reached${detail}. Wait a moment and try again (max 100 requests/window).`,
    )
  return new PolyPizzaError(`Poly Pizza request failed: HTTP ${res.status}${detail}.`)
}

/** Search Poly Pizza for furniture models. Throws `PolyPizzaError` with a
 *  user-facing message on auth/rate-limit/network/CORS failure. */
export async function searchPolyPizza(
  apiKey: string,
  term: string,
  opts: SearchOpts = {},
): Promise<PolyPizzaModel[]> {
  const key = apiKey.trim()
  if (!key) throw new PolyPizzaError('Enter your Poly Pizza API key first.')
  const fetchImpl = opts.fetchImpl ?? fetch
  const limit = opts.limit ?? 24
  const url = `${API_BASE}/search/${encodeURIComponent(term.trim() || 'furniture')}?limit=${limit}`

  let res: Response
  try {
    res = await fetchImpl(url, {
      headers: { 'x-auth-token': key, Accept: 'application/json' },
      signal: opts.signal,
    })
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err
    // A network/CORS failure surfaces as a TypeError ("Failed to fetch").
    throw new PolyPizzaError(
      'Could not reach Poly Pizza (network or CORS error). Check your connection and try again.',
    )
  }
  if (!res.ok) throw await httpError(res)

  let json: SearchResponse
  try {
    json = (await res.json()) as SearchResponse
  } catch {
    throw new PolyPizzaError('Poly Pizza returned an unexpected (non-JSON) response.')
  }
  const models = parseModels(json)
  if (models.length === 0)
    throw new PolyPizzaError(`No downloadable models found for “${term}”. Try a different search.`)
  return models
}
