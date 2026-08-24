import { describe, expect, it } from 'vitest'
import type { WallBox } from '../../floorplan/planGeometry'
import type { PlanRoom } from '../../floorplan/types'
import { roomFacingWallSide } from './PlanWallFace'

/** Two rooms either side of a wall running along world Z at x = 3. */
const left = { id: 'left', name: 'Left', origin: [0, 0], width: 3, depth: 4 } as PlanRoom
const right = { id: 'right', name: 'Right', origin: [3, 0], width: 3, depth: 4 } as PlanRoom
const rooms = [left, right]

/** A wall box centred on the shared edge, length along world Z (angle 0 puts
 *  local +Z on world +Z, so local +X is world +X). */
const box: Pick<WallBox, 'cx' | 'cz' | 'angle' | 'thickness'> = {
  cx: 3,
  cz: 2,
  angle: 0,
  thickness: 0.1,
}

describe('roomFacingWallSide', () => {
  it('resolves each side to the room actually in front of it', () => {
    expect(roomFacingWallSide(rooms, box, 1)?.id).toBe('right')
    expect(roomFacingWallSide(rooms, box, -1)?.id).toBe('left')
  })

  it('returns null for an exterior face — no room, no finish plane', () => {
    // Perimeter wall at x = 0: its -X side faces outdoors.
    const perimeter = { ...box, cx: 0 }
    expect(roomFacingWallSide(rooms, perimeter, -1)).toBeNull()
    expect(roomFacingWallSide(rooms, perimeter, 1)?.id).toBe('left')
  })

  it('follows the wall heading, not a world axis', () => {
    // Same wall rotated 90°: it now runs along X at z = 2, so the sides face
    // ±Z. `angle` is the box's Y rotation (local +Z along the wall).
    const along = [
      { id: 'north', name: 'N', origin: [0, 0], width: 6, depth: 2 } as PlanRoom,
      { id: 'south', name: 'S', origin: [0, 2], width: 6, depth: 2 } as PlanRoom,
    ]
    const rotated = { cx: 3, cz: 2, angle: Math.PI / 2, thickness: 0.1 }
    expect(roomFacingWallSide(along, rotated, 1)?.id).toBe('north')
    expect(roomFacingWallSide(along, rotated, -1)?.id).toBe('south')
  })

  it('handles a polygon room (pointInRoom, not a bbox test)', () => {
    // An L that does NOT cover the probe point even though its bbox does.
    const lShape = {
      id: 'l',
      name: 'L',
      origin: [3, 0],
      width: 3,
      depth: 4,
      polygon: [
        [3, 2],
        [6, 2],
        [6, 4],
        [3, 4],
      ],
    } as PlanRoom
    // Probe for side +1 lands at (3.2, 2) — inside the polygon's lower edge…
    expect(roomFacingWallSide([lShape], box, 1)?.id).toBe('l')
    // …but a box further up the wall probes into the notch, which is outside.
    expect(roomFacingWallSide([lShape], { ...box, cz: 0.5 }, 1)).toBeNull()
  })
})
