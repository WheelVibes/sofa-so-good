import type { QualityTier } from '../../scene/quality'

/** Per-tier asset budgets — single source of truth for the runtime fallback,
 *  the offline `optimize_glb_lod.mjs` script, and the in-browser upload LOD
 *  generator (`optimize/lodVariants.ts`). */
export const TIER_BUDGETS: Record<
  Exclude<QualityTier, 'high'>,
  { maxTexture: number; triangleRatio: number }
> = {
  low: { maxTexture: 512, triangleRatio: 0.5 },
  medium: { maxTexture: 1024, triangleRatio: 0.75 },
}

/** The non-original LOD tiers (the ones with generated variants). */
export type LodTier = Exclude<QualityTier, 'high'>
export const LOD_TIERS: readonly LodTier[] = ['low', 'medium']

/** IDB asset-store key of the `tier` LOD sibling of `assetId`. Uploaded models
 *  store their generated `-low`/`-medium` variants under these derived keys —
 *  the same content-addressing convention as the offline `foo-low.glb`
 *  filename siblings, but in IndexedDB key space. Deterministic, so hydration
 *  and cleanup can find a base asset's tiers without an index. */
export function lodAssetId(assetId: string, tier: LodTier): string {
  return `${assetId}:lod-${tier}`
}

/** Inverse of {@link lodAssetId}: `{ baseAssetId, tier }` for a derived LOD
 *  key, or null for a regular asset id. */
export function parseLodAssetId(id: string): { baseAssetId: string; tier: LodTier } | null {
  for (const tier of LOD_TIERS) {
    const suffix = `:lod-${tier}`
    if (id.endsWith(suffix)) return { baseAssetId: id.slice(0, -suffix.length), tier }
  }
  return null
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

/** Strips a known tier suffix, returning the original base URL. Registered
 *  variant URLs (uploaded models — blob URLs carry no suffix) resolve through
 *  the registry's reverse map. */
export function baseUrl(url: string): string {
  const registeredBase = variantBases.get(url)
  if (registeredBase) return registeredBase
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

/** Registered tier variants for URLs that can't be derived by suffix —
 *  uploaded models, whose tiers live in IDB and surface as blob: URLs.
 *  Key `${base}\n${tier}` → variant URL, plus a reverse map for baseUrl(). */
const variantUrls = new Map<string, string>()
const variantBases = new Map<string, string>()
const variantKey = (base: string, tier: LodTier): string => `${base}\n${tier}`

/** Register the runtime URLs of an uploaded model's generated LOD variants so
 *  the same tier selection that picks `-low.glb` siblings for builtin GLBs
 *  routes uploads to their IDB-backed blob variants. Called at persist time
 *  and again on boot hydration (blob URLs are session-scoped). */
export function registerLodVariants(base: string, urls: Partial<Record<LodTier, string>>): void {
  for (const tier of LOD_TIERS) {
    const u = urls[tier]
    if (!u) continue
    variantUrls.set(variantKey(base, tier), u)
    variantBases.set(u, base)
  }
}

/** All URLs an asset can be loaded under, for a given base URL: the base
 *  itself, its suffix-derived `-low`/`-medium` siblings (builtin/HTTP GLBs),
 *  and any registered blob variants (uploaded models). Pure read — does NOT
 *  mutate the registry, so it is safe to call before `unregisterLodVariants`.
 *  Used to evict every drei `useGLTF` cache entry an asset may occupy. */
export function lodUrlsForBase(base: string): string[] {
  const urls = new Set<string>([base])
  for (const tier of LOD_TIERS) {
    const derived = lodUrl(base, tier)
    if (derived !== base) urls.add(derived)
    const registered = variantUrls.get(variantKey(base, tier))
    if (registered) urls.add(registered)
  }
  return [...urls]
}

/** Remove a base URL's registered variants (e.g. the def was deleted),
 *  returning the variant URLs so the caller can revoke the blob URLs. */
export function unregisterLodVariants(base: string): string[] {
  const removed: string[] = []
  for (const tier of LOD_TIERS) {
    const key = variantKey(base, tier)
    const u = variantUrls.get(key)
    if (!u) continue
    variantUrls.delete(key)
    variantBases.delete(u)
    removed.push(u)
  }
  return removed
}

/** Synchronous resolution for render. Registered variants (uploads) win;
 *  otherwise returns the suffix-derived variant URL only when a prior prewarm
 *  confirmed it exists; else the base URL (never a 404). */
export function resolveLodUrlSync(url: string, tier: QualityTier): string {
  if (tier === 'high') return url
  const registered = variantUrls.get(variantKey(url, tier))
  if (registered) return registered
  const variant = lodUrl(url, tier)
  if (variant === url) return url
  return probeCache.get(variant) === true ? variant : url
}

/** Eagerly HEAD-probe a tier variant and cache the result. Idempotent; no-op
 *  for registered (upload) variants — those are known to exist. */
export async function prewarmLod(url: string, tier: QualityTier): Promise<void> {
  if (tier === 'high') return
  if (variantUrls.has(variantKey(url, tier))) return
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
  variantUrls.clear()
  variantBases.clear()
}
