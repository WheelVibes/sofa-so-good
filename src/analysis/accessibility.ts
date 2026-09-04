/**
 * Accessibility / Universal-Design check — a plan-level QC in the spirit of the
 * BCA Code on Accessibility in the Built Environment (and aging-in-place / HDB
 * EASE guidance). Two purely-geometric, rule-of-thumb checks:
 *
 *   - **Doorways**: each door's clear opening width vs 0.85 m — the accessible
 *     clear width a wheelchair/walking-frame needs. (HDB internal doors are
 *     often 0.8–0.9 m; a 0.7 m bathroom door fails, as it does in reality.)
 *   - **Turning space**: each habitable room must fit a 1.5 m-diameter clear
 *     turning circle → its smaller plan dimension must be ≥ 1.5 m.
 *
 * Pure logic only — no React, no three — so it stays fully unit-testable; a
 * panel / report section is presentation over the rows this returns. Mirrors the
 * shape of `daylight.ts`.
 */

import { allPlanOpenings, allPlanRooms, allPlanWalls } from '../floorplan/levels'
import { assignRoomOpeningNames } from '../floorplan/roomWallNames'
import type { FloorPlan, PlanRoom } from '../floorplan/types'
import { isExternalRoom } from './daylight'

/** Accessible clear door width (m) — BCA accessible route minimum. */
export const MIN_DOOR_CLEAR = 0.85
/** Wheelchair turning-circle diameter (m). */
export const TURN_CIRCLE = 1.5
/**
 * HDB's minimum internal corridor width (m) — the bar for a space to be walkable
 * at all, well below the 1.5 m turning circle.
 *
 * "The internal corridor within an HDB flat should maintain a minimum width of
 * 900mm (90cm) to ensure free and safe movement", "designed to allow a single
 * person to walk comfortably through the corridor without obstruction".
 *
 * **This corrects a figure the repo had recorded wrongly (v0.31.8.18).**
 * `docs/research/2026-09-02-layout-critique-standards.md` and `TODO.md` both said
 * the generic 0.91 m (36") and the SG figure "disagree by ~20 cm", giving
 * "at least 70-80 cm" as the SG number and instructing that a future check
 * "use the SG figure for this app". They do not disagree: HDB's own renovation
 * guidance is 900 mm, which is the same bar as the generic 36". Implementing the
 * TODO as written would have made the app MORE PERMISSIVE than HDB.
 *
 * Applied to every habitable room rather than to "corridors", deliberately: a
 * room narrower than 900 mm cannot be walked through whatever it is called, and
 * there is no `corridor` `RoomCategory` to key on — recognising one by NAME
 * would be a guess about a taxonomy, the mistake the rug-anchor regex made.
 */
const MIN_WALKABLE_WIDTH = 0.9
/** A main entrance is at least this wide — used to label the entry door. */
const ENTRY_WIDTH = 1.0

/** One door's accessibility result. */
interface DoorAccessRow {
  id: string
  /** Clear structural opening width (m). */
  width: number
  pass: boolean
  /** Which door this is, e.g. "Bedroom 2 door 01".
   *
   *  Without it the panel listed seven identical `Door · 0.80 m` rows and the
   *  advice ("widen to ≥ 0.85 m") was unactionable — you could not tell which
   *  door to widen (Chrome audit 2026-08). Prefers a user/auto-assigned opening
   *  name, otherwise derives one from the room the door sits on. */
  name?: string
}

/** One room's turning-space result. */
interface RoomAccessRow {
  roomId: string
  roomName: string
  /** Smaller plan dimension (m) — the limiting span for a turning circle. */
  minDim: number
  pass: boolean
  /** `false` when the room is narrower than HDB's 900 mm movement minimum —
   *  a stricter failure than `pass`, which only rules out a wheelchair turn. */
  walkable: boolean
}

export interface AccessibilityReport {
  doors: DoorAccessRow[]
  rooms: RoomAccessRow[]
  /** Doors meeting the clear-width minimum. */
  doorPassCount: number
  /** Habitable rooms fitting the turning circle. */
  turnPassCount: number
  /** True when every door + room passes (vacuously true with none). */
  allPass: boolean
  thresholds: { door: number; turn: number; walkable: number }
}

/** Smaller plan dimension of a room (origin/width/depth are kept as the bbox
 *  even for polygon rooms, so this is the bounding-box minimum span). */
function roomMinDim(r: PlanRoom): number {
  return Math.min(r.width, r.depth)
}

/**
 * Build the accessibility report for a plan. Doors come from the plan openings;
 * rooms are the habitable (non-external) rooms with positive footprint.
 */
export function buildAccessibilityReport(plan: FloorPlan): AccessibilityReport {
  // EVERY storey (F13). `plan.openings`/`plan.walls`/`plan.rooms` are
  // GROUND-ONLY, so this previously checked only the ground floor while its own
  // variable was named `allRooms` and its output claimed to cover the home — an
  // upstairs bedroom or door was silently never assessed. Callers pass the whole
  // plan (`report.ts`, `AccessibilityPanel`), never a `levelAsPlan` result, so
  // the whole-home read is the correct one here.
  const openings = allPlanOpenings(plan)
  const walls = allPlanWalls(plan)
  const allRooms = allPlanRooms(plan)
  // Reuse the same room→opening allocation the plan editor uses for auto-naming,
  // so a door reads the same here as it does when selected on the plan. The
  // seeded default plan carries no opening names (auto-naming only runs when a
  // room is added or renamed), which is exactly the case that produced a list of
  // indistinguishable rows.
  const derivedNames = new Map<string, string>()
  for (const room of allRooms) {
    for (const a of assignRoomOpeningNames(walls, openings, room)) {
      if (!derivedNames.has(a.id)) derivedNames.set(a.id, a.name)
    }
  }
  const doors: DoorAccessRow[] = openings
    .filter((o) => o.kind === 'door')
    .map((o) => ({
      id: o.id,
      width: o.width,
      pass: o.width >= MIN_DOOR_CLEAR,
      name: o.name ?? derivedNames.get(o.id),
    }))

  const rooms: RoomAccessRow[] = allRooms
    .filter((r) => !isExternalRoom(r) && r.width > 0 && r.depth > 0)
    .map((r) => {
      const minDim = roomMinDim(r)
      return {
        roomId: r.id,
        roomName: r.name,
        minDim,
        pass: minDim >= TURN_CIRCLE,
        // A separate, more serious tier: below HDB's 900 mm the space is not
        // walkable at all, where failing the turn circle only rules out a
        // wheelchair. Fires on NO shipped plan — measured across all 19
        // templates plus the default flat, 168 rooms, narrowest 1.00 m — so it
        // exists for a user-drawn plan, which is the only place it can occur.
        walkable: minDim >= MIN_WALKABLE_WIDTH,
      }
    })

  const doorPassCount = doors.filter((d) => d.pass).length
  const turnPassCount = rooms.filter((r) => r.pass).length
  return {
    doors,
    rooms,
    doorPassCount,
    turnPassCount,
    allPass: doorPassCount === doors.length && turnPassCount === rooms.length,
    thresholds: { door: MIN_DOOR_CLEAR, turn: TURN_CIRCLE, walkable: MIN_WALKABLE_WIDTH },
  }
}

/** Whether an opening width reads as a main entrance (for labelling). */
export function isEntryWidth(width: number): boolean {
  return width >= ENTRY_WIDTH
}
