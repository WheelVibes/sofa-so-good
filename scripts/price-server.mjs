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
 *                                               retailer, image, source }
 *   GET /health                           ->  { ok: true }
 *
 * Results are cached to disk (.cache/prices.json) so repeat lookups are instant
 * and we stay gentle on the retailer. Local/dev only — never shipped or hosted;
 * the served data is not redistributed (a live link-out per item).
 *
 * The price parser is a pure function (parseSikResponse), exported + unit
 * tested. The network shape (IKEA's "SIK" search JSON API) can drift, so the
 * server fails soft: any error -> 502 with {error}, and the app falls back to
 * its bundled estimate.
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

const RETAILERS = {
  'ikea-sg': { label: 'IKEA SG', fetch: ikeaSg },
}

async function ikeaSg(query) {
  const r = await fetch(sikUrl(query), {
    headers: { 'user-agent': 'Mozilla/5.0', accept: 'application/json' },
  })
  if (!r.ok) throw new Error(`upstream ${r.status}`)
  return parseSikResponse(await r.json(), 'ikea-sg')
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
    return send(res, 200, { ...hit.value, source: 'cache' })
  }
  try {
    const value = await provider.fetch(q)
    if (!value) return send(res, 404, { error: 'no match', retailer })
    cache[key] = { ts: Date.now(), value }
    saveCacheSoon()
    return send(res, 200, { ...value, source: 'live' })
  } catch (e) {
    return send(res, 502, { error: String(e?.message || e), retailer })
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
