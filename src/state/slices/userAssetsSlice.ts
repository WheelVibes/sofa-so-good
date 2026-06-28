import { evictGltfAsset } from '../../furniture/GltfModel'
import { LOD_TIERS, lodAssetId, unregisterLodVariants } from '../../furniture/gltf/lod'
import type { IkeaGltfDef, UserGltfDef } from '../../furniture/types'
import type { TexturedMaterialDef } from '../../materials/types'
import { IdbAssetStore } from '../storage/IdbAssetStore'
import type { RootState } from '../store'
import type { SliceCreator } from './types'

/**
 * Tracks user-uploaded furniture defs and material defs (defs only —
 * the binary blobs live in IndexedDB, not the store). On startup the
 * store hydration code reads the asset manifest from `IdbAssetStore`,
 * resolves blob URLs, and populates these arrays before any consumers
 * read from them.
 *
 * Material side intentionally absent here in Phase 2 — added in 3.5.
 */

export interface UserAssetsSlice {
  userFurniture: (UserGltfDef | IkeaGltfDef)[]
  addUserFurniture: (def: UserGltfDef | IkeaGltfDef) => void
  removeUserFurniture: (id: string) => void
  /** Replace an existing def by id (or append if none), KEEPING placed
   *  instances — they reference the def by id, so a re-import must not delete
   *  them (unlike `removeUserFurniture`). Revokes/deletes only the old def's
   *  blob URLs + IDB blobs that the new def no longer references. */
  replaceUserFurniture: (def: UserGltfDef | IkeaGltfDef) => void
  /** Upsert MANY defs in a single store write (one re-render / one catalog
   *  rebuild for the whole batch). Used by bulk import to avoid an O(n²) storm
   *  of per-def writes that starves the render loop. Like `replaceUserFurniture`
   *  it keeps placed instances and frees resources of any replaced def. */
  addManyUserFurniture: (defs: (UserGltfDef | IkeaGltfDef)[]) => void
  setUserFurniture: (defs: (UserGltfDef | IkeaGltfDef)[]) => void
  userMaterials: TexturedMaterialDef[]
  addUserMaterial: (def: TexturedMaterialDef) => void
  removeUserMaterial: (id: string) => void
  /** Rename an uploaded material (in memory + its persisted IDB channel meta). */
  renameUserMaterial: (id: string, name: string) => void
  setUserMaterials: (defs: TexturedMaterialDef[]) => void
}

export const USER_ASSETS_INITIAL: Pick<UserAssetsSlice, 'userFurniture' | 'userMaterials'> = {
  userFurniture: [],
  userMaterials: [],
}

/** Blob URLs + IDB asset ids owned by a def (across ikea variants or a single
 *  user GLB), used to clean up resources a replaced/removed def no longer needs. */
function defResources(def: UserGltfDef | IkeaGltfDef): { url?: string; assetId?: string }[] {
  if (def.source === 'ikea') {
    return def.variants.map((v) => ({ url: v.runtimeUrl, assetId: v.assetId ?? undefined }))
  }
  return [{ url: def.runtimeUrl, assetId: def.assetId }]
}

/** Free one no-longer-referenced asset resource: evict its parsed GPU
 *  geometry/textures from the drei GLTF cache + module-level footprint/
 *  support-plane caches (PERF-001/008), revoke its blob URL (plus any
 *  registered LOD-variant blob URLs) and delete its IDB record (plus the
 *  derived `<id>:lod-*` tier siblings — harmless no-ops where none exist).
 *  The GLTF eviction runs FIRST, while the LOD-variant registry is still
 *  populated (it enumerates the asset's tier urls), and after the caller's
 *  `set(...)` has dropped the def + its placed items so the cloned meshes
 *  that share these geometries have already unmounted. */
function freeResource(r: { url?: string; assetId?: string }): void {
  if (r.url) {
    evictGltfAsset(r.url)
    for (const lodUrl of unregisterLodVariants(r.url)) URL.revokeObjectURL(lodUrl)
    URL.revokeObjectURL(r.url)
  }
  if (r.assetId) {
    void IdbAssetStore.delete(r.assetId)
    for (const tier of LOD_TIERS) void IdbAssetStore.delete(lodAssetId(r.assetId, tier))
  }
}

