import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Local, dev-only price sidecar for the Shopping panel's "live prices" toggle.
 * Given a furniture name it queries a real Singapore retailer and returns the
 * top match's price + buy link, so the budget can show actual SGD pricing
 * instead of the bundled estimate.
 *
 *   GET /price?q=<name>&retailer=ikea-sg  ->  { price, currency, url, title,
 *                                               retailer, retailerLabel,
 *                                               image, source }
 *   GET /health                           ->  { ok: true, retailers: [...] }
 *
 * Retailers: IKEA SG (`ikea-sg`), Courts (`courts-sg`), HipVan (`hipvan-sg`),
 * Castlery (`castlery-sg`). Results are cached to disk (.cache/prices.json) so
 * repeat lookups are instant and we stay gentle on the retailers. Local/dev
 * only — never shipped or hosted; the served data is not redistributed (a live
 * link-out per item).
 *
 * Every price parser is a pure function (parse*Response), exported + unit
 * tested against inline fixtures. Any retailer's network shape can drift, so
 * the server fails soft: shape drift -> null -> 404 {error:'no match'}, network
 * error/timeout -> 502 with {error}, and the app falls back to its bundled
 * estimate either way.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(__dirname, '..')
const CACHE_DIR = path.join(REPO, '.cache')
const CACHE_FILE = path.join(CACHE_DIR, 'prices.json')
const PORT = Number(process.env.PRICE_PORT || 5175)
/** Cache TTL — prices don't move fast; a day keeps dev sessions cheap. */
const TTL_MS = 24 * 60 * 60 * 1000

/** Parse IKEA's SIK search-result JSON into our normalized price shape, or null
 *  if there's no usable first product. Pure — unit tested. */
export function parseSikResponse(json, retailer = 'ikea-sg') {
  const items = json?.searchResultPage?.products?.main?.items
  if (!Array.isArray(items)) return null
  for (const it of items) {
    const p = it?.product
    const sp = p?.salesPrice
    const numeral = typeof sp?.numeral === 'number' ? sp.numeral : Number(sp?.numeral)
    if (!p || !Number.isFinite(numeral)) continue
    const title = [p.name, p.typeName].filter(Boolean).join(' ').trim() || p.name || 'Item'
    return {
      price: numeral,
      currency: sp?.currencyCode || 'SGD',
      url: p.pipUrl || p.url || null,
      title,
      retailer,
      image: p.mainImageUrl || p.imageUrl || null,
    }
  }
  return null
}

/** Build the SIK search URL for a query (the params IKEA's API requires). */
export function sikUrl(query, market = 'sg') {
  const q = encodeURIComponent(query)
  return `https://sik.search.blue.cdtapps.com/${market}/en/search-result-page?q=${q}&size=5&types=PRODUCT&c=sr&v=20240110`
}

// ── fuzzy top-hit matching ───────────────────────────────────────────────────

