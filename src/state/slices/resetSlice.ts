import { isDefaultPlan } from '../../floorplan/planGeometry'
import { BUILTIN_CATALOG } from '../../furniture/builtinCatalog'
import { defaultLayout } from '../../furniture/defaultLayout'
import { furnishOcsItems, furnishPlanItems } from '../../furniture/furnishPlan'
import { buildPresetItems, LAYOUT_PRESETS, PRESET_ROOMS } from '../../furniture/layoutPresets'
import {
  buildOcsFloorFinishesForDefault,
  buildOcsFloorFinishesForPlan,
  OCS_BATH_KIT,
  OCS_FITTING_DEF_IDS,
} from '../../furniture/ocsStarter'
import { defaultParamProps } from '../../furniture/types'
import { roomKindFromName } from '../../layout/autoArrange'
import { BUILTIN_MATERIALS } from '../../materials/builtinCatalog'
import { PALETTE_PRESETS } from '../../ui/color/palettePresets'
import type { RootState } from '../store'
import { cleanPalette } from './colorPaletteSlice'
import type { SliceCreator } from './types'

/** Resolve a preset's linked palette (RM2 `paletteId`) to its sanitised
 *  colour list, or `undefined` when unset/unknown (leaves `masterPalette`
 *  untouched). */
function paletteForPreset(preset: { paletteId?: string }): string[] | undefined {
  if (!preset.paletteId) return undefined
  const found = PALETTE_PRESETS.find((p) => p.id === preset.paletteId)
  return found ? cleanPalette(found.colors) : undefined
}

/** Catalog-driven layout resets. Kept in their own slice so they can
 *  call into items + selection without those slices needing to know
 *  about defaultLayout. */
export interface ResetSlice {
  resetToEmpty: () => void
  resetToDefault: () => void
  /** Apply a named full-flat layout preset (furniture restyle + finishes). */
  applyLayoutPreset: (presetId: string) => void
  /** Seed the flat with HDB's Optional Component Scheme (OCS) handover state
   *  (R4-3): OCS floor finishes (vinyl bedrooms / porcelain living) + the
   *  bathroom sanitary fittings, replacing the current furniture with the bare
   *  OCS deliverables. One undo step. */
  applyOcsStarter: () => void
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
    // A preset's linked palette (RM2 `paletteId`) applies alongside its
    // furniture/finishes — folded into the SAME `set` below so it stays part
    // of the one undo step (`setMasterPalette` pushes its own history, which
    // would otherwise split the preset into two undoable actions).
    const palette = paletteForPreset(preset)
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
        ...(palette ? { masterPalette: palette } : {}),
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
      ...(palette ? { masterPalette: palette } : {}),
    })
  },
  applyOcsStarter: () => {
    get().pushHistory()
    const plan = get().floorPlan
    if (!isDefaultPlan(plan)) {
      // Custom plan / template: seed the bath fittings + set the OCS floor
      // finish on each room whose category OCS re-finishes. Items + plan in one
      // `set` = one undo step (the snapshot includes `floorPlan`).
      const floorByRoom = buildOcsFloorFinishesForPlan(plan)
      const rooms = plan.rooms.map((r) =>
        floorByRoom[r.id] ? { ...r, floor: floorByRoom[r.id] } : r,
      )
      set({
        items: furnishOcsItems(plan, [...OCS_BATH_KIT], BUILTIN_CATALOG, get().doors),
        floorPlan: { ...plan, rooms },
        selectedItemId: null,
        selectedItemIds: [],
        hiddenItemIds: [],
      })
      return
    }
    // Built-in fixed flat: the OCS fittings are the sanitary pieces already in
    // the curated default layout — keep only those (a bare OCS handover, not the
    // fully-furnished move-in default) — and apply the OCS floor overrides.
    const ocsSet = new Set<string>(OCS_FITTING_DEF_IDS)
    const items = hydrateLayout().filter((e) => ocsSet.has(e.defId))
    const cur = get().finishes
    const floor = { ...cur.floor, ...buildOcsFloorFinishesForDefault() }
    set({
      items,
      finishes: { ...cur, floor },
      selectedItemId: null,
      selectedItemIds: [],
      hiddenItemIds: [],
    })
  },
})
