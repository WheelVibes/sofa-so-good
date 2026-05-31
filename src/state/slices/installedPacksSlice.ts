import type { InstalledPack } from '../../catalog/packs/types'
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
