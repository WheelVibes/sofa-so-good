import { ROOMS } from './constants'
import { roomCenter, roomFloorArea, roomOutline } from './roomGeometry'
import type { RoomId, Vec2 } from './types'

/**
 * A room's interior OUTLINE, in absolute world metres — four corners for a
 * plain rectangle, and the true rectilinear outline for a room built from
 * several parts (or its explicit free polygon). Thin `roomGeometry.ts` wrappers
 * keyed by `RoomId`: these used to return the primary rectangle only, so a
 * multi-part room reported a footprint, centroid and area that silently
 * excluded everything but its first rect.
 */
export function roomPolygon(id: RoomId): Vec2[] {
  return roomOutline(ROOMS[id])
}

/** Centre of the room's bounding box (label / camera anchor). */
export function roomCentroid(id: RoomId): Vec2 {
  return roomCenter(ROOMS[id])
}

/** Interior floor area (m²) over the room's whole footprint. */
export function roomArea(id: RoomId): number {
  return roomFloorArea(ROOMS[id])
}
