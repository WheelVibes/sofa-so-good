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
    const res = await fetch(`${assetsBase()}/library/index.json`, { credentials: 'include' })
    if (!res.ok) return null
    return (await res.json()) as SharedLibraryIndex
  } catch {
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
    for (const name of [v.main_image, v.context_image]) {
      if (!name) continue
      const imgRes = await fetch(`${baseUrl}/${name}`, { credentials: 'include' })
      if (!imgRes.ok) continue
      const imgBlob = await imgRes.blob()
      files.push(new File([imgBlob], name, { type: imgBlob.type || 'image/jpeg' }))
    }
  }
  if (files.length === 0) return false
  const result = await importGroup(meta, files)
  return result.ok
}
