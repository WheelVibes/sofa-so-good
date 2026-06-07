import { describe, expect, it } from 'vitest'
import type { Aabb } from './clearanceGap'
import { wallSnapOffset } from './wallSnap'
import type { CollisionWall } from './walls'

// A vertical wall (faces along X) at x=0, spanning z=[0,5], thickness 0.1 → face at +0.05.
const vWall: CollisionWall = { ax: 0, az: 0, bx: 0, bz: 5, thickness: 0.1 }
// A horizontal wall (faces along Z) at z=10, spanning x=[0,5], thickness 0.1 → face at 9.95.
const hWall: CollisionWall = { ax: 0, az: 10, bx: 5, bz: 10, thickness: 0.1 }

const box = (x0: number, z0: number, x1: number, z1: number): Aabb => ({ x0, z0, x1, z1 })

describe('wallSnapOffset', () => {
  it('pulls an item flush to a wall on its −X side', () => {
    // box left edge at x0=0.10, wall face at 0.05 → gap 0.05 → snap −0.05.
    const { dx, dz } = wallSnapOffset(box(0.1, 1, 1.1, 2), [vWall])
    expect(dx).toBeCloseTo(-0.05, 5)
    expect(dz).toBe(0)
  })

  it('ignores a wall outside the snap radius', () => {
    const { dx, dz } = wallSnapOffset(box(0.5, 1, 1.5, 2), [vWall]) // gap 0.45 > 0.12
    expect(dx).toBe(0)
    expect(dz).toBe(0)
  })

  it('corner-snaps to two perpendicular walls at once', () => {
    // A vertical wall tall enough to reach the corner, plus the +Z wall.
    const vTall: CollisionWall = { ax: 0, az: 0, bx: 0, bz: 12, thickness: 0.1 }
    // Near the −X wall (face 0.05) and the +Z wall (face 9.95).
    const { dx, dz } = wallSnapOffset(box(0.1, 9.85, 1.1, 9.88), [vTall, hWall])
    expect(dx).toBeCloseTo(-0.05, 5) // flush to vertical wall
    expect(dz).toBeCloseTo(0.07, 5) // box z1=9.88 → face 9.95, gap 0.07
  })

  it('does not snap to a wall the item does not face (outside its span)', () => {
    // Item at z=[20,21] is beyond the vertical wall's z-span [0,5].
    const { dx } = wallSnapOffset(box(0.1, 20, 1.1, 21), [vWall])
    expect(dx).toBe(0)
  })

  it('picks the nearest wall when several are in range', () => {
    const near: CollisionWall = { ax: 0, az: 0, bx: 0, bz: 5, thickness: 0.1 } // face 0.05
    const nearer: CollisionWall = { ax: 0.08, az: 0, bx: 0.08, bz: 5, thickness: 0.1 } // face 0.13
    // box left edge at 0.15 → gaps 0.10 (near) and 0.02 (nearer) → snap −0.02.
    const { dx } = wallSnapOffset(box(0.15, 1, 1.15, 2), [near, nearer])
    expect(dx).toBeCloseTo(-0.02, 5)
  })
})
