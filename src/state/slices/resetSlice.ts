import { planAirconPlacements } from '../../analysis/airconPlacement'
import { buildAirconSystemPlan } from '../../analysis/airconSystem'
import { mapPlanRooms } from '../../floorplan/levels'
import { isDefaultPlan, planCollisionWalls } from '../../floorplan/planGeometry'
import { toArrangeKind } from '../../floorplan/roomCategory'
import type { FloorPlan, IntakeStateId } from '../../floorplan/types'
import { BUILTIN_CATALOG } from '../../furniture/builtinCatalog'
import { buildMergedCatalog } from '../../furniture/catalog'
import { defaultLayout } from '../../furniture/defaultLayout'
import { furnishOcsItems, furnishPlanItems } from '../../furniture/furnishPlan'
import {
  absentLeafDoorIds,
  bareSanitaryProvisions,
  isStripoutKeep,
  screedDryFloorFinishes,
} from '../../furniture/intakeStates'
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
  /** Seed the **bare BTO (no OCS)** handover state (BSJ-4): cement-screed floors
   *  in the dry rooms (wet/kitchen keep their HDB-tiled floors), NO internal door
   *  leaves, bare WC/basin plumbing provisions in each bathroom, and NO furniture
   *  or carpentry. Captures the demolition baseline as the seeded shell (a new
   *  BTO has nothing to hack). One undo step. */
  applyBareBto: () => void
  /** Seed the **resale — as handed over** state (BSJ-4): keep the current (move-in
   *  default) finished/furnished home as the previous owner's flat, restore any
   *  removed door leaves, and capture it as the demolition baseline so later wall
   *  edits diff against the real as-built shell. One undo step. */
  applyResaleAsIs: () => void
  /** Seed the **resale — after strip-out** state (BSJ-4): bare screed in the dry
   *  rooms, retained wet-area + kitchen floors, retained wet/kitchen FITTINGS
   *  (furniture + wardrobes + non-fitting carpentry stripped), internal door
   *  leaves removed. Captures the retained shell as the demolition baseline. One
   *  undo step. */
  applyResaleStripout: () => void
  /** Plan the aircon SYSTEM (BSJ-2): compute the System-2/3/4 condenser
   *  proposal for the current plan and place/refresh an FCU (`aircon-unit`) in
   *  each served room + the condenser(s) (`aircon-condenser`) on the AC-ledge /
   *  service-yard room. Removes any existing aircon units first so re-running
   *  UPDATES rather than duplicating (the planner owns aircon placement). One
   *  undo step. Returns the counts placed. */
  planAircon: () => { fcus: number; condensers: number; advisories: string[] }
}

/** Fresh item id (mirrors `itemsSlice.newId`). */
function airconItemId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `id-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`
}

type DoorRec = Record<string, { open: boolean; leaf?: 'none' }>

/** A copy of the doors record with every ABSENT-leaf flag cleared — i.e. all
 *  door leaves restored (open state preserved). */
function withLeavesRestored(doors: DoorRec): DoorRec {
  const out: DoorRec = {}
  for (const [k, v] of Object.entries(doors)) out[k] = { open: v.open }
  return out
}

/** A copy of the doors record marking `ids` leaves ABSENT (BSJ-4). An absent
 *  leaf is a permanent opening, so it's set `open:true` too (keeps walk-mode
 *  collision honest — `planCollisionWalls` only clears a gap for an open door).
 *  Every other door has its leaf restored. */
function withLeavesAbsent(doors: DoorRec, ids: string[]): DoorRec {
  const out = withLeavesRestored(doors)
  for (const id of ids) out[id] = { open: true, leaf: 'none' }
  return out
}

/** The plan with bare WC/basin plumbing provisions appended (BSJ-4). Keeps the
 *  plan id (so the default flat still renders as the curated apartment); the new
 *  points persist for a custom plan and are session-only on the default flat
 *  (whose plan isn't serialized). */