/** Lowercased alphanumeric tokens of a product/query name. */
function tokens(s) {
  return String(s || '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
}

/** Fuzzy name-match score in [0,1]: fraction of query tokens found in the
 *  candidate name (prefix matches count half). Pure — unit tested. */
export function scoreNameMatch(query, name) {
  const q = tokens(query)
  if (q.length === 0) return 0
  const n = tokens(name)
  let hit = 0
  for (const t of q) {
    if (n.includes(t)) hit += 1
    else if (n.some((w) => w.startsWith(t) || t.startsWith(w))) hit += 0.5
  }
  return hit / q.length
}

/** Pick the best fuzzy match from `{title,...}` candidates — like IKEA's
 *  top-hit behaviour, but re-ranked by name similarity to the query. Falls back
 *  to the first candidate (trust the retailer's own ranking) when nothing
 *  scores, or null for an empty list. Pure — unit tested. */
export function pickBestMatch(query, candidates) {
  if (!Array.isArray(candidates) || candidates.length === 0) return null
  let best = null
  let bestScore = 0
  for (const c of candidates) {
    const score = scoreNameMatch(query, c.title)
    if (score > bestScore) {
      best = c
      bestScore = score
    }
  }
  return best ?? candidates[0]
}

// ── retailer adapters ────────────────────────────────────────────────────────
//
// Verified against the live sites 2026-07 (X-SHOP):
//  - Courts (`courts-sg`): Magento GraphQL `products` search — live, returns real
//    SGD prices + product links; parser unchanged.
//  - Castlery (`castlery-sg`): the search page dropped its JSON-LD Product blocks
//    (only a BreadcrumbList remains) and now renders results as a Next.js RSC
//    payload that embeds the Algolia response. The parser reads the embedded
//    `"hits":[…]` product records (with a JSON-LD fallback kept for resilience).
//  - HipVan (`hipvan-sg`): the old `www.hipvan.com/api/search/products` endpoint is
//    gone (404 SPA shell). Search now goes through an authenticated `api.communa.sg`
//    API-gateway route (`/hv_shop/api/v1/search/products`) that requires a session
//    token with refresh on top of the `x-api-key` — a plain browser-UA fetch cannot
//    retrieve results, so this adapter is a documented best-effort shape (see
//    TASKS.md X-SHOP) that degrades to 'no match' until/unless a public endpoint
//    returns. It stays dev-gated and fails soft like the others.
//
// Each parser is defensive: any drift from the expected shape returns null
// (-> 404 'no match') instead of throwing, and every fetch is timeboxed.

/** Upstream fetch timeout — a hung retailer must not hang the panel. */
const FETCH_TIMEOUT_MS = 8000

async function fetchWithTimeout(url, init = {}) {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(new Error('upstream timeout')), FETCH_TIMEOUT_MS)
  try {
    const r = await fetch(url, {
      headers: { 'user-agent': 'Mozilla/5.0', accept: '*/*', ...(init.headers || {}) },
      signal: ctrl.signal,
    })
    if (!r.ok) throw new Error(`upstream ${r.status}`)
    return r
  } finally {
    clearTimeout(t)
  }
}

/** Build the Courts (Magento GraphQL) product-search URL. */
export function courtsUrl(query) {
  const gql = `{products(search:${JSON.stringify(query)},pageSize:5){items{name url_key small_image{url}price_range{minimum_price{final_price{value currency}}}}}}`
  return `https://www.courts.com.sg/graphql?query=${encodeURIComponent(gql)}`
}

/** Parse a Courts (Magento GraphQL `products`) search response into our
 *  normalized shape via fuzzy top-hit matching, or null. Pure — unit tested. */
export function parseCourtsResponse(json, query, retailer = 'courts-sg') {
  const items = json?.data?.products?.items
  if (!Array.isArray(items)) return null
  const candidates = []
  for (const it of items) {
    const price = it?.price_range?.minimum_price?.final_price
    const value = typeof price?.value === 'number' ? price.value : Number(price?.value)
    if (!it?.name || !Number.isFinite(value)) continue
    candidates.push({
      price: value,
      currency: price?.currency || 'SGD',
      url: it.url_key ? `https://www.courts.com.sg/${it.url_key}.html` : null,
      title: it.name,
      retailer,
      image: it.small_image?.url || null,
    })
  }
  return pickBestMatch(query, candidates)
}

/** Build the HipVan (Algolia-style) search URL. */
export function hipvanUrl(query) {
  return `https://www.hipvan.com/api/search/products?q=${encodeURIComponent(query)}&per_page=5`
}

/** Parse a HipVan (Algolia-style `hits`) search response into our normalized
 *  shape via fuzzy top-hit matching, or null. Pure — unit tested. */
export function parseHipvanResponse(json, query, retailer = 'hipvan-sg') {
  const hits = json?.results?.[0]?.hits ?? json?.hits
  if (!Array.isArray(hits)) return null
  const candidates = []
  for (const h of hits) {
    const value = typeof h?.price === 'number' ? h.price : Number(h?.price)
    if (!h?.name || !Number.isFinite(value)) continue
    candidates.push({
      price: value,
      currency: h.currency || 'SGD',
      url: h.slug ? `https://www.hipvan.com/products/${h.slug}` : (h.url ?? null),
      title: h.name,
      retailer,
      image: h.image_url || null,
    })
  }
  return pickBestMatch(query, candidates)
}

