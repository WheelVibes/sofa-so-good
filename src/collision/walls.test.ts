import { describe, expect, it } from 'vitest'
import { type CollisionWall, resolveMovement } from './walls'

const wallNS = (x: number, z0: number, z1: number): CollisionWall => ({
  ax: x,
  az: z0,
  bx: x,
  bz: z1,
  thickness: 0.1,
})

const wallEW = (z: number, x0: number, x1: number): CollisionWall => ({
  ax: x0,
  az: z,
  bx: x1,
  bz: z,
  thickness: 0.1,
})

describe('resolveMovement', () => {
  const r = 0.25

  it('passes through a clear path unchanged', () => {
    const next = resolveMovement([0, 0], [0.5, 0], r, [])
    expect(next).toEqual([0.5, 0])
  })

  it('clamps movement to stop short of a wall in front', () => {
    const wall = wallNS(1, -2, 2)
    const next = resolveMovement([0, 0], [1.0, 0], r, [wall])
    expect(next[0]).toBeCloseTo(1 - r, 3)
    expect(next[1]).toBeCloseTo(0, 3)
  })

  it('allows sliding along a wall when moving diagonally into it', () => {
    const wall = wallNS(1, -2, 2)
    const next = resolveMovement([0, 0], [1.5, 0.5], r, [wall])
    expect(next[0]).toBeCloseTo(1 - r, 3)
    expect(next[1]).toBeCloseTo(0.5, 3)
  })

  it('blocks at perpendicular E/W wall', () => {
    const wall = wallEW(1, -2, 2)
    const next = resolveMovement([0, 0], [0, 1.5], r, [wall])
    expect(next[1]).toBeCloseTo(1 - r, 3)
  })

  it('does not block movement past wall endpoints', () => {
    const wall = wallNS(1, 0, 0.4)
    const next = resolveMovement([0, 2], [2, 2], r, [wall])
    expect(next[0]).toBeCloseTo(2, 3)
    expect(next[1]).toBeCloseTo(2, 3)
  })
})
