import type { StateCreator } from 'zustand'
import { guessCategory } from '../../catalog/packs/polyPizza'
import { isFeatureEnabled } from '../../features/featureFlags'
import type { FurnitureCategory, LocalGltfDef } from '../../furniture/types'
import { FURNITURE_CATEGORIES } from '../../furniture/types'
import { inferCollisionFlags } from '../../furniture/upload/inferFlags'

/** Mount path served by the dev-only Vite plugin (`scripts/vite-local-assets.mjs`). */
export const LOCAL_ASSETS_MOUNT = '/@local-assets'

/** One entry of the plugin's `index.json` (metadata only — no category logic). */
export interface LocalAssetIndexEntry {
  relPath: string
  name: string
  bytes: number
  subdir: string
}

/**
 * Dev-only catalog source: GLBs dropped into `local-assets/` and served by the
 * `localAssetsPlugin` Vite middleware, loaded straight into the catalog with NO
 * upload pipeline (no convert/optimize/IndexedDB). Session-only — a live view of
 * the folder, re-scanned on `bootstrapLocalAssets()`; NOT persisted (so it never
 * touches the save schema / autosave). Gated by the `localAssets` devOnly flag +
 * `import.meta.env.DEV`; in production the routes don't exist, so it stays empty.
 */
export interface LocalAssetsSlice {
  localFurniture: LocalGltfDef[]
  localAssetsStatus: 'idle' | 'loading' | 'ready' | 'error'
  bootstrapLocalAssets(): Promise<void>
}

/** Turn an index entry into a renderable GLB def. Category comes from a matching
 *  top-level subfolder name (`local-assets/seating/…`) when present, else a
 *  keyword guess from the name + path; collision flags inferred from the path. */
export function localEntryToDef(e: LocalAssetIndexEntry): LocalGltfDef {
  const fromDir = FURNITURE_CATEGORIES.includes(e.subdir as FurnitureCategory)
    ? (e.subdir as FurnitureCategory)
    : null
  const category = fromDir ?? guessCategory(`${e.name} ${e.relPath}`)
  const flags = inferCollisionFlags(e.relPath)
  // Encode each path segment but keep the slashes so the plugin can resolve it.
  const encoded = e.relPath.split('/').map(encodeURIComponent).join('/')
  return {
    id: `local:${e.relPath}`,
    name: e.name,
    category,
    kind: 'gltf',
    source: 'local',
    url: `${LOCAL_ASSETS_MOUNT}/file/${encoded}`,
    relPath: e.relPath,
    byteSize: e.bytes,
    defaultFootprint: { w: 1, d: 1, h: 1 },
    mounted: flags.mounted || undefined,
    noClip: flags.noClip || undefined,
    license: 'CC0',
  }
}

export const LOCAL_ASSETS_INITIAL: Pick<LocalAssetsSlice, 'localFurniture' | 'localAssetsStatus'> =
  {
    localFurniture: [],
    localAssetsStatus: 'idle',
  }

export const createLocalAssetsSlice: StateCreator<LocalAssetsSlice, [], [], LocalAssetsSlice> = (
  set,
  get,
) => ({
  ...LOCAL_ASSETS_INITIAL,

  async bootstrapLocalAssets() {
    // Dev-only + flag-gated. In prod the plugin routes don't exist and the flag
    // is forced off (`devOnly`), so this is a no-op.
    if (!import.meta.env.DEV || !isFeatureEnabled('localAssets')) return
    if (get().localAssetsStatus === 'loading') return
    set({ localAssetsStatus: 'loading' })
    try {
      const res = await fetch(`${LOCAL_ASSETS_MOUNT}/index.json`)
      if (!res.ok) throw new Error(`local-assets index HTTP ${res.status}`)
      const json = (await res.json()) as { files?: LocalAssetIndexEntry[] }
      const files = Array.isArray(json.files) ? json.files : []
      set({ localFurniture: files.map(localEntryToDef), localAssetsStatus: 'ready' })
    } catch {
      // Plugin not mounted / folder empty / dev server without it — degrade to
      // no local entries; never break the catalog.
      set({ localFurniture: [], localAssetsStatus: 'error' })
    }
  },
})
