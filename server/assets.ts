/**
 * Auth-gated R2 asset library proxy with a Cache API front. Flow per request:
 *   1. Serve from `caches.default` if present (no R2 read, no cost).
 *   2. If the R2 kill-switch is tripped -> 503 (cache-only, zero new R2 reads).
 *   3. Otherwise read from R2, cache with a long immutable TTL, and return.
 *
 * The bucket is private (Worker-only). Immutable caching means repeat loads are
 * served by the browser / service worker / edge cache and rarely reach R2.
 */
import type { Env } from './env'
import { isTripped, KILL_R2 } from './guardrails'

const IMMUTABLE = 'public, max-age=31536000, immutable'

const CONTENT_TYPES: Record<string, string> = {
  glb: 'model/gltf-binary',
  gltf: 'model/gltf+json',
  bin: 'application/octet-stream',
  json: 'application/json',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  ktx2: 'image/ktx2',
  hdr: 'image/vnd.radiance',
}

function contentType(key: string): string {
  const ext = key.split('.').pop()?.toLowerCase() ?? ''
  return CONTENT_TYPES[ext] ?? 'application/octet-stream'
}

/**
 * Serve an object from the R2 library. `key` is the object key inside the
 * bucket (e.g. `ikea/alex-desk-100x48/white.glb`). Caller must have already
 * verified the session.
 */
export async function serveAsset(env: Env, req: Request, key: string): Promise<Response> {
  const cache = caches.default
  const cacheKey = new Request(new URL(req.url).toString(), { method: 'GET' })

  const cached = await cache.match(cacheKey)
  if (cached) return cached

  // Cold miss: if the R2 kill-switch is tripped, refuse to read R2.
  if (await isTripped(env, KILL_R2)) {
    return new Response('Asset temporarily unavailable (usage guardrail).', {
      status: 503,
      headers: { 'Retry-After': '3600' },
    })
  }

  const object = await env.LIBRARY.get(key)
  if (!object) return new Response('Not found', { status: 404 })

  const headers = new Headers()
  object.writeHttpMetadata(headers)
  headers.set('Content-Type', object.httpMetadata?.contentType ?? contentType(key))
  headers.set('Cache-Control', IMMUTABLE)
  headers.set('ETag', object.httpEtag)

  const res = new Response(object.body, { headers })
  // Store a clone in the edge cache for subsequent requests (best-effort).
  await cache.put(cacheKey, res.clone())
  return res
}
