import type { InstalledPack } from '../../catalog/packs/types'
import { evictGltfAsset } from '../../furniture/GltfModel'
import type { PackGltfDef } from '../../furniture/types'
import type { RootState } from '../store'
import type { SliceCreator } from './types'

export interface InstalledPacksSlice {
  installedPacks: Record<string, InstalledPack>
  /** Hydrated by hydratePacks() at boot from IDB blobs. */
  packFurniture: PackGltfDef[]
  installing: Record<string, { progress: number; notificationId: string }>
  markPackInstalled: (pack: InstalledPack) => void
  markPackUninstalled: (packId: string) => void
  setPackFurniture: (defs: PackGltfDef[]) => void
  setInstalling: (packId: string, info: { progress: number; notificationId: string } | null) => void
}

export const INSTALLED_PACKS_INITIAL: Pick<
  InstalledPacksSlice,
  'installedPacks' | 'packFurniture' | 'installing'
> = {
  installedPacks: {},
  packFurniture: [],
  installing: {},
}

export const createInstalledPacksSlice: SliceCreator<InstalledPacksSlice, RootState> = (set) => ({
  ...INSTALLED_PACKS_INITIAL,
  markPackInstalled: (pack) =>
    set((s) => ({
      installedPacks: { ...s.installedPacks, [pack.packId]: pack },
      installing: Object.fromEntries(
        Object.entries(s.installing).filter(([k]) => k !== pack.packId),
      ),
    })),
  markPackUninstalled: (packId) =>
    set((s) => {
      const next = { ...s.installedPacks }
      delete next[packId]
      const removed = s.packFurniture.filter((d) => d.packId === packId)
      // Evict each removed pack def's parsed GPU geometry/textures + module
      // caches (PERF-001/008) AND revoke its blob URLs — but only when no
      // placed item still references the def (a pack item can be left in the
      // scene as an orphan after uninstall; clearing a still-mounted asset
      // would break it). Disposal inside evictGltfAsset is deferred a frame.
      const referenced = new Set(s.items.map((it) => it.defId))
      for (const d of removed) {
        if (referenced.has(d.id) || !d.runtimeUrl) continue
        evictGltfAsset(d.runtimeUrl)
        URL.revokeObjectURL(d.runtimeUrl)
        if (d.thumbUrl) URL.revokeObjectURL(d.thumbUrl)
      }
      return {
        installedPacks: next,
        packFurniture: s.packFurniture.filter((d) => d.packId !== packId),
      }
    }),
  setPackFurniture: (defs) => set({ packFurniture: defs }),
  setInstalling: (packId, info) =>
    set((s) => {
      const next = { ...s.installing }
      if (info) next[packId] = info
      else delete next[packId]
      return { installing: next }
    }),
})
