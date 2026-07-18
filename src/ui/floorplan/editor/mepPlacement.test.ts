import { describe, expect, it } from 'vitest'
import type { PlanVec2, PlanWall } from '../../../floorplan/types'
import { MEP_WALL_SNAP_THRESHOLD_M, snapMepPointToWall } from './mepPlacement'

const wall = (id: string, start: PlanVec2, end: PlanVec2): PlanWall => ({
  id,
  start,
  end,
  thickness: 'internal',
})

describe('snapMepPointToWall', () => {
  it('passes the raw point through unsnapped when there are no walls (hit=null)', () => {
    const res = snapMepPointToWall([2, 3], null, 0.1)
    expect(res).toEqual({ x: 2, z: 3, snapped: false, wallId: null })
  })

  it('snaps onto the wall face when within the threshold — horizontal wall along X', () => {
    // Wall centreline at z=0, thickness 0.2 (half = 0.1). Click at (2, 0.1) —
    // 0.1m from the centreline, on the +Z side.
    const w = wall('w1', [0, 0], [4, 0])
    const res = snapMepPointToWall([2, 0.1], { wall: w, offset: 2, dist: 0.1 }, 0.2)
    expect(res.snapped).toBe(true)
    expect(res.wallId).toBe('w1')
    expect(res.x).toBeCloseTo(2, 6)
    // Pushed onto the +Z face at half-thickness from the centreline.
    expect(res.z).toBeCloseTo(0.1, 6)
  })

  it('snaps to the opposite face when clicked from the other side', () => {
    const w = wall('w1', [0, 0], [4, 0])
    const res = snapMepPointToWall([2, -0.05], { wall: w, offset: 2, dist: 0.05 }, 0.2)
    expect(res.snapped).toBe(true)
    expect(res.z).toBeCloseTo(-0.1, 6)
  })

  it('snaps onto a vertical wall (along Z)', () => {
    const w = wall('w1', [0, 0], [0, 4])
    // Click 0.05m to the +X side, 1.5m along the wall.
    const res = snapMepPointToWall([0.05, 1.5], { wall: w, offset: 1.5, dist: 0.05 }, 0.3)
    expect(res.snapped).toBe(true)
    expect(res.x).toBeCloseTo(0.15, 6)
    expect(res.z).toBeCloseTo(1.5, 6)
  })

  it('passes through unsnapped when the hit is farther than the threshold', () => {
    const w = wall('w1', [0, 0], [4, 0])
    const res = snapMepPointToWall(
      [2, 0.3],
      { wall: w, offset: 2, dist: 0.3 },
      0.2,
      MEP_WALL_SNAP_THRESHOLD_M,
    )
    expect(res).toEqual({ x: 2, z: 0.3, snapped: false, wallId: null })
  })

  it('boundary: exactly at the default threshold snaps (inclusive)', () => {
    const w = wall('w1', [0, 0], [4, 0])
    const res = snapMepPointToWall(
      [2, MEP_WALL_SNAP_THRESHOLD_M],
      { wall: w, offset: 2, dist: MEP_WALL_SNAP_THRESHOLD_M },
      0.2,
    )
    expect(res.snapped).toBe(true)
  })

  it('boundary: just over the default threshold does not snap', () => {
    const w = wall('w1', [0, 0], [4, 0])
    const dist = MEP_WALL_SNAP_THRESHOLD_M + 0.001
    const res = snapMepPointToWall([2, dist], { wall: w, offset: 2, dist }, 0.2)
    expect(res.snapped).toBe(false)
  })

  it('a zero-length wall is treated as unsnappable (no direction to project onto)', () => {
    const w = wall('w1', [1, 1], [1, 1])
    const res = snapMepPointToWall([1, 1.05], { wall: w, offset: 0, dist: 0.05 }, 0.2)
    expect(res.snapped).toBe(true) // still marked snapped (within threshold)…
    expect(res.x).toBeCloseTo(1, 6) // …but the point degenerates to the raw click.
    expect(res.z).toBeCloseTo(1.05, 6)
  })

  it('respects a custom threshold override', () => {
    const w = wall('w1', [0, 0], [4, 0])
    const res = snapMepPointToWall([2, 0.15], { wall: w, offset: 2, dist: 0.15 }, 0.2, 0.1)
    expect(res.snapped).toBe(false)
  })
})
