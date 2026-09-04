/**
 * The RENDER side of the per-room texture transform (F13).
 *
 * v0.31.5.382 fixed the CONTROL (`ui/finish/DirectionRow.tsx`) to find an
 * upstairs room, and left this half reading `plan.rooms` — so a user could set
 * an upstairs room's texture angle, see the control accept it, and see nothing
 * change in 3D. Half-fixing was worse than not fixing: a control that visibly
 * does nothing reads as a broken app, where a missing control reads as a
 * missing feature.
 */
import { describe, expect, it } from 'vitest'
import type { FloorPlan } from '../../floorplan/types'
import { wallTexTransformFor } from './wallTexTransform'

function twoStorey(): FloorPlan {
  return {
    id: 'p',
    name: 'p',
    extent: [6, 5],
    ceilingHeight: 2.6,
    walls: [],
    openings: [],
    rooms: [{ id: 'g-live', name: 'Living', origin: [0, 0], width: 6, depth: 5 }],
    upperLevels: [
      {
        id: 'upper',
        name: 'Upper',
        elevation: 3,
        walls: [],
        openings: [],
        rooms: [
          {
            id: 'u-bed',
            name: 'Bedroom',
            origin: [0, 0],
            width: 4,
            depth: 3,
            wallTexAngle: 45,
            wallTexScale: 2,
          },
        ],
      },
    ],
  } as unknown as FloorPlan
}

describe('wallTexTransformFor', () => {
  it("resolves an UPSTAIRS room's texture transform", () => {
    expect(wallTexTransformFor(twoStorey(), 'u-bed')).toEqual({ angle: 45, scale: 2 })
  })

  it('returns undefined for a room with no transform set', () => {
    expect(wallTexTransformFor(twoStorey(), 'g-live')).toBeUndefined()
  })

  it('returns undefined for an unknown room id rather than throwing', () => {
    expect(wallTexTransformFor(twoStorey(), 'nope')).toBeUndefined()
    expect(wallTexTransformFor(twoStorey(), undefined)).toBeUndefined()
  })
})
