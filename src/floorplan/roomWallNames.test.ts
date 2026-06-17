import { describe, expect, it } from 'vitest'
import { assignRoomWallNames, roomBoundaryEdges } from './roomWallNames'
import type { PlanRoom, PlanWall } from './types'

const wall = (id: string, start: [number, number], end: [number, number]): PlanWall => ({
  id,
  start,
  end,
  thickness: 'internal',
})

// A 4×3 rectangular room and the four walls tracing its boundary.
const room: PlanRoom = { id: 'r1', name: 'Living', origin: [0, 0], width: 4, depth: 3 }
const boundaryWalls = [
  wall('top', [0, 0], [4, 0]),
  wall('right', [4, 0], [4, 3]),
  wall('bottom', [4, 3], [0, 3]),
  wall('left', [0, 3], [0, 0]),
]

describe('roomBoundaryEdges', () => {
  it('returns the four rectangle edges in order', () => {
    expect(roomBoundaryEdges(room)).toHaveLength(4)
  })

  it('uses the polygon edges when present', () => {
    const poly: PlanRoom = {
      ...room,
      polygon: [
        [0, 0],
        [2, 0],
        [2, 2],
        [0, 2],
      ],
    }
    expect(roomBoundaryEdges(poly)).toHaveLength(4)
  })
})

describe('assignRoomWallNames', () => {
  it('names each boundary wall `<room> wall NN` in order', () => {
    const names = assignRoomWallNames(boundaryWalls, room)
    expect(names).toEqual([
      { id: 'top', name: 'Living wall 01' },
      { id: 'right', name: 'Living wall 02' },
      { id: 'bottom', name: 'Living wall 03' },
      { id: 'left', name: 'Living wall 04' },
    ])
  })

  it('ignores walls that are not on the boundary', () => {
    const inner = [...boundaryWalls, wall('inner', [1, 1], [3, 1])]
    const names = assignRoomWallNames(inner, room)
    expect(names.find((a) => a.id === 'inner')).toBeUndefined()
    expect(names).toHaveLength(4)
  })

  it('matches a wall slightly offset from the interior rectangle (within tol)', () => {
    // Top wall sitting 0.1 m outside the room rectangle still counts.
    const offset = [wall('top', [0, -0.1], [4, -0.1])]
    expect(assignRoomWallNames(offset, room)).toEqual([{ id: 'top', name: 'Living wall 01' }])
  })
})
