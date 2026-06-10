import { isDefaultPlan, planCollisionWalls } from '../floorplan/planGeometry'
import type { FloorPlan } from '../floorplan/types'
import { roomEditorPlacementWalls } from './roomEditorWalls'
import type { CollisionWall } from './walls'

/** The minimal slice of store state placement-wall selection needs (structural,
 *  so this stays decoupled from the full store type). */
export interface PlacementWallState {
  floorPlan: FloorPlan
  roomEditor: { active: boolean; roomId: string | null }
  doors: Record<string, { open: boolean }>
}

/**
 * The collision walls every placement check (drag, new-item ghost, rotate,
 * duplicate, paste) should validate against — chosen once, here, so they all
 * agree. Inside the per-room editor it's the **room's solid perimeter** (so a
 * piece can't be placed past the room's walls); otherwise a custom plan's own
 * walls, or `undefined` on the default flat (canPlace then builds the flat's
 * door-aware walls itself).
 */
export function placementWalls(s: PlacementWallState): CollisionWall[] | undefined {
  if (s.roomEditor.active && s.roomEditor.roomId) {
    const roomWalls = roomEditorPlacementWalls(s.floorPlan, s.roomEditor.roomId)
    if (roomWalls) return roomWalls
  }
  return isDefaultPlan(s.floorPlan) ? undefined : planCollisionWalls(s.floorPlan, s.doors)
}
