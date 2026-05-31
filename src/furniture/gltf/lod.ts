import type { QualityTier } from '../../scene/quality'

/** Per-tier asset budgets — single source of truth for the runtime fallback
 *  and the offline `optimize_glb_lod.mjs` script. */
export const TIER_BUDGETS: Record<
  Exclude<QualityTier, 'high'>,
  { maxTexture: number; triangleRatio: number }
> = {
  low: { maxTexture: 512, triangleRatio: 0.5 },
  medium: { maxTexture: 1024, triangleRatio: 0.75 },
}

/** Filename suffix for a tier's variant. High uses the original (no suffix). */
export function lodSuffix(tier: QualityTier): string {
  return tier === 'high' ? '' : `-${tier}`
}

/** Rewrites a `.glb` URL to its tier variant, preserving any query string. */
export function lodUrl(url: string, tier: QualityTier): string {
  const suffix = lodSuffix(tier)
  if (!suffix) return url
  const [path, query] = splitQuery(url)
  if (!path.endsWith('.glb')) return url
  return `${path.slice(0, -'.glb'.length)}${suffix}.glb${query}`
}

/** Strips a known tier suffix, returning the original base URL. */
export function baseUrl(url: string): string {
  const [path, query] = splitQuery(url)
  for (const tier of Object.keys(TIER_BUDGETS) as Array<keyof typeof TIER_BUDGETS>) {
    const tag = `-${tier}.glb`
    if (path.endsWith(tag)) return `${path.slice(0, -tag.length)}.glb${query}`
  }
  return url
}

function splitQuery(url: string): [string, string] {
  const i = url.indexOf('?')
  return i === -1 ? [url, ''] : [url.slice(0, i), url.slice(i)]
}

/** Probe result per resolved variant URL: true=exists, false=missing. */
const probeCache = new Map<string, boolean>()
/** In-flight probes, so concurrent callers share one request. */
const inflight = new Map<string, Promise<boolean>>()

/** Synchronous resolution for render. Returns the variant URL only when a prior
 *  prewarm confirmed it exists; otherwise the base URL (never a 404). */
export function resolveLodUrlSync(url: string, tier: QualityTier): string {
  if (tier === 'high') return url
  const variant = lodUrl(url, tier)
  if (variant === url) return url
  return probeCache.get(variant) === true ? variant : url
}

/** Eagerly HEAD-probe a tier variant and cache the result. Idempotent. */
export async function prewarmLod(url: string, tier: QualityTier): Promise<void> {
  if (tier === 'high') return
  const variant = lodUrl(url, tier)
  if (variant === url || probeCache.has(variant)) return
  let p = inflight.get(variant)
  if (!p) {
    p = fetch(variant, { method: 'HEAD' })
      .then((r) => r.ok)
      .catch(() => false)
    inflight.set(variant, p)
  }
  const ok = await p
  probeCache.set(variant, ok)
  inflight.delete(variant)
}

/** Test-only: clear caches between cases. */
export function __resetLodCacheForTest(): void {
  probeCache.clear()
  inflight.clear()
}
