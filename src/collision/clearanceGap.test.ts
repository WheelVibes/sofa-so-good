import { describe, expect, it } from 'vitest'
import { nearestWallGap, wallGapsPerSide } from './clearanceGap'
import type { CollisionWall } from './walls'

// A 4×3 m room: walls at x=0, x=4 (vertical) and z=0, z=3 (horizontal), 0.1 thick.
const room: CollisionWall[] = [
  { ax: 0, az: 0, bx: 0, bz: 3, thickness: 0.1 },
  { ax: 4, az: 0, bx: 4, bz: 3, thickness: 0.1 },
  { ax: 0, az: 0, bx: 4, bz: 0, thickness: 0.1 },
  { ax: 0, az: 3, bx: 4, bz: 3, thickness: 0.1 },
]

describe('nearestWallGap', () => {
  it('measures the gap to the closest wall face', () => {
    // Item 1×1 centred at (1, 1.5): edges at x0=0.5; west wall face at x=0.05.
    const gap = nearestWallGap({ x0: 0.5, z0: 1.0, x1: 1.5, z1: 2.0 }, room)
    expect(gap).toBeCloseTo(0.45, 5) // 0.5 - 0.05
  })

  it('returns 0 when flush against a wall', () => {
    const gap = nearestWallGap({ x0: 0.05, z0: 1.0, x1: 1.05, z1: 2.0 }, room)
    expect(gap).toBe(0)
  })

  it('returns null with no facing walls', () => {
    expect(nearestWallGap({ x0: 0.5, z0: 1, x1: 1.5, z1: 2 }, [])).toBeNull()
  })
})

describe('wallGapsPerSide', () => {
  it('reports the nearest gap on each side independently', () => {
    // 1×1 item centred at (1, 1.5): edges x0=0.5,x1=1.5,z0=1,z1=2.
    const g = wallGapsPerSide({ x0: 0.5, z0: 1.0, x1: 1.5, z1: 2.0 }, room)
    // west wall x=0 face 0.05 → left gap 0.45; east wall x=4 face 3.95 → right 2.45
    expect(g.left).toBeCloseTo(0.45, 5)
    expect(g.right).toBeCloseTo(2.45, 5)
    // north wall z=0 face 0.05 → back gap 0.95; south wall z=3 face 2.95 → front 0.95
    expect(g.back).toBeCloseTo(0.95, 5)
    expect(g.front).toBeCloseTo(0.95, 5)
  })

  it('clamps a touch (flush) to 0 on the touching side only', () => {
    // Flush to the west wall: left edge at the face.
    const g = wallGapsPerSide({ x0: 0.05, z0: 1.0, x1: 1.05, z1: 2.0 }, room)
    expect(g.left).toBe(0)
    expect(g.right).toBeCloseTo(2.9, 5) // 3.95 - 1.05
  })

  it('leaves a side null when no wall faces it', () => {
    const g = wallGapsPerSide({ x0: 0.5, z0: 1, x1: 1.5, z1: 2 }, [])
    expect(g).toEqual({ left: null, right: null, back: null, front: null })
  })

  it('keeps the closest of several walls per side', () => {
    // Two vertical walls to the left at x=0 and x=1 — nearer (x=1) wins.
    const walls: CollisionWall[] = [
      { ax: 0, az: 0, bx: 0, bz: 3, thickness: 0.1 },
      { ax: 1, az: 0, bx: 1, bz: 3, thickness: 0.1 },
    ]
    const g = wallGapsPerSide({ x0: 1.5, z0: 1, x1: 2.5, z1: 2 }, walls)
    expect(g.left).toBeCloseTo(0.45, 5) // 1.5 - (1 + 0.05)
  })

  it('ignores walls the item does not face along the perpendicular axis', () => {
    // Vertical wall only spans z 5..6; item at z 1..2 is not in front of it.
    const walls: CollisionWall[] = [{ ax: 0, az: 5, bx: 0, bz: 6, thickness: 0.1 }]
    const g = wallGapsPerSide({ x0: 0.5, z0: 1, x1: 1.5, z1: 2 }, walls)
    expect(g.left).toBeNull()
  })
})
