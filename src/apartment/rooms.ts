import { ROOMS } from './constants'
import type { RoomId, Vec2 } from './types'

/** Returns the four corner points of a room's interior, NW→NE→SE→SW. */
export function roomPolygon(id: RoomId): Vec2[] {
  const r = ROOMS[id]
  const [x, z] = r.origin
  return [
    [x, z],
    [x + r.width, z],
    [x + r.width, z + r.depth],
    [x, z + r.depth],
  ]
}

export function roomCentroid(id: RoomId): Vec2 {
  const r = ROOMS[id]
  return [r.origin[0] + r.width / 2, r.origin[1] + r.depth / 2]
}

export function roomArea(id: RoomId): number {
  const r = ROOMS[id]
  return r.width * r.depth
}