function withSanitaryProvisions(plan: FloorPlan): FloorPlan {
  const provisions = bareSanitaryProvisions(plan).map((p) => ({ id: airconItemId(), ...p }))
  if (provisions.length === 0) return plan
  return { ...plan, plumbingPoints: [...(plan.plumbingPoints ?? []), ...provisions] }
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

/**
 * Stamp the buyer's starting state onto the plan.
 *
 * Persisted because it is a FACT downstream quantities cannot otherwise
 * recover — `analysis/paintQuantities.ts` needs it to know whether the walls are
 * bare skim coat (a BTO) or previously painted (a resale), which is a >2x
 * difference in litres. The wizard used to ask and discard.
 */
function withIntake(plan: FloorPlan, id: IntakeStateId): FloorPlan {
  return { ...plan, intakeState: id }
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
      // EVERY storey (F13) via `mapPlanRooms` — a ground-only rewrite left
      // every upstairs bedroom on its old floor while the downstairs changed.
      const repainted = mapPlanRooms(plan, (r) => {
        // RM1: an explicit, user-set category wins; else the legacy name
        // classifier — living/bedroom rooms get the preset's dry floor.
        const kind = r.category ? toArrangeKind(r.category) : roomKindFromName(r.name)
        return kind === 'living' || kind === 'bedroom' ? { ...r, floor: preset.dryFloor } : r
      })
      set({
        items: furnishPlanItems(plan, preset, BUILTIN_CATALOG, get().doors),
        floorPlan: { ...repainted, wallColor: wallHex },
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
      const refinished = mapPlanRooms(plan, (r) =>
        floorByRoom[r.id] ? { ...r, floor: floorByRoom[r.id] } : r,
      )
      set({
        items: furnishOcsItems(plan, [...OCS_BATH_KIT], BUILTIN_CATALOG, get().doors),
        floorPlan: withIntake(refinished, 'bto-ocs'),
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
  applyBareBto: () => {
    get().pushHistory()
    const plan = get().floorPlan
    const seededPlan = withSanitaryProvisions(plan)
    const doors = withLeavesAbsent(get().doors as DoorRec, absentLeafDoorIds(plan))
    const screed = screedDryFloorFinishes(plan)
    if (!isDefaultPlan(plan)) {
      // Custom plan / template: write screed onto each dry room's own floor;
      // wet/kitchen rooms keep their existing floor. No furniture / carpentry.
      const nextPlan = withIntake(
        mapPlanRooms(seededPlan, (r) => (screed[r.id] ? { ...r, floor: screed[r.id] } : r)),
        'bto-bare',
      )
      set({
        items: [],
        floorPlan: nextPlan,
        baselinePlan: nextPlan,
        doors,
        selectedItemId: null,
        selectedItemIds: [],
        hiddenItemIds: [],
      })
      return
    }
    // Built-in fixed flat: screed the dry rooms via the finishes slice (keyed by
    // room id), strip all furniture, seed provisions + remove internal leaves.
    const cur = get().finishes
    set({
      items: [],
      finishes: { ...cur, floor: { ...cur.floor, ...screed } },
      floorPlan: seededPlan,
      baselinePlan: seededPlan,
      doors,
      selectedItemId: null,
      selectedItemIds: [],
      hiddenItemIds: [],
    })
  },
  applyResaleAsIs: () => {
    // The move-in default IS the "previous owner's home". Keep the current design
    // untouched; only restore any removed leaves and capture the baseline.
    get().pushHistory()
    const plan = get().floorPlan
    const next = withIntake(plan, 'resale-asis')
    set({
      floorPlan: next,
      baselinePlan: next,
      doors: withLeavesRestored(get().doors as DoorRec),
    })
  },
  applyResaleStripout: () => {
    get().pushHistory()
    const plan = get().floorPlan
    const doors = withLeavesAbsent(get().doors as DoorRec, absentLeafDoorIds(plan))
    const screed = screedDryFloorFinishes(plan)
    // Keep only wet-area + kitchen FITTINGS; strip furniture + wardrobes + carpentry.
    const items = get().items.filter((it) => isStripoutKeep(it.defId))
    if (!isDefaultPlan(plan)) {
      // EVERY storey (F13) via `mapPlanRooms`. MISSED in v0.31.5.281, which
      // fixed the other three intake paths and said so — this fourth one kept
      // screeding the ground floor only, leaving a maisonette's upstairs on its
      // old finish. Found while reading this function for an unrelated reason.
      const nextPlan = withIntake(
        mapPlanRooms(plan, (r) => (screed[r.id] ? { ...r, floor: screed[r.id] } : r)),
        'resale-stripout',
      )
      set({
        items,
        floorPlan: nextPlan,
        baselinePlan: nextPlan,
        doors,
        selectedItemId: null,
        selectedItemIds: [],
        hiddenItemIds: [],
      })
      return
    }
    const cur = get().finishes
    const stamped = withIntake(plan, 'resale-stripout')
    set({
      items,
      finishes: { ...cur, floor: { ...cur.floor, ...screed } },
      floorPlan: stamped,
      baselinePlan: stamped,
      doors,
      selectedItemId: null,
      selectedItemIds: [],
      hiddenItemIds: [],
    })
  },
  planAircon: () => {
    const s = get()
    const plan = s.floorPlan
    const systemPlan = buildAirconSystemPlan(plan, s.orientationDeg)
    // Collision context so condensers slide clear of existing outdoor furniture /
    // walls instead of dropping on top of them (P2-1). The condensers must avoid
    // everything EXCEPT the planner-owned aircon items being replaced below.
    const kept = s.items.filter(
      (it) => it.defId !== 'aircon-unit' && it.defId !== 'aircon-condenser',
    )
    const { items: placements, advisories } = planAirconPlacements(plan, systemPlan, {
      items: kept,
      defs: buildMergedCatalog(s),
      walls: isDefaultPlan(plan) ? undefined : planCollisionWalls(plan, s.doors),
    })
    // Suggest-then-apply, one undo step (mirrors suggestMepPoints): drop the
    // existing planner-owned aircon items, then append the fresh set.
    if (placements.length === 0) {
      // Still remove stale aircon items if the plan now has none to place.
      if (kept.length !== get().items.length) {
        get().pushHistory()
        set({ items: kept, selectedItemId: null, selectedItemIds: [] })
      }
      return { fcus: 0, condensers: 0, advisories }
    }
    const added = placements.map((p) => ({
      id: airconItemId(),
      defId: p.defId,
      position: p.position,
      rotation: p.rotation,
      props: p.props,
      ...(p.levelId ? { levelId: p.levelId } : {}),
    }))
    get().pushHistory()
    set({
      items: [...kept, ...added],
      selectedItemId: null,
      selectedItemIds: [],
    })
    return {
      fcus: placements.filter((p) => p.defId === 'aircon-unit').length,
      condensers: placements.filter((p) => p.defId === 'aircon-condenser').length,
      advisories,
    }
  },
})
