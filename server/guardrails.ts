/**
 * Cost-safety guardrails. The only binding that can incur a charge is R2, so the
 * asset route checks a kill-switch flag (set by the usage-monitor cron worker or
 * an admin) before ever reading R2. Everything else self-caps at $0 by erroring.
 *
 * Kill-switch keys live in the FLAGS KV:
 *   - `killswitch:r2`   -> '1' disables all R2 reads (cache-only, 503 on miss)
 *   - `killswitch:all`  -> '1' disables the whole API (returns 503)
 * A best-effort per-isolate rate limiter adds defence-in-depth without spending
 * KV/D1 write budget (those would themselves hit the daily caps).
 */
import type { Env } from './env'

export const KILL_R2 = 'killswitch:r2'
export const KILL_ALL = 'killswitch:all'

// Memoise kill-switch reads per isolate for a short window so a hot path doesn't
// issue a KV read on every request.
const flagCache = new Map<string, { value: boolean; expires: number }>()
const FLAG_TTL_MS = 30_000

export async function isTripped(env: Env, key: string): Promise<boolean> {
  const now = Date.now()
  const cached = flagCache.get(key)
  if (cached && cached.expires > now) return cached.value
  let value = false
  try {
    value = (await env.FLAGS.get(key)) === '1'
  } catch {
    value = false
  }
  flagCache.set(key, { value, expires: now + FLAG_TTL_MS })
  return value
}

// --- Best-effort per-isolate rate limiter (sliding window) -------------------
const hits = new Map<string, number[]>()

/** Returns true if the caller is within budget; false if it should be throttled. */
export function rateLimit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now()
  const arr = (hits.get(key) ?? []).filter((t) => now - t < windowMs)
  if (arr.length >= max) {
    hits.set(key, arr)
    return false
  }
  arr.push(now)
  hits.set(key, arr)
  // Opportunistic cleanup so the map can't grow unbounded in a long-lived isolate.
  if (hits.size > 5000) hits.clear()
  return true
}

export function clientIp(req: Request): string {
  return req.headers.get('CF-Connecting-IP') ?? 'unknown'
}
