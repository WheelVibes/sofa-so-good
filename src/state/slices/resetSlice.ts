import { isDefaultPlan } from '../../floorplan/planGeometry'
import { BUILTIN_CATALOG } from '../../furniture/builtinCatalog'
import { defaultLayout } from '../../furniture/defaultLayout'
import { furnishPlanItems } from '../../furniture/furnishPlan'
import { buildPresetItems, LAYOUT_PRESETS, PRESET_ROOMS } from '../../furniture/layoutPresets'
import { defaultParamProps } from '../../furniture/types'
import { roomKindFromName } from '../../layout/autoArrange'
import { BUILTIN_MATERIALS } from '../../materials/builtinCatalog'
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
    // Custom plan / template: the preset's authored coordinates are for the
    // built-in flat, so instead seed a kind-appropriate furniture kit per room
    // and arrange it to the plan's own walls. Also apply the preset palette: dry
    // living spaces (living / bedroom) take the preset floor + the plan's single
    // wall colour follows the preset wall swatch; wet/utility rooms keep their
    // own hard-wearing floors. Items + plan change in one `set` = one undo step
    // (the history snapshot includes `floorPlan`).
    const plan = get().floorPlan
    if (!isDefaultPlan(plan)) {
      const wallHex = BUILTIN_MATERIALS[preset.wall]?.swatch ?? plan.wallColor
      const rooms = plan.rooms.map((r) => {
        const kind = roomKindFromName(r.name)
        return kind === 'living' || kind === 'bedroom' ? { ...r, floor: preset.dryFloor } : r
      })
      set({
        items: furnishPlanItems(plan, preset, BUILTIN_CATALOG, get().doors),
        floorPlan: { ...plan, rooms, wallColor: wallHex },
        selectedItemId: null,
        selectedItemIds: [],
        hiddenItemIds: [],
      })
      return
    }
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
