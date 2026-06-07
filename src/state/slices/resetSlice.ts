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
    // Snapshot once and apply furniture + the coordinated palette in a single
    // `set`, so the whole preset is ONE undo step (calling the finish setters in
    // a loop pushed history per room — a preset took ~9 undos to revert).
    get().pushHistory()
    const cur = get().finishes
    const floor = { ...cur.floor }
    const walls = { ...cur.walls }
    for (const room of PRESET_ROOMS) {
      floor[room] = preset.dryFloor
      walls[room] = preset.wall
    }
    set({
      items: buildPresetItems(preset),
      finishes: { ...cur, floor, walls },
      selectedItemId: null,
      selectedItemIds: [],
      hiddenItemIds: [],
    })
  },
})
