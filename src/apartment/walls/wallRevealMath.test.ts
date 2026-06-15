import { describe, expect, it } from 'vitest'
import {
  orientOutward,
  pointInRooms,
  type RoomRect,
  smoothstep,
  wallRevealFactor,
} from './wallRevealMath'

// A single 4×4 room with its NW interior corner at the origin.
const room: RoomRect[] = [{ x: 0, z: 0, w: 4, d: 4 }]

describe('orientOutward', () => {
  it('orients a north-edge wall normal outward (away from the room)', () => {
    // Wall along X at z=0; candidate normal +Z points into the room.
    const out = orientOutward(2, 0, 0, 1, (x, z) => pointInRooms(x, z, room))
    expect(out).toEqual({ nx: -0, nz: -1 }) // outward = −Z (north)
  })

  it('orients a west-edge wall normal outward', () => {
    const out = orientOutward(0, 2, 1, 0, (x, z) => pointInRooms(x, z, room))
    expect(out).toEqual({ nx: -1, nz: -0 }) // outward = −X (west)
  })

  it('returns null for an internal wall between two rooms (never fades)', () => {
    const two: RoomRect[] = [
      { x: 0, z: 0, w: 4, d: 4 },
      { x: 4, z: 0, w: 4, d: 4 },
    ]
    // Wall along Z at x=4 with a room on each side.
    expect(orientOutward(4, 2, 1, 0, (x, z) => pointInRooms(x, z, two))).toBeNull()
  })

  it('returns null when neither side is interior (ambiguous)', () => {
    expect(orientOutward(20, 20, 0, 1, (x, z) => pointInRooms(x, z, room))).toBeNull()
  })

  it('works for an L-shaped plan where a bbox centre would be unreliable', () => {
    // L-shape: two rooms forming an L; the bbox centre (3,3) sits in the notch
    // (outside both rooms), which would mis-orient the old centre heuristic.
    const L: RoomRect[] = [
      { x: 0, z: 0, w: 2, d: 6 }, // tall left arm
      { x: 0, z: 4, w: 6, d: 2 }, // bottom arm
    ]
    expect(pointInRooms(3, 3, L)).toBe(false) // bbox-centre is in the notch
    // North wall of the bottom arm's far-east stub (along X at z=4, x≈4..6):
    // mid (5,4), candidate +Z is inside the bottom arm → outward is −Z (north).
    const out = orientOutward(5, 4, 0, 1, (x, z) => pointInRooms(x, z, L))
    expect(out).toEqual({ nx: -0, nz: -1 })
  })
})

describe('wallRevealFactor', () => {
  // North wall: mid (2,0), outward −Z.
  it('fades (→0) when the camera is on the outward side', () => {
    expect(wallRevealFactor(2, -5, 2, 0, 0, -1)).toBeCloseTo(0)
  })

  it('stays opaque (→1) when the camera is on the interior side', () => {
    expect(wallRevealFactor(2, 5, 2, 0, 0, -1)).toBeCloseTo(1)
  })

  it('partially fades for a grazing/side view', () => {
    const f = wallRevealFactor(7, 0, 2, 0, 0, -1) // camera due-east, wall faces north
    expect(f).toBeGreaterThan(0.2)
    expect(f).toBeLessThan(0.8)
  })

  it('is independent of distance (only the direction matters)', () => {
    expect(wallRevealFactor(2, -3, 2, 0, 0, -1)).toBeCloseTo(wallRevealFactor(2, -30, 2, 0, 0, -1))
  })
})

describe('pointInRooms', () => {
  it('detects points inside the rect and its L-extension', () => {
    const r: RoomRect[] = [{ x: 0, z: 0, w: 2, d: 2, ext: { x: 2, z: 0, w: 2, d: 1 } }]
    expect(pointInRooms(1, 1, r)).toBe(true)
    expect(pointInRooms(3, 0.5, r)).toBe(true) // in extension
    expect(pointInRooms(3, 1.5, r)).toBe(false) // outside both
  })

  it('honours the pad', () => {
    expect(pointInRooms(-0.04, 1, room, 0.05)).toBe(true)
    expect(pointInRooms(-0.04, 1, room, 0)).toBe(false)
  })
})

describe('smoothstep', () => {
  it('clamps and ramps', () => {
    expect(smoothstep(0, 1, -1)).toBe(0)
    expect(smoothstep(0, 1, 2)).toBe(1)
    expect(smoothstep(0, 1, 0.5)).toBeCloseTo(0.5)
  })
})
