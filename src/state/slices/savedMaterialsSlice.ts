import type { MaterialCategory } from '../../materials/types'
import type { RootState } from '../store'
import type { SliceCreator } from './types'

const LS_KEY = 'hdb_saved_materials'

/**
 * User-saved custom materials (CUSTOMIZE-SAVE-MATERIAL). A composed finish
 * (`compose:<pattern>:<#hex>`), a tinted material (`tint:<baseId>:<#hex>`) or a
 * plain `#hex` colour is fully self-describing — `useMaterialDef` resolves it
 * anywhere with no catalog entry — so "saving" one is just naming that finish id
 * for reuse. We keep a small per-device list (localStorage, like favourites /
 * recents — NOT the save schema): the named entries are synthesised into the
 * merged catalog (`useMaterials`) so they show in the finish picker; applying one
 * still writes the underlying self-describing id to the room, which renders even
 * on another device that never saw the name.
 */
export interface SavedMaterial {
  /** The self-describing finish id (`compose:…` / `tint:…` / `#hex`). Doubles
   *  as the merged-catalog id and the stable key for remove/rename. */
  finishId: string
  /** User-given display name. */
  name: string
  /** Which picker surface group it belongs to (floor or wall). */
  category: MaterialCategory
}

export interface SavedMaterialsSlice {
  /** Named custom materials, newest last (insertion order). */
  savedMaterials: SavedMaterial[]
  /** Save (or rename, if the finish id is already saved) a custom material. */
  saveMaterial: (m: SavedMaterial) => void
  /** Remove a saved custom material by its finish id. */
  removeSavedMaterial: (finishId: string) => void
  /** Rename an existing saved custom material. */
  renameSavedMaterial: (finishId: string, name: string) => void
}

function load(): SavedMaterial[] {
  try {
    if (typeof localStorage === 'undefined') return []
    const raw = localStorage.getItem(LS_KEY)
    const parsed = raw ? JSON.parse(raw) : null
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (m): m is SavedMaterial =>
        !!m &&
        typeof m.finishId === 'string' &&
        typeof m.name === 'string' &&
        (m.category === 'floor' || m.category === 'wall'),
    )
  } catch {
    return []
  }
}

function persist(list: SavedMaterial[]): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(list))
  } catch {
    // private mode / quota — saved materials are non-critical, ignore.
  }
}

export const SAVED_MATERIALS_INITIAL: Pick<SavedMaterialsSlice, 'savedMaterials'> = {
  savedMaterials: load(),
}

export const createSavedMaterialsSlice: SliceCreator<SavedMaterialsSlice, RootState> = (
  set,
  get,
) => ({
  ...SAVED_MATERIALS_INITIAL,
  saveMaterial: ({ finishId, name, category }) => {
    if (!finishId || !name.trim()) return
    const trimmed = name.trim()
    const current = get().savedMaterials
    const existing = current.find((m) => m.finishId === finishId)
    const next = existing
      ? current.map((m) => (m.finishId === finishId ? { ...m, name: trimmed, category } : m))
      : [...current, { finishId, name: trimmed, category }]
    persist(next)
    set({ savedMaterials: next })
  },
  removeSavedMaterial: (finishId) => {
    const next = get().savedMaterials.filter((m) => m.finishId !== finishId)
    if (next.length === get().savedMaterials.length) return
    persist(next)
    set({ savedMaterials: next })
  },
  renameSavedMaterial: (finishId, name) => {
    if (!name.trim()) return
    const next = get().savedMaterials.map((m) =>
      m.finishId === finishId ? { ...m, name: name.trim() } : m,
    )
    persist(next)
    set({ savedMaterials: next })
  },
})
