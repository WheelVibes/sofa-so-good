import { describe, expect, it } from 'vitest'
import { type AimSegment, nearestAimedSegment } from './aimRay'

const seg = (id: string, sx: number, sz: number, segDx: number, segDz: number): AimSegment => ({
  id,
  sx,
  sz,
  segDx,
  segDz,
})

const neverBlocked = () => false

describe('nearestAimedSegment', () => {
  it('hits a segment directly ahead, within range', () => {
    // Segment spans x∈[-1,1] at z=5; looking straight down +Z from origin.
    const segments = [seg('door', -1, 5, 2, 0)]
    expect(nearestAimedSegment(0, 0, 0, 1, segments, 10, neverBlocked)).toBe('door')
  })

  it('returns null when nothing is within maxDist', () => {
    const segments = [seg('door', -1, 5, 2, 0)]
    expect(nearestAimedSegment(0, 0, 0, 1, segments, 2, neverBlocked)).toBeNull()
  })

  it('returns null when the ray passes outside the segment span (u out of [0,1])', () => {
    // Segment spans x∈[3,5] at z=5 — straight-ahead ray at x=0 misses it.
    const segments = [seg('door', 3, 5, 2, 0)]
    expect(nearestAimedSegment(0, 0, 0, 1, segments, 10, neverBlocked)).toBeNull()
  })

  it('returns null when the hit is behind the ray origin (t<=0)', () => {
    const segments = [seg('door', -1, -5, 2, 0)]
    expect(nearestAimedSegment(0, 0, 0, 1, segments, 10, neverBlocked)).toBeNull()
  })

  it('picks the nearer of two segments in range', () => {
    const near = seg('near', -1, 3, 2, 0)
    const far = seg('far', -1, 6, 2, 0)
    expect(nearestAimedSegment(0, 0, 0, 1, [far, near], 10, neverBlocked)).toBe('near')
  })

  it('skips a segment whose hit point is line-of-sight blocked', () => {
    const segments = [seg('door', -1, 5, 2, 0)]
    const blocked = () => true
    expect(nearestAimedSegment(0, 0, 0, 1, segments, 10, blocked)).toBeNull()
  })

  it('falls through to a farther unblocked segment when the nearer one is blocked', () => {
    const near = seg('near', -1, 3, 2, 0)
    const far = seg('far', -1, 6, 2, 0)
    const blocked = (_hitX: number, hitZ: number) => hitZ < 4
    expect(nearestAimedSegment(0, 0, 0, 1, [near, far], 10, blocked)).toBe('far')
  })
})
