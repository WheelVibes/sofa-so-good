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

import { assignRoomOpeningNames } from '../floorplan/roomWallNames'
import type { FloorPlan, PlanRoom } from '../floorplan/types'
import { isExternalRoom } from './daylight'

/** Accessible clear door width (m) — BCA accessible route minimum. */
export const MIN_DOOR_CLEAR = 0.85
/** Wheelchair turning-circle diameter (m). */
export const TURN_CIRCLE = 1.5
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
  thresholds: { door: number; turn: number }
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
  const openings = Array.isArray(plan.openings) ? plan.openings : []
  const walls = Array.isArray(plan.walls) ? plan.walls : []
  const allRooms = Array.isArray(plan.rooms) ? plan.rooms : []
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

  const rooms: RoomAccessRow[] = (Array.isArray(plan.rooms) ? plan.rooms : [])
    .filter((r) => !isExternalRoom(r) && r.width > 0 && r.depth > 0)
    .map((r) => {
      const minDim = roomMinDim(r)
      return { roomId: r.id, roomName: r.name, minDim, pass: minDim >= TURN_CIRCLE }
    })

  const doorPassCount = doors.filter((d) => d.pass).length
  const turnPassCount = rooms.filter((r) => r.pass).length
  return {
    doors,
    rooms,
    doorPassCount,
    turnPassCount,
    allPass: doorPassCount === doors.length && turnPassCount === rooms.length,
    thresholds: { door: MIN_DOOR_CLEAR, turn: TURN_CIRCLE },
  }
}

/** Whether an opening width reads as a main entrance (for labelling). */
export function isEntryWidth(width: number): boolean {
  return width >= ENTRY_WIDTH
}
