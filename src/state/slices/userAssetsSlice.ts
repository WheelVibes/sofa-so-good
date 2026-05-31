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
  setUserFurniture: (defs: (UserGltfDef | IkeaGltfDef)[]) => void
  userMaterials: TexturedMaterialDef[]
  addUserMaterial: (def: TexturedMaterialDef) => void
  removeUserMaterial: (id: string) => void
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
    if (def) {
      if (def.source === 'ikea') {
        for (const variant of def.variants) {
          if (variant.runtimeUrl) URL.revokeObjectURL(variant.runtimeUrl)
          if (variant.assetId) void IdbAssetStore.delete(variant.assetId)
        }
      } else {
        if (def.runtimeUrl) URL.revokeObjectURL(def.runtimeUrl)
        void IdbAssetStore.delete(def.assetId)
      }
    }
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
      if (r.url && !kept.has(`url:${r.url}`)) URL.revokeObjectURL(r.url)
      if (r.assetId && !kept.has(`asset:${r.assetId}`)) void IdbAssetStore.delete(r.assetId)
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
  setUserMaterials: (defs) => set({ userMaterials: defs }),
})