/** Build the Castlery SG search-page URL (HTML; products embedded in the RSC
 *  payload as Algolia hits). */
export function castleryUrl(query) {
  return `https://www.castlery.com/sg/search?q=${encodeURIComponent(query)}`
}

/** Bracket-match a JSON array literal in `s` starting at `s[open] === '['` and
 *  return the array text (quote/escape aware), or null if unterminated. Pure. */
function matchJsonArray(s, open) {
  let depth = 0
  let inStr = false
  let esc = false
  for (let i = open; i < s.length; i++) {
    const c = s[i]
    if (inStr) {
      if (esc) esc = false
      else if (c === '\\') esc = true
      else if (c === '"') inStr = false
    } else if (c === '"') inStr = true
    else if (c === '[') depth++
    else if (c === ']') {
      depth--
      if (depth === 0) return s.slice(open, i + 1)
    }
  }
  return null
}

/** Extract Castlery product candidates from the Algolia `"hits":[…]` arrays the
 *  search page embeds in its Next.js RSC payload. Each hit's price/image live on
 *  its first variant. Pure. */
function castleryHitCandidates(html, retailer) {
  const candidates = []
  const marker = '"hits":['
  for (
    let idx = html.indexOf(marker);
    idx !== -1;
    idx = html.indexOf(marker, idx + marker.length)
  ) {
    const arr = matchJsonArray(html, idx + '"hits":'.length)
    if (!arr) continue
    let hits
    try {
      hits = JSON.parse(arr)
    } catch {
      continue // not a clean JSON array here — keep scanning
    }
    if (!Array.isArray(hits)) continue
    for (const h of hits) {
      if (!h?.name) continue
      const variant = Array.isArray(h.variants) ? h.variants[0] : undefined
      const value = Number(variant?.price ?? h.price)
      if (!Number.isFinite(value)) continue
      const image = variant?.images?.[0]?.large ?? (Array.isArray(h.image) ? h.image[0] : h.image)
      candidates.push({
        price: value,
        currency: 'SGD',
        url: h.slug ? `https://www.castlery.com/sg/products/${h.slug}` : null,
        title: h.name,
        retailer,
        image: image || null,
      })
    }
  }
  return candidates
}

/** Extract Castlery product candidates from `application/ld+json` Product blocks
 *  (direct, in an ItemList, or in a @graph). Kept as a fallback in case the site
 *  restores JSON-LD product markup. Pure. */
function castleryJsonLdCandidates(html, retailer) {
  const candidates = []
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  for (const m of html.matchAll(re)) {
    let data
    try {
      data = JSON.parse(m[1])
    } catch {
      continue // malformed block — skip, keep scanning
    }
    const nodes = []
    for (const root of Array.isArray(data) ? data : [data]) {
      if (!root || typeof root !== 'object') continue
      if (root['@type'] === 'Product') nodes.push(root)
      for (const el of root.itemListElement ?? []) {
        const item = el?.item ?? el
        if (item?.['@type'] === 'Product') nodes.push(item)
      }
      for (const g of root['@graph'] ?? []) {
        if (g?.['@type'] === 'Product') nodes.push(g)
      }
    }
    for (const p of nodes) {
      const offer = Array.isArray(p.offers) ? p.offers[0] : p.offers
      const value = Number(offer?.price)
      if (!p?.name || !Number.isFinite(value)) continue
      candidates.push({
        price: value,
        currency: offer?.priceCurrency || 'SGD',
        url: p.url || offer?.url || null,
        title: p.name,
        retailer,
        image: (Array.isArray(p.image) ? p.image[0] : p.image) || null,
      })
    }
  }
  return candidates
}

