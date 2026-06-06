import { BUILTIN_CATALOG } from '../../furniture/builtinCatalog'
import { defaultLayout } from '../../furniture/defaultLayout'
import { buildPresetItems, LAYOUT_PRESETS, PRESET_ROOMS } from '../../furniture/layoutPresets'
import { defaultParamProps } from '../../furniture/types'
import type { RootState } from '../store'
import type { SliceCreator } from './types'

/** Catalog-driven layout resets. Kept in their own slice so they can
 *  call into items + selection without those slices needing to know
 *  about defaultLayout. */
export interface ResetSlice {
  resetToEmpty: () => void
  resetToDefault: () => void
  /** Apply a named full-flat layout preset (furniture restyle + finishes). */
  applyLayoutPreset: (presetId: string) => void
}

/** Layout entries store only overrides; merge schema defaults so primitives
 *  see a fully-populated props bag (e.g. fixed bed dimensions). */
function hydrateLayout() {
  return defaultLayout().map((entry) => {
    const def = BUILTIN_CATALOG[entry.defId]
    if (def?.kind === 'parametric') {
      return { ...entry, props: { ...defaultParamProps(def), ...entry.props } }
    }
    return entry
  })
}

export const createResetSlice: SliceCreator<ResetSlice, RootState> = (set, get) => ({
  resetToEmpty: () => {
    get().pushHistory()
    set({ items: [], selectedItemId: null, selectedItemIds: [], hiddenItemIds: [] })
  },
  resetToDefault: () => {
    get().pushHistory()
    set({ items: hydrateLayout(), selectedItemId: null, selectedItemIds: [], hiddenItemIds: [] })
  },
  applyLayoutPreset: (presetId) => {
    const preset = LAYOUT_PRESETS.find((p) => p.id === presetId)
    if (!preset) return
    get().pushHistory()
    set({
      items: buildPresetItems(preset),
      selectedItemId: null,
      selectedItemIds: [],
      hiddenItemIds: [],
    })
    // Apply the coordinated palette across the designed living spaces.
    const setFloor = get().setFloorFinish
    const setWall = get().setWallFinish
    for (const room of PRESET_ROOMS) {
      setFloor(room, preset.dryFloor)
      setWall(room, preset.wall)
    }
  },
})
