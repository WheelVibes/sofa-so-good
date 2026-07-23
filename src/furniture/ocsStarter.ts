/**
 * BTO Optional Component Scheme (OCS) starter manifest (UX research round 4 R4-3).
 *
 * HDB's Optional Component Scheme is opted into once, at flat booking, and CANNOT
 * be added later — an owner who took it collects a flat that already has internal
 * door leaves, floor finishes and sanitary fittings installed. This module encodes
 * that handover deliverable set as pure data so the "New BTO (with OCS)" starting
 * point can pre-seed the design from what the owner will actually receive, rather
 * than a bare shell.
 *
 * Deliverables encoded (the standard OCS package):
 *  - **Floor finishes** — vinyl strips in bedrooms/study, polished porcelain tiles
 *    in the living/dining. Kitchens and bathrooms are always tiled by HDB
 *    regardless of OCS, so their existing hard-wearing floors are left untouched.
 *  - **Sanitary fittings** — a wall-mounted basin + mixer, shower set and WC in
 *    each bathroom (the app's existing `bathroom-sink` / `shower` / `toilet` /
 *    `water-heater` catalog defs).
 *  - **Internal doors** — bedroom + bathroom door leaves. These are already
 *    provided by the plan's door openings + the `doors` store slice, so this
 *    module does not re-model them; the flat's existing leaves stand in for the
 *    flush painted (bedroom) / bifold vinyl (bath) OCS doors.
 *
 * Pure data + pure functions only (no store, no React, no three) so it is fully
 * unit-testable and deterministic. `state/slices/resetSlice.ts:applyOcsStarter`
 * consumes it; `ui/wizard/SmartStartWizard.tsx` exposes the starting point.
 *
 * Refs (rules as of 2026):
 *  - qanvast.com/sg/articles/hdb-optional-component-scheme-ocs-is-it-worth-opting-in-1873
 *  - dollarsandsense.sg/complete-guide-hdbs-optional-components-scheme-ocs/
 */

import type { RoomId } from '../apartment/types'
import { roomCategory } from '../floorplan/roomCategory'
import type { FloorPlan, RoomCategory } from '../floorplan/types'
import type { MaterialId } from '../materials/types'
import type { KitPiece } from './furnishPlan'

/** Vinyl strip flooring — the OCS bedroom/study finish. */
export const OCS_VINYL: MaterialId = 'floor-vinyl-oak'
/** Polished porcelain tile — the OCS living/dining finish (generic category
 *  map below; the SNV fixed-flat default gets vinyl instead, see
 *  `OCS_FLOOR_DEFAULT`). */
export const OCS_PORCELAIN: MaterialId = 'floor-tile-grey'

/**
 * OCS floor finish per fixed-flat room id (the built-in HDB flat, keyed like
 * `DEFAULT_ROOM_FLOOR`). Only the rooms OCS actually re-finishes are listed:
 * bedrooms + living/dining/corridor. Kitchen / baths / utility keep their own
 * tiled or hard-wearing floors (always HDB-tiled regardless of OCS).
 *
 * The built-in flat models the Serangoon North Vista (SNV) 4-room OCS sheet
 * (assets/ocs/photo_7), which shows VINYL — not porcelain — across
 * living/dining/bedrooms alike for 4-/5-room flats; the generic
 * category map (`OCS_FLOOR_BY_CATEGORY`) keeps porcelain for other projects
 * that do give a porcelain living room.
 */
const OCS_FLOOR_DEFAULT: Partial<Record<RoomId, MaterialId>> = {
  mainBedroom: OCS_VINYL,
  bedroom2: OCS_VINYL,
  bedroom3: OCS_VINYL,
  livingDining: OCS_VINYL,
  corridor: OCS_VINYL,
}

/**
 * OCS floor finish per USER-declared room category (custom plans). Same intent
 * as `OCS_FLOOR_DEFAULT`: vinyl in dry sleeping/study spaces, polished porcelain
 * across the dry living spaces. A category not listed keeps its current floor.
 */
const OCS_FLOOR_BY_CATEGORY: Partial<Record<RoomCategory, MaterialId>> = {
  bedroom: OCS_VINYL,
  masterBedroom: OCS_VINYL,
  study: OCS_VINYL,
  living: OCS_PORCELAIN,
  dining: OCS_PORCELAIN,
  foyer: OCS_PORCELAIN,
}

/** Resolve the OCS floor finish for a room category, or `undefined` when OCS
 *  leaves that category's floor untouched. */
export function ocsFloorForCategory(category: RoomCategory): MaterialId | undefined {
  return OCS_FLOOR_BY_CATEGORY[category]
}

/**
 * Sanitary / bathroom fittings the OCS package installs in each bathroom — the
 * wall-mounted basin (+ mixer), shower set, WC, mirror and storage water heater.
 * These are the exact catalog def ids the app already ships (see
 * `furniture/defs/bathroom.ts`).
 */
export const OCS_BATH_KIT: readonly KitPiece[] = [
  { defId: 'toilet' },
  { defId: 'bathroom-sink', props: { style: 'wall-hung' } },
  { defId: 'shower' },
  { defId: 'water-heater' },
  { defId: 'bathroom-mirror', props: { mountHeight: 1.4 } },
]

/** The def ids OCS delivers (used to filter the fixed-flat default layout down to
 *  just the OCS-provided fittings). */
export const OCS_FITTING_DEF_IDS: readonly string[] = OCS_BATH_KIT.map((p) => p.defId)

/**
 * OCS floor-finish overrides for the built-in fixed flat, keyed by room id.
 * Returned as a plain map so the caller can merge it over the current
 * `finishes.floor`. Deterministic.
 */
export function buildOcsFloorFinishesForDefault(): Partial<Record<RoomId, MaterialId>> {
  return { ...OCS_FLOOR_DEFAULT }
}

/**
 * OCS floor-finish overrides for a custom plan, keyed by the plan's own room
 * ids, resolved from each room's (user-set or inferred) category. Rooms whose
 * category OCS leaves untouched are omitted. Deterministic; never throws on a
 * partial plan.
 */
export function buildOcsFloorFinishesForPlan(plan: FloorPlan): Record<string, MaterialId> {
  const out: Record<string, MaterialId> = {}
  const rooms = Array.isArray(plan?.rooms) ? plan.rooms : []
  for (const room of rooms) {
    if (!room) continue
    const id = ocsFloorForCategory(roomCategory(room))
    if (id) out[room.id] = id
  }
  return out
}
