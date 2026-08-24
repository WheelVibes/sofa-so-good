/**
 * ambientCG material library served from our own R2 bucket (`acg/` prefix),
 * through the auth-gated same-origin proxy (`/api/assets/...`).
 *
 * This is the ONLY transport for the `ambientcg` provider (the live
 * ambientcg.com API transport was removed 2026-08-25 — see `./index.ts`).
 * Mirroring the corpus into R2 makes it same-origin, so it works in dev and in
 * a production build with no third-party CORS dependency and no proxy to
 * operate.
 *
 * Shape notes:
 *  - The manifest lives at `library/acg-index.json`, NOT `acg/index.json`:
 *    `server/assets.ts` exempts only the `library/` prefix from the year-long
 *    immutable cache, and a manifest is replaced in place on every re-publish.
 *  - Assets are pre-packed to the maps the runtime actually binds
 *    (`scripts/pack-ambientcg.mjs`), so there is no zip to unpack client-side
 *    and no wasted download of maps with no slot in `TexturedMaterialDef`.
 *  - Entries keep the `ambientcg` provider id, so finish ids stay
 *    `ambientcg:<AssetId>:<res>` — already parsed by `parseRemoteFinishId`,
 *    so designs saved against the old live transport keep resolving.
 */

import { API_BASE, hasBackend } from '../../../features/api/client'
import type { MaterialCategory } from '../../../materials/types'
import type { AssetBundle, RemoteEntry, RemoteProvider, Resolution } from '../types'

/** Manifest key — under `library/` so the proxy serves it `no-store`. */
const INDEX_PATH = '/assets/library/acg-index.json'
/** Object prefix for the packed material folders. */
const ASSET_PREFIX = '/assets/acg'

/** The only resolution the packed corpus ships (ambientCG `_1K-JPG` zips). */
const ACG_RESOLUTION: Resolution = '1k'

export interface AcgManifestItem {
  id: string
  name: string
  family: string
  category: MaterialCategory
  /** False for exterior-only families (paving, cladding) — the picker can
   *  default to hiding these in an interior tool without a re-upload. */
  interior: boolean
  swatch: string
  uvScale: [number, number]
  /** Emitted map files, keyed by channel. `albedo` is always present. */
  files: {
    albedo: string
    normal?: string
    rough?: string
    ao?: string
    metal?: string
    opacity?: string
    height?: string
  }
  bytes: number
}

export interface AcgManifest {
  version: number
  provider: 'ambientcg'
  license: string
  attribution: string
  count: number
  items: AcgManifestItem[]
}

const assetUrl = (id: string, file: string) => `${API_BASE}${ASSET_PREFIX}/${id}/${file}`

/** Manifest item → the `RemoteEntry` the catalog UI renders as a card. */
export function entryForItem(item: AcgManifestItem): RemoteEntry {
  return {
    provider: 'ambientcg',
    slug: item.id,
    kind: 'material',
    name: item.name,
    category: item.category,
    thumbUrl: assetUrl(item.id, 'thumb.webp'),
    resolutions: [ACG_RESOLUTION],
    attribution: 'ambientCG (CC0)',
    sourceUrl: `https://ambientcg.com/view?id=${item.id}`,
    tags: [item.family, item.interior ? 'interior' : 'exterior'],
    bytesEstimate: { [ACG_RESOLUTION]: item.bytes },
  }
}

/**
 * Validate + normalise a parsed manifest. An item with no albedo is dropped
 * rather than surfaced: `bundleToMaterialDef` throws on a missing albedo, so a
 * card for one would be a guaranteed error toast on tap.
 */
export function normaliseManifest(raw: unknown): AcgManifest | null {
  const m = raw as AcgManifest | null
  if (!m || !Array.isArray(m.items)) return null
  return { ...m, items: m.items.filter((it) => it?.id && it.files?.albedo) }
}

let cachedIndex: RemoteEntry[] | null = null
/** Manifest items by slug, so `fetchAsset` knows which maps an asset has. */
const itemsBySlug = new Map<string, AcgManifestItem>()

