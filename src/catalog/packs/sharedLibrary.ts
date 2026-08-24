/**
 * Production shared-library pack. Fetches the manifest + models from the
 * auth-gated R2 proxy (`/api/assets`, cookies included) and registers a chosen
 * product group into the catalog via the same `importGroup` path as the dev
 * IKEA scrape — so a signed-in user browses the cloud library in prod, gated by
 * the `sharedLibrary` feature flag. No backend => this module is inert.
 */
import { API_BASE, hasBackend } from '../../features/api/client'
import { importGroup } from '../../furniture/ikea/importGroup'
import { parseMetadata } from '../../furniture/ikea/metadata'

export interface SharedLibraryItem {
  group: string
  groupKey: string
  name: string
  type: string
  category: string
  size: string
  series: string
  variants: number
  thumbnail: string | null
  price: number | null
  currency: string | null
}

export interface SharedLibraryIndex {
  version: number
  generatedAt: string
  count: number
  items: SharedLibraryItem[]
}

function assetsBase(): string {
  return `${API_BASE}/assets`
}

export async function fetchSharedLibraryIndex(): Promise<SharedLibraryIndex | null> {
  if (!hasBackend()) return null
  try {
    const url = `${assetsBase()}/library/index.json`
    const res = await fetch(url, { credentials: 'include' })
    if (!res.ok) {
      console.warn(`[sharedLibrary] ${url} returned ${res.status} — no library manifest here.`)
      return null
    }
    // `res.ok` alone is not proof of a manifest: a dev server's SPA fallback
    // answers a missing file with **200 text/html** (index.html), so the JSON
    // parse below throws and the whole feature lands in a bare `error` state with
    // nothing in the console to explain it (Chrome audit 2026-08 — the shared
    // library read as broken while signed in, and the cause took a manual fetch
    // to find). Name the problem instead of failing mute.
    // Only reject a content-type that is PRESENT and clearly not JSON. An absent
    // header is ambiguous (and plenty of fixtures/servers omit it), so trust the
    // parse in that case rather than refusing a valid manifest.
    const type = res.headers?.get('content-type') ?? ''
    if (type && !type.includes('json')) {
      console.warn(
        `[sharedLibrary] ${url} returned ${res.status} ${type || 'no content-type'}, not JSON — ` +
          'the library manifest is probably not published for this environment ' +
          '(run `npm run build-library-index`).',
      )
      return null
    }
    const index = (await res.json()) as SharedLibraryIndex
    if (!Array.isArray(index.items)) return null
    // Back-compat: manifests built before `groupKey` was emitted lack it, and a
    // missing key would collapse every card to one `ikea-undefined` id in the
    // grid dedup. The `group` folder slug is the stable fallback identity.
    index.items = index.items
      .filter((it) => typeof it?.group === 'string' && it.group)
      .map((it) => (it.groupKey ? it : { ...it, groupKey: it.group }))
    return index
  } catch (err) {
    // Every failure mode used to collapse to a bare `status: 'error'` with
    // nothing logged — a thrown fetch (wrong origin / CORS / server down), a
    // non-2xx, or HTML from an SPA fallback all looked identical, and tracing
    // which one it was took a series of manual fetches (Chrome audit 2026-08).
    console.warn(
      `[sharedLibrary] could not load the library manifest from ${assetsBase()}/library/index.json:`,
      err,
    )
    return null
  }
}

/** Fetch a group's metadata + GLBs + images through the proxy and register it. */
export async function registerSharedGroup(group: string): Promise<boolean> {
  if (!hasBackend()) return false
  const baseUrl = `${assetsBase()}/ikea/${group}`
  const metaRes = await fetch(`${baseUrl}/metadata.json`, { credentials: 'include' })
  if (!metaRes.ok) return false
  const parsed = parseMetadata(await metaRes.json())
  if (!parsed.ok) return false
  const meta = parsed.data

  const files: File[] = []
  for (const v of meta.variants) {
    if (v.glb) {
      const glbRes = await fetch(`${baseUrl}/${v.glb}`, { credentials: 'include' })
      if (glbRes.ok) {
        const blob = await glbRes.blob()
        files.push(new File([blob], v.glb, { type: 'model/gltf-binary' }))
      }
    }
    // Only the main image is consumed (buildVariant downscales it into the card
    // thumbnail); the context/lifestyle image is never read, and many groups
    // list one that was never uploaded — so fetching it just 404s. Skip it.
    if (v.main_image) {
      const imgRes = await fetch(`${baseUrl}/${v.main_image}`, { credentials: 'include' })
      if (imgRes.ok) {
        const imgBlob = await imgRes.blob()
        files.push(new File([imgBlob], v.main_image, { type: imgBlob.type || 'image/jpeg' }))
      }
    }
  }
  if (files.length === 0) return false
  const result = await importGroup(meta, files)
  return result.ok
}
