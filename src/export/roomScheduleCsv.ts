/**
 * Pure builder for the room-schedule CSV export (PARITY-ROOM-CSV — Coohom /
 * Sweet Home 3D / RoomSketcher "room schedule" parity). One row per room across
 * ALL storeys with its area, perimeter, resolved floor + wall finish names, and
 * ceiling height, plus a grand-total footer (room count + total floor area).
 *
 * Mirrors `ui/furnitureCsv.ts`: pure, render-agnostic, unit-testable, RFC-4180
 * quoted with OWASP CSV-injection defense (`utils/csv`). It reuses the existing
 * geometry + finish resolvers (`planRoomArea`/`planRoomPerimeter`/
 * `resolvePlanRoomFloor`/`resolvePlanRoomWall`) and the multi-storey room walk
 * (`allPlanRooms` / `levelOfRoom`) so a single source of truth drives the plan
 * labels, the drawing-set finishes sheet, and this export.
 *
 * Self-contained: imports only sibling pure modules + types (no store / React).
 */

import { allPlanRooms, levelOfRoom } from '../floorplan/levels'
import {
  type RoomFinishMaps,
  resolvePlanRoomFloor,
  resolvePlanRoomWall,
} from '../floorplan/roomFinishes'
import { type FloorPlan, planRoomArea, planRoomPerimeter } from '../floorplan/types'
import { csvSafeField } from '../utils/csv'
import { formatArea, formatLength, type UnitSystem } from '../utils/measurement'

/** Shown when a room never had a wall finish picked (neutral plaster shell). */
export const ROOM_CSV_NEUTRAL_WALL = 'Plaster (neutral)'

export interface RoomScheduleRow {
  /** Storey the room sits on (e.g. "Ground floor"). */
  storey: string
  /** Room display name. */
  room: string
  /** Interior floor area in m² (raw — formatting is applied at CSV emit time). */
  areaM2: number
  /** Interior wall perimeter in m (raw). */
  perimeterM: number
  /** Resolved floor finish display name. */
  floor: string
  /** Resolved wall finish display name, or the neutral-plaster fallback. */
  wall: string
  /** Ceiling height in m: room → level → plan default. */
  ceilingM: number
}

/**
 * Resolve a room's ceiling height (m): per-room override → its storey's level
 * height → the plan default. Mirrors `levelAsPlan`'s `ceilingHeight` order.
 */
function resolveRoomCeiling(plan: FloorPlan, roomId: string, roomHeight?: number): number {
  if (roomHeight != null) return roomHeight
  const level = levelOfRoom(plan, roomId)
  return level?.ceilingHeight ?? plan.ceilingHeight
}

/**
 * Build the structured room schedule: one row per room (ground storey first,
 * then upper storeys), each carrying area / perimeter / floor + wall finish
 * names / ceiling height. `nameOf` maps a material id to a display name
 * (injected so this stays pure + unit-testable). Tolerates an empty plan (→ []).
 */
export function buildRoomSchedule(
  plan: FloorPlan,
  finishes: RoomFinishMaps,
  nameOf: (id: string) => string,
): RoomScheduleRow[] {
  return allPlanRooms(plan).map((room) => {
    const floorId = resolvePlanRoomFloor(finishes, room)
    const wallId = resolvePlanRoomWall(finishes, room)
    const level = levelOfRoom(plan, room.id)
    return {
      storey: level?.name ?? 'Ground floor',
      room: room.name,
      areaM2: planRoomArea(room),
      perimeterM: planRoomPerimeter(room),
      floor: nameOf(floorId),
      wall: wallId ? nameOf(wallId) : ROOM_CSV_NEUTRAL_WALL,
      ceilingM: resolveRoomCeiling(plan, room.id, room.ceilingHeight),
    }
  })
}

/**
 * Build a CSV (CRLF line endings, Excel-friendly) of the room schedule plus a
 * grand-total footer row. Columns: Storey, Room, Area, Perimeter, Floor finish,
 * Wall finish, Ceiling height. Area/perimeter/ceiling are formatted in the chosen
 * unit system (metric → "12.2 m²" / "2.60 m"; imperial → "131 ft²" / "8′ 6″").
 * The footer carries the room count + total floor area. An empty plan yields just
 * the header + the (zero) total row.
 */
export function buildRoomScheduleCsv(
  plan: FloorPlan,
  finishes: RoomFinishMaps,
  nameOf: (id: string) => string,
  units: UnitSystem = 'metric',
): string {
  const header = [
    'Storey',
    'Room',
    'Area',
    'Perimeter',
    'Floor finish',
    'Wall finish',
    'Ceiling height',
  ]
  const rows = buildRoomSchedule(plan, finishes, nameOf)
  let totalArea = 0
  const body = rows.map((r) => {
    totalArea += r.areaM2
    return [
      csvSafeField(r.storey),
      csvSafeField(r.room),
      csvSafeField(formatArea(r.areaM2, units)),
      csvSafeField(formatLength(r.perimeterM, units)),
      csvSafeField(r.floor),
      csvSafeField(r.wall),
      csvSafeField(formatLength(r.ceilingM, units)),
    ]
  })
  // Grand-total footer: room count in the Storey cell, total floor area in Area.
  body.push([
    csvSafeField(`Total (${rows.length} ${rows.length === 1 ? 'room' : 'rooms'})`),
    '',
    csvSafeField(formatArea(totalArea, units)),
    '',
    '',
    '',
    '',
  ])
  return [header, ...body].map((cells) => cells.join(',')).join('\r\n')
}