/** Parse a Castlery search page into our normalized shape via fuzzy top-hit
 *  matching. Prefers the embedded Algolia `hits` (the live shape), falling back
 *  to JSON-LD Product blocks. HTML drift -> null. Pure — unit tested. */
export function parseCastleryResponse(html, query, retailer = 'castlery-sg') {
  if (typeof html !== 'string') return null
  const candidates = castleryHitCandidates(html, retailer)
  if (candidates.length === 0) candidates.push(...castleryJsonLdCandidates(html, retailer))
  return candidates.length ? pickBestMatch(query, candidates) : null
}

const RETAILERS = {
  'ikea-sg': { label: 'IKEA SG', fetch: ikeaSg },
  'courts-sg': { label: 'Courts', fetch: courtsSg },
  'hipvan-sg': { label: 'HipVan', fetch: hipvanSg },
  'castlery-sg': { label: 'Castlery', fetch: castlerySg },
}

async function ikeaSg(query) {
  const r = await fetchWithTimeout(sikUrl(query), { headers: { accept: 'application/json' } })
  return parseSikResponse(await r.json(), 'ikea-sg')
}

async function courtsSg(query) {
  const r = await fetchWithTimeout(courtsUrl(query), { headers: { accept: 'application/json' } })
  return parseCourtsResponse(await r.json(), query)
}

async function hipvanSg(query) {
  const r = await fetchWithTimeout(hipvanUrl(query), { headers: { accept: 'application/json' } })
  return parseHipvanResponse(await r.json(), query)
}

async function castlerySg(query) {
  const r = await fetchWithTimeout(castleryUrl(query), { headers: { accept: 'text/html' } })
  return parseCastleryResponse(await r.text(), query)
}

// ── disk cache ───────────────────────────────────────────────────────────────
let cache = {}
try {
  cache = JSON.parse(readFileSync(CACHE_FILE, 'utf8'))
} catch {
  cache = {}
}
let cacheDirty = false
function saveCacheSoon() {
  if (cacheDirty) return
  cacheDirty = true
  setTimeout(() => {
    try {
      mkdirSync(CACHE_DIR, { recursive: true })
      writeFileSync(CACHE_FILE, JSON.stringify(cache))
    } catch {}
    cacheDirty = false
  }, 500)
}

function send(res, status, body) {
  res.writeHead(status, {
    'content-type': 'application/json',
    // Browser (Vite dev origin) calls this directly.
    'access-control-allow-origin': '*',
  })
  res.end(JSON.stringify(body))
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`)
  if (url.pathname === '/health')
    return send(res, 200, { ok: true, retailers: Object.keys(RETAILERS) })
  if (url.pathname !== '/price') return send(res, 404, { error: 'not found' })

  const q = (url.searchParams.get('q') || '').trim()
  const retailer = url.searchParams.get('retailer') || 'ikea-sg'
  if (!q) return send(res, 400, { error: 'missing q' })
  const provider = RETAILERS[retailer]
  if (!provider) return send(res, 400, { error: `unknown retailer ${retailer}` })

  const key = `${retailer}:${q.toLowerCase()}`
  const hit = cache[key]
  if (hit && Date.now() - hit.ts < TTL_MS) {
    return send(res, 200, { ...hit.value, retailerLabel: provider.label, source: 'cache' })
  }
  try {
    const value = await provider.fetch(q)
    if (!value) return send(res, 404, { error: 'no match', retailer })
    cache[key] = { ts: Date.now(), value }
    saveCacheSoon()
    return send(res, 200, { ...value, retailerLabel: provider.label, source: 'live' })
  } catch (e) {
    // Log the detail server-side; return a generic message so an internal error
    // (exception/stack text) is never exposed to the caller (CodeQL js/stack-trace-exposure).
    console.error('[price-server] lookup failed:', e)
    return send(res, 502, { error: 'price lookup failed', retailer })
  }
})

// Only listen when run as a server (not when imported by a unit test).
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  server.listen(PORT, () => {
    console.log(
      `price-server: http://localhost:${PORT}  retailers: ${Object.keys(RETAILERS).join(', ')}`,
    )
  })
}