export const createUserAssetsSlice: SliceCreator<UserAssetsSlice, RootState> = (set, get) => ({
  ...USER_ASSETS_INITIAL,
  addUserFurniture: (def) => set((s) => ({ userFurniture: [...s.userFurniture, def] })),
  removeUserFurniture: (id) => {
    const def = get().userFurniture.find((d) => d.id === id)
    set((s) => {
      const removedIds = new Set(s.items.filter((it) => it.defId === id).map((it) => it.id))
      const nextIds = s.selectedItemIds.filter((x) => !removedIds.has(x))
      return {
        userFurniture: s.userFurniture.filter((d) => d.id !== id),
        // Drop placed instances of the def so they don't render placeholder cubes.
        items: s.items.filter((it) => it.defId !== id),
        selectedItemId:
          s.selectedItemId && removedIds.has(s.selectedItemId)
            ? nextIds.length > 0
              ? nextIds[nextIds.length - 1]
              : null
            : s.selectedItemId,
        selectedItemIds: nextIds,
      }
    })
    if (def) for (const r of defResources(def)) freeResource(r)
  },
  replaceUserFurniture: (def) => {
    const existing = get().userFurniture.find((d) => d.id === def.id)
    if (!existing) {
      set((s) => ({ userFurniture: [...s.userFurniture, def] }))
      return
    }
    // Swap the def in place; placed instances reference it by id, so they ride
    // through untouched (this is the whole point vs. removeUserFurniture).
    set((s) => ({
      userFurniture: s.userFurniture.map((d) => (d.id === def.id ? def : d)),
    }))
    // Free only the OLD resources the NEW def no longer references.
    const kept = new Set<string>()
    for (const r of defResources(def)) {
      if (r.url) kept.add(`url:${r.url}`)
      if (r.assetId) kept.add(`asset:${r.assetId}`)
    }
    for (const r of defResources(existing)) {
      freeResource({
        url: r.url && !kept.has(`url:${r.url}`) ? r.url : undefined,
        assetId: r.assetId && !kept.has(`asset:${r.assetId}`) ? r.assetId : undefined,
      })
    }
  },
  addManyUserFurniture: (defs) => {
    if (defs.length === 0) return
    const incoming = new Map(defs.map((d) => [d.id, d]))
    const prev = get().userFurniture
    const prevById = new Map(prev.map((d) => [d.id, d]))
    // One new array: replace defs present by id, append the rest — a single
    // store write → a single catalog rebuild for the whole batch.
    const replaced = prev.map((d) => incoming.get(d.id) ?? d)
    const appended = defs.filter((d) => !prevById.has(d.id))
    set({ userFurniture: [...replaced, ...appended] })
    // Free resources of any def we replaced that the new one no longer keeps.
    for (const def of defs) {
      const old = prevById.get(def.id)
      if (!old) continue
      const kept = new Set<string>()
      for (const r of defResources(def)) {
        if (r.url) kept.add(`url:${r.url}`)
        if (r.assetId) kept.add(`asset:${r.assetId}`)
      }
      for (const r of defResources(old)) {
        freeResource({
          url: r.url && !kept.has(`url:${r.url}`) ? r.url : undefined,
          assetId: r.assetId && !kept.has(`asset:${r.assetId}`) ? r.assetId : undefined,
        })
      }
    }
  },
  setUserFurniture: (defs) => set({ userFurniture: defs }),
  addUserMaterial: (def) => set((s) => ({ userMaterials: [...s.userMaterials, def] })),
  removeUserMaterial: (id) => {
    const def = get().userMaterials.find((d) => d.id === id)
    set((s) => ({
      userMaterials: s.userMaterials.filter((d) => d.id !== id),
    }))
    if (def?.runtimeUrls) {
      for (const url of Object.values(def.runtimeUrls)) {
        if (url) URL.revokeObjectURL(url)
      }
    }
  },
  renameUserMaterial: (id, name) => {
    const trimmed = name.trim()
    if (!trimmed) return
    const def = get().userMaterials.find((d) => d.id === id)
    if (!def) return
    set((s) => ({
      userMaterials: s.userMaterials.map((d) => (d.id === id ? { ...d, name: trimmed } : d)),
    }))
    // Persist the rename to the IDB channel meta so it survives a reload
    // (best-effort; the in-memory rename above is what the picker reflects now).
    void import('../../materials/upload/persist').then((m) =>
      m.renameUserMaterialBlobs(def, trimmed).catch(() => {}),
    )
  },
  setUserMaterials: (defs) => set({ userMaterials: defs }),
})
