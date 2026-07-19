import { describe, expect, it } from 'vitest'
import type { AiOpening, AiWall } from './floorPlanAi'
import { placeAiOpenings, shouldApplyAiScale } from './floorPlanAiPlacement'

// A single 4 m wall along +X from the origin (z = 0).
const WALL: AiWall = { x1: 0, z1: 0, x2: 4, z2: 0 }

describe('placeAiOpenings', () => {
  it('snaps a centre point onto the nearest wall and derives the along-wall offset', () => {
    const door: AiOpening = { kind: 'door', x: 2, z: 0, width: 0.9 }
    const [p] = placeAiOpenings([WALL], [door])
    expect(p.wallIndex).toBe(0)
    expect(p.kind).toBe('door')
    // centre at 2 m along → offset = 2 - width/2.
    expect(p.offset).toBeCloseTo(2 - 0.45, 6)
    expect(p.width).toBeCloseTo(0.9, 6)
    expect(p.sill).toBe(0)
    expect(p.head).toBe(2.1)
  })

  it('gives a window a 0.9 m sill (door defaults to floor)', () => {
    const [p] = placeAiOpenings([WALL], [{ kind: 'window', x: 2, z: 0, width: 1.2 }])
    expect(p.sill).toBe(0.9)
    expect(p.head).toBe(2.1)
  })

  it('picks the nearest of several walls', () => {
    // A second wall along z at x = 4. A point near (4, 2) is closest to it.
    const wallB: AiWall = { x1: 4, z1: 0, x2: 4, z2: 4 }
    const [p] = placeAiOpenings([WALL, wallB], [{ kind: 'door', x: 3.9, z: 2, width: 0.9 }])
    expect(p.wallIndex).toBe(1)
    expect(p.offset).toBeCloseTo(2 - 0.45, 6)
  })

  it('drops an opening too far from any wall', () => {
    // 2 m off the wall, well past the 0.9 m default snap distance.
    expect(placeAiOpenings([WALL], [{ kind: 'door', x: 2, z: 2, width: 0.9 }])).toEqual([])
  })

  it('respects a custom snap distance', () => {
    // 0.95 m off the wall — past the 0.9 m default, inside a 1 m override.
    const near: AiOpening = { kind: 'door', x: 2, z: 0.95, width: 0.9 }
    expect(placeAiOpenings([WALL], [near])).toEqual([])
    expect(placeAiOpenings([WALL], [near], { maxSnapDist: 1 })).toHaveLength(1)
  })

  it('clamps width + offset to keep the opening inside a short wall', () => {
    const shortWall: AiWall = { x1: 0, z1: 0, x2: 1, z2: 0 }
    const [p] = placeAiOpenings([shortWall], [{ kind: 'door', x: 0.5, z: 0, width: 3 }])
    // Width clamped to the wall, offset non-negative and within the span.
    expect(p.width).toBeLessThanOrEqual(1)
    expect(p.offset).toBeGreaterThanOrEqual(0)
    expect(p.offset + p.width).toBeLessThanOrEqual(1 + 1e-9)
  })

  it('skips zero-length walls when snapping', () => {
    const degenerate: AiWall = { x1: 1, z1: 0, x2: 1, z2: 0 }
    const [p] = placeAiOpenings([degenerate, WALL], [{ kind: 'door', x: 2, z: 0, width: 0.9 }])
    expect(p.wallIndex).toBe(1)
  })

  it('returns [] for empty inputs', () => {
    expect(placeAiOpenings([], [{ kind: 'door', x: 0, z: 0, width: 0.9 }])).toEqual([])
    expect(placeAiOpenings([WALL], [])).toEqual([])
  })
})

describe('shouldApplyAiScale', () => {
  it('applies a valid scale when not already calibrated', () => {
    expect(shouldApplyAiScale(0.02, false)).toBe(true)
  })

  it('never overwrites a manual calibration', () => {
    expect(shouldApplyAiScale(0.02, true)).toBe(false)
  })

  it('rejects an absent / non-positive / non-finite scale', () => {
    expect(shouldApplyAiScale(undefined, false)).toBe(false)
    expect(shouldApplyAiScale(0, false)).toBe(false)
    expect(shouldApplyAiScale(-1, false)).toBe(false)
    expect(shouldApplyAiScale(Number.NaN, false)).toBe(false)
  })
})
