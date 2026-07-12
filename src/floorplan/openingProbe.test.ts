import { describe, expect, it } from 'vitest'
import {
  openingCenter,
  openingProbePoints,
  roomsAcrossOpening,
  wallNormal,
  wallTangent,
} from './openingProbe'
import type { PlanOpening, PlanRoom, PlanWall } from './types'

// A horizontal wall from (0,0)→(4,0): tangent +x, normal +z ([0,1]).
const wall = (start: [number, number], end: [number, number]): PlanWall => ({
  id: 'w1',
  start,
  end,
  thickness: 'internal',
})

const opening = (offset: number, width: number): PlanOpening => ({
  id: 'op1',
  kind: 'door',
  wallId: 'w1',
  offset,
  width,
  sill: 0,
  head: 2.1,
})

const rect = (id: string, ox: number, oz: number, w: number, d: number): PlanRoom => ({
  id,
  name: id,
  origin: [ox, oz],
  width: w,
  depth: d,
})

describe('openingProbe primitives', () => {
  it('wallTangent is the unit start→end direction', () => {
    expect(wallTangent(wall([0, 0], [4, 0]))).toEqual([1, 0])
    expect(wallTangent(wall([0, 0], [0, 2]))).toEqual([0, 1])
  })

  it('wallNormal is the tangent rotated +90° ([-t.z, t.x])', () => {
    const nh = wallNormal(wall([0, 0], [4, 0]))!
    expect(nh[0]).toBeCloseTo(0, 12) // horizontal wall → normal +z
    expect(nh[1]).toBeCloseTo(1, 12)
    expect(wallNormal(wall([0, 0], [0, 2]))).toEqual([-1, 0])
  })

  it('returns null for a zero-length (degenerate) wall', () => {
    const deg = wall([1, 1], [1, 1])
    expect(wallTangent(deg)).toBeNull()
    expect(wallNormal(deg)).toBeNull()
    expect(openingCenter(opening(1, 1), deg)).toBeNull()
    expect(openingProbePoints(deg, opening(1, 1), 0.2)).toBeNull()
    expect(roomsAcrossOpening([], deg, opening(1, 1), 0.2)).toBeNull()
  })

  it('openingCenter sits at offset + width/2 along the wall', () => {
    // offset 1.5 + width 1 / 2 = 2 → centre (2, 0).
    expect(openingCenter(opening(1.5, 1), wall([0, 0], [4, 0]))).toEqual([2, 0])
  })

  it('openingCenter clamps into [0, len] only when asked', () => {
    // offset 5 + width 2 / 2 = 6, wall length 4.
    const w = wall([0, 0], [4, 0])
    expect(openingCenter(opening(5, 2), w, false)).toEqual([6, 0]) // raw, overruns
    expect(openingCenter(opening(5, 2), w, true)).toEqual([4, 0]) // clamped to far jamb
  })
})

describe('openingProbePoints', () => {
  it('places the ± probes on either side of the centre along the normal', () => {
    const probe = openingProbePoints(wall([0, 0], [4, 0]), opening(1.5, 1), 0.2)!
    expect(probe.center).toEqual([2, 0])
    expect(probe.normal[0]).toBeCloseTo(0, 12)
    expect(probe.normal[1]).toBeCloseTo(1, 12)
    expect(probe.plus[0]).toBeCloseTo(2, 12) // +normal side
    expect(probe.plus[1]).toBeCloseTo(0.2, 12)
    expect(probe.minus[0]).toBeCloseTo(2, 12) // −normal side
    expect(probe.minus[1]).toBeCloseTo(-0.2, 12)
  })
})

describe('roomsAcrossOpening', () => {
  // Two rooms sharing the horizontal wall at z = 0:
  //   A above (z ∈ [0,3]) on the +normal side, B below (z ∈ [-3,0]) on the −normal side.
  const roomA = rect('A', 0, 0, 4, 3)
  const roomB = rect('B', 0, -3, 4, 3)

  it('returns BOTH rooms with correct sides for a shared interior wall', () => {
    const across = roomsAcrossOpening([roomA, roomB], wall([0, 0], [4, 0]), opening(1.5, 1), 0.2)!
    expect(across.plus?.id).toBe('A') // +normal (+z) side
    expect(across.minus?.id).toBe('B') // −normal (−z) side
    expect(across.center).toEqual([2, 0])
  })

  it('returns one room (other side null) for an exterior wall', () => {
    const across = roomsAcrossOpening([roomA], wall([0, 0], [4, 0]), opening(1.5, 1), 0.2)!
    expect(across.plus?.id).toBe('A')
    expect(across.minus).toBeNull()
  })

  it('honours the offset sign convention (plus is the +normal side)', () => {
    // Only a room on the −normal side → minus set, plus null.
    const across = roomsAcrossOpening([roomB], wall([0, 0], [4, 0]), opening(1.5, 1), 0.2)!
    expect(across.plus).toBeNull()
    expect(across.minus?.id).toBe('B')
  })

  it('a larger offset probes further from the wall', () => {
    // Room A starts 0.5 m off the wall (z ∈ [0.5, 3.5]); a 0.2 m probe misses it,
    // a 0.6 m probe lands inside.
    const gapRoom = rect('G', 0, 0.5, 4, 3)
    const near = roomsAcrossOpening([gapRoom], wall([0, 0], [4, 0]), opening(1.5, 1), 0.2)!
    const far = roomsAcrossOpening([gapRoom], wall([0, 0], [4, 0]), opening(1.5, 1), 0.6)!
    expect(near.plus).toBeNull()
    expect(far.plus?.id).toBe('G')
  })
})
