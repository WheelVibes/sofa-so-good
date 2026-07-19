/**
 * BTO / resale starting-state manifests (BSJ-4).
 *
 * The OCS starter (`ocsStarter.ts`) covers only the HDB Optional-Component-Scheme
 * minority. This module encodes the OTHER real handover states a Singapore buyer
 * starts from, as pure data + pure functions (no store / React / three), so
 * `state/slices/resetSlice.ts` can seed the design deterministically and the
 * Smart Start wizard can offer them as a "Starting state" group:
 *
 *  - **New BTO — bare (no OCS).** What HDB hands over WITHOUT the Optional
 *    Component Scheme: **cement-screed floors everywhere** (no floor finish),
 *    **no internal door leaves** (the door openings + frames exist, but the buyer
 *    fits the leaves), **bare sanitary provisions only** (WC soil pipe + basin
 *    water point stubbed in each bathroom — no fittings), and **no carpentry**
 *    (no wardrobes / kitchen cabinets). The main entrance door + gate and the
 *    household-shelter blast door ARE provided. This is the state the non-OCS
 *    majority actually collects.
 *      Refs (2025-26): HDB Group Reno — BTO renovation cost/timeline 2025;
 *      9creation — BTO renovation cost breakdown; Qanvast — BTO handover.
 *
 *  - **New BTO — with OCS.** Handled by `ocsStarter.ts` (vinyl bedrooms /
 *    porcelain living + a bathroom fitting kit). Named here only for the group.
 *
 *  - **Resale — as handed over.** The previous owner's finished, furnished home:
 *    the app's move-in default IS this state, so this intake keeps the current
 *    design and only captures the demolition/hacking BASELINE (`baselinePlan`)
 *    so a later wall edit diffs against the real as-built shell.
 *
 *  - **Resale — after strip-out.** The shell after hacking: **bare cement screed
 *    in the dry rooms**, **retained wet-area + kitchen floors** (waterproofing is
 *    expensive to re-do — kept), **wet-area + kitchen FITTINGS retained** (WC /
 *    basin / shower / vanity / hob / sink / heater), **furniture + bedroom
 *    wardrobes stripped**, and **internal door leaves removed** (bare shell). The
 *    3-year re-tiling rule doesn't apply to an old flat, but the retained-
 *    waterproofing note does (surfaced by `renoRulesPack` / `renoTimeline`).
 *      Refs (2025-26): RCS — HDB renovation budget 2026 (hacking $2-5k; old
 *      wiring/plumbing replacement $3-8k); 9creation — strip-out scope.
 *
 * NOTE (BSJ-8): the intake states deliberately do NOT seed `PlanRoom.floorLevelMm`
 * (e.g. a bare-BTO bath at −50 mm). Seeding it would mean mutating plan room
 * objects inside `resetSlice` — and on the fixed default flat those mutations are
 * session-only (the default plan isn't serialized, same caveat BSJ-4's plumbing
 * provisions carry), so the value would silently vanish on reload for the most
 * common case. The bath step-down is instead surfaced honestly by the BSJ-8
 * kerb/step ADVISORY (`floorLevels.ts:buildKerbAdvisories`), and the owner sets an
 * explicit level per room via the RoomInspector "Floor level" field.
 */

import { planLevels } from '../floorplan/levels'
import { roomCategory } from '../floorplan/roomCategory'
import { roomLabelPoint } from '../floorplan/roomCentroid'
import type { FloorPlan, PlanOpening, PlanPlumbingPoint, RoomCategory } from '../floorplan/types'
import type { MaterialId } from '../materials/types'

/** The four buyer starting states offered in Smart Start (BSJ-4). `bto-ocs`
 *  routes to the existing `applyOcsStarter`; the other three are new here. */
export type IntakeStateId = 'bto-bare' | 'bto-ocs' | 'resale-asis' | 'resale-stripout'

/** Cement screed — the bare, unfinished BTO handover floor. */
export const SCREED: MaterialId = 'floor-screed'

/** Room categories that are WET or hard-service (kitchen/bath/yard) — HDB tiles
 *  these regardless of OCS, and a resale strip-out RETAINS their floors +
 *  fittings (waterproofing is costly to re-do). Everything else is "dry". */
const WET_OR_SERVICE: ReadonlySet<RoomCategory> = new Set<RoomCategory>([
  'bath',
  'powder',
  'kitchen',
  'serviceYard',
])

/** True when a room category keeps its existing floor + fittings in a bare/strip
 *  seeding (wet + kitchen + service yard); false for dry rooms that go to screed. */
export function retainsWetFloor(category: RoomCategory): boolean {
  return WET_OR_SERVICE.has(category)
}

/**
 * Floor-finish overrides for a bare-BTO / strip-out seeding, keyed by room id:
 * every DRY room → cement `SCREED`; wet + kitchen + service-yard rooms are OMITTED
 * (they keep their existing HDB-tiled + waterproofed floor — HDB tiles the wet
 * areas & kitchen regardless of OCS, and a strip-out retains that tiling). Works
 * for the fixed default flat (room ids are the `RoomId`s the finishes slice keys
 * on) and any custom plan/template. Pure + deterministic; scans every storey.
 */