async function fetchIndex(signal?: AbortSignal): Promise<RemoteEntry[]> {
  if (!hasBackend()) return []
  if (cachedIndex) return cachedIndex
  const res = await libraryFetch(`${API_BASE}${INDEX_PATH}`, signal)
  // 401 is not an outage: the library is served from our own bucket (a local
  // `resources/` mirror in dev) behind the session gate, so say so — a "check
  // your connection" message sends people hunting for a network problem that
  // does not exist.
  if (res.status === 401) throw new Error('Sign in to load the ambientCG library')
  if (!res.ok) throw new Error(`ambientCG library ${res.status}`)
  const manifest = normaliseManifest(await res.json())
  if (!manifest) throw new Error('ambientCG library: malformed manifest')
  itemsBySlug.clear()
  for (const it of manifest.items) itemsBySlug.set(it.id, it)
  cachedIndex = manifest.items.map(entryForItem)
  return cachedIndex
}

/**
 * Fetch a library URL with the session cookie attached. Credentials are only
 * ever sent to our OWN proxy: a credentialed cross-origin request is rejected
 * outright by any server answering `Access-Control-Allow-Origin: *` (the spec
 * forbids the wildcard once credentials are in play), which is exactly how a
 * stale index full of third-party URLs turned every card into a permanent
 * loading skeleton.
 */
function libraryFetch(url: string, signal?: AbortSignal): Promise<Response> {
  const ours = url.startsWith(`${API_BASE}/`) || url.startsWith('/')
  return fetch(url, ours ? { credentials: 'include', signal } : { signal })
}

/**
 * Thumbnail URL is derived from the slug, NOT read off `entry.thumbUrl`: an
 * entry can come from a cached index written by an older build, and the packed
 * chip always lives at the same key. Same reason `fetchAsset` builds map URLs
 * from the manifest rather than the entry.
 */
async function fetchThumbnail(entry: RemoteEntry, signal?: AbortSignal): Promise<Blob> {
  const r = await libraryFetch(assetUrl(entry.slug, 'thumb.webp'), signal)
  if (!r.ok) throw new Error(`ambientCG thumb ${r.status}`)
  return r.blob()
}

/**
 * Is a cached index still the shape this transport serves? A stale entry from
 * the removed live-API transport points at `ambientcg.com` / its CDN and
 * advertises 2k/4k the packed corpus does not have, so it must be refetched
 * rather than rendered (`bootstrapRemoteCatalog` keeps an index for 7 days,
 * which is long enough for a transport change to strand one).
 */
function validateCached(entries: RemoteEntry[]): boolean {
  return entries.every((e) => e.thumbUrl.startsWith(`${API_BASE}${ASSET_PREFIX}/`))
}

/** Manifest file key → the `AssetBundle` channel name `bundleToMaterialDef`
 *  reads. Only `albedo` is guaranteed; the rest are per-scan. */
const CHANNEL_FILES: [keyof AcgManifestItem['files'], string][] = [
  ['albedo', 'albedo'],
  ['normal', 'normal'],
  ['rough', 'roughness'],
  ['ao', 'ao'],
  ['metal', 'metalness'],
  ['opacity', 'opacity'],
  ['height', 'displacement'],
]

async function fetchAsset(
  entry: RemoteEntry,
  _resolution: Resolution,
  signal?: AbortSignal,
): Promise<AssetBundle> {
  if (!hasBackend()) throw new Error('ambientCG library needs a backend')
  // The index may not have been fetched in this session (a persisted finish
  // re-resolves straight to `fetchAsset`), so pull it in before reading maps.
  if (!itemsBySlug.has(entry.slug)) await fetchIndex(signal)
  const files = itemsBySlug.get(entry.slug)?.files
  const channels: Record<string, Blob> = {}
  for (const [key, channel] of CHANNEL_FILES) {
    const file = files?.[key]
    if (!file) continue
    const res = await libraryFetch(assetUrl(entry.slug, file), signal)
    // Only albedo is fatal — a scan legitimately ships without roughness or AO
    // (`Concrete001` and `WoodSiding011` have no roughness map at all).
    if (!res.ok) {
      if (channel === 'albedo') throw new Error(`ambientCG ${entry.slug} albedo ${res.status}`)
      continue
    }
    channels[channel] = await res.blob()
  }
  if (!channels.albedo) throw new Error(`No color channel for ${entry.slug}`)
  return { kind: 'material', channels }
}

/** Test seam — drops the in-memory manifest cache. */
export function __resetAcgLibraryCache(): void {
  cachedIndex = null
  itemsBySlug.clear()
}

export const acgLibrary: RemoteProvider = {
  id: 'ambientcg',
  fetchIndex,
  fetchThumbnail,
  fetchAsset,
  validateCached,
}