export function screedDryFloorFinishes(plan: FloorPlan): Record<string, MaterialId> {
  const out: Record<string, MaterialId> = {}
  for (const level of planLevels(plan)) {
    for (const room of level.rooms) {
      if (retainsWetFloor(roomCategory(room))) continue
      out[room.id] = SCREED
    }
  }
  return out
}

/** Item def ids RETAINED in a resale strip-out — wet-area + kitchen FITTINGS the
 *  owner keeps (the plumbing fixtures + built-in appliances), while all loose
 *  furniture + bedroom wardrobes + kitchen/wardrobe carpentry are stripped. */
export const STRIPOUT_KEEP_DEF_IDS: ReadonlySet<string> = new Set<string>([
  // Bathroom sanitary + fittings
  'toilet',
  'bathroom-sink',
  'shower',
  'shower-screen',
  'bathtub',
  'vanity',
  'bathroom-mirror',
  'water-heater',
  'towel-rail',
  'towel-ladder',
  'bidet-spray',
  'mixer-tap',
  // Kitchen fittings / appliances (fixed to services)
  'hob',
  'stove',
  'range-hood',
  'built-in-oven',
  'sink',
])

/** True when a placed item's def id is a wet-area/kitchen fitting kept through a
 *  resale strip-out. */
export function isStripoutKeep(defId: string): boolean {
  return STRIPOUT_KEEP_DEF_IDS.has(defId)
}

/** Door ids whose leaf is ALWAYS provided on handover, so a bare/strip seeding
 *  never removes them: the main entrance (also caught by the external-wall rule
 *  below) + the mandatory household-shelter blast door. */
const KEEP_LEAF_ID = /shelter|(^|[-_])main([-_]|$)|entrance|gate/i

/**
 * Ids of DOOR openings whose leaf a bare-BTO / strip-out handover leaves ABSENT:
 * every door on an INTERNAL wall (bedroom / bathroom / utility partitions), minus
 * the always-provided doors (`KEEP_LEAF_ID`). Doors on external walls (the main
 * entrance) keep their leaf. Works for the fixed default plan (its openings carry
 * the `door-*` ids + real wall thicknesses) and any custom plan/template alike.
 * Pure + deterministic; scans every storey.
 */
export function absentLeafDoorIds(plan: FloorPlan): string[] {
  const out: string[] = []
  for (const level of planLevels(plan)) {
    const wallThickness = new Map(level.walls.map((w) => [w.id, w.thickness] as const))
    for (const op of level.openings as PlanOpening[]) {
      if (op.kind !== 'door') continue
      if (wallThickness.get(op.wallId) !== 'internal') continue
      if (KEEP_LEAF_ID.test(op.id)) continue
      out.push(op.id)
    }
  }
  return out
}

/**
 * Bare sanitary provisions (BSJ-4): one WC soil-pipe stub + one basin water point
 * per bathroom / powder room, offset a little apart around the room centroid.
 * These are the pipe positions HDB provides — NOT fittings — so the bare owner
 * sees where the WC + basin connect. Pure; returns [] when the plan has no
 * bathrooms. Points are id-less (`Omit<…, 'id'>`); the caller assigns ids.
 */
export function bareSanitaryProvisions(plan: FloorPlan): Array<Omit<PlanPlumbingPoint, 'id'>> {
  const out: Array<Omit<PlanPlumbingPoint, 'id'>> = []
  for (const level of planLevels(plan)) {
    for (const room of level.rooms) {
      const category = roomCategory(room)
      if (category !== 'bath' && category !== 'powder') continue
      const [cx, cz] = roomLabelPoint(room)
      const levelBit = level.id === 'ground' ? {} : { levelId: level.id }
      // WC soil pipe a touch to one side; basin water point to the other.
      out.push({ kind: 'soil-pipe', x: cx - 0.4, z: cz, label: 'WC (provision)', ...levelBit })
      out.push({
        kind: 'water-point',
        x: cx + 0.4,
        z: cz,
        label: 'Basin (provision)',
        ...levelBit,
      })
    }
  }
  return out
}

/** Info note + what-it-seeds copy per starting state, for the Smart Start group.
 *  Kept here (with the manifests) so the UI stays a thin renderer. */
export interface IntakeStateMeta {
  id: IntakeStateId
  name: string
  /** One-line explanation shown under the option. */
  blurb: string
}

export const INTAKE_STATES: readonly IntakeStateMeta[] = [
  {
    id: 'bto-bare',
    name: 'New BTO — bare',
    blurb:
      'What HDB hands over without OCS: cement-screed floors, no internal door leaves, WC/basin pipe provisions only, no wardrobes or cabinets.',
  },
  {
    id: 'bto-ocs',
    name: 'New BTO — with OCS',
    blurb:
      'Opted into the Optional Component Scheme: vinyl bedrooms, porcelain living, and bathroom fittings pre-installed. Chosen at booking; can’t be added later.',
  },
  {
    id: 'resale-asis',
    name: 'Resale — as handed over',
    blurb:
      'The previous owner’s finished, furnished home. Keeps the current design and captures it as the demolition baseline for hacking costs.',
  },
  {
    id: 'resale-stripout',
    name: 'Resale — after strip-out',
    blurb:
      'The shell after hacking: bare screed in dry rooms, retained wet-area tiles + fittings, furniture and wardrobes stripped, internal door leaves removed.',
  },
] as const
