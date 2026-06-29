import { describe, expect, it } from 'vitest'
import { applyWallFillet } from './filletWalls'
import type { PlanWall } from './types'

/** A clean 90° corner at the origin: wallA runs origin→[4,0], wallB runs
 *  origin→[0,4]; they share the origin as their `start`. */
function ellCorner(): PlanWall[] {
  return [
    { id: 'a', start: [0, 0], end: [4, 0], thickness: 'internal' },
    { id: 'b', start: [0, 0], end: [0, 4], thickness: 'internal' },
  ]
}

describe('applyWallFillet — bevel', () => {
  it('trims both walls to equal setback and inserts a straight connector', () => {
    const out = applyWallFillet(ellCorner(), 'a', 'b', 1, 'bevel')
    expect(out).not.toBeNull()
    if (!out) return
    expect(out).toHaveLength(3)
    const a = out.find((w) => w.id === 'a')!
    const b = out.find((w) => w.id === 'b')!
    const conn = out.find((w) => w.id === 'a__fillet')!

    // wallA's shared end (start) moved to [1,0]; far end untouched.
    expect(a.start[0]).toBeCloseTo(1, 9)
    expect(a.start[1]).toBeCloseTo(0, 9)
    expect(a.end).toEqual([4, 0])
    // wallB's shared end (start) moved to [0,1]; far end untouched.
    expect(b.start[0]).toBeCloseTo(0, 9)
    expect(b.start[1]).toBeCloseTo(1, 9)
    expect(b.end).toEqual([0, 4])

    // Connector endpoints equal the two setback points; straight (no arc).
    expect(conn.start[0]).toBeCloseTo(1, 9)
    expect(conn.start[1]).toBeCloseTo(0, 9)
    expect(conn.end[0]).toBeCloseTo(0, 9)
    expect(conn.end[1]).toBeCloseTo(1, 9)
    expect(conn.arc).toBeUndefined()
    expect(conn.thickness).toBe('internal')
  })

  it('does not mutate the input array or walls', () => {
    const input = ellCorner()
    const snapshot = JSON.parse(JSON.stringify(input))
    applyWallFillet(input, 'a', 'b', 1, 'bevel')
    expect(input).toEqual(snapshot)
  })

  it('inherits the connector thickness/thicknessM/color from wallA', () => {
    const walls: PlanWall[] = [
      {
        id: 'a',
        start: [0, 0],
        end: [4, 0],
        thickness: 'external',
        thicknessM: 0.25,
        color: '#abc',
      },
      { id: 'b', start: [0, 0], end: [0, 4], thickness: 'internal' },
    ]
    const out = applyWallFillet(walls, 'a', 'b', 1, 'bevel')!
    const conn = out.find((w) => w.id === 'a__fillet')!
    expect(conn.thickness).toBe('external')
    expect(conn.thicknessM).toBe(0.25)
    expect(conn.color).toBe('#abc')
  })
})

describe('applyWallFillet — round', () => {
  it('inserts a curved connector whose endpoints are the tangent points', () => {
    const out = applyWallFillet(ellCorner(), 'a', 'b', 1, 'round')
    expect(out).not.toBeNull()
    if (!out) return
    const conn = out.find((w) => w.id === 'a__fillet')!
    // tangentDist = r/tan(45°) = 1 → tangent points [1,0] and [0,1].
    expect(conn.start[0]).toBeCloseTo(1, 9)
    expect(conn.start[1]).toBeCloseTo(0, 9)
    expect(conn.end[0]).toBeCloseTo(0, 9)
    expect(conn.end[1]).toBeCloseTo(1, 9)
  })

  it('arc magnitude equals the chord sagitta and bows toward the corner', () => {
    const out = applyWallFillet(ellCorner(), 'a', 'b', 1, 'round')!
    const conn = out.find((w) => w.id === 'a__fillet')!
    // s = r − √(r² − (chord/2)²); chord = √2, r = 1 → s = 1 − 1/√2.
    const expectedSagitta = 1 - 1 / Math.SQRT2
    expect(Math.abs(conn.arc!)).toBeCloseTo(expectedSagitta, 9)
    // For this corner the signed arc is positive (bulge toward origin).
    expect(conn.arc!).toBeGreaterThan(0)
  })
})

describe('applyWallFillet — shared end can be start or end', () => {
  it('handles corner = wallA.start and wallB.end', () => {
    const walls: PlanWall[] = [
      { id: 'a', start: [0, 0], end: [4, 0], thickness: 'internal' }, // corner at start
      { id: 'b', start: [0, 4], end: [0, 0], thickness: 'internal' }, // corner at end
    ]
    const out = applyWallFillet(walls, 'a', 'b', 1, 'bevel')
    expect(out).not.toBeNull()
    if (!out) return
    const a = out.find((w) => w.id === 'a')!
    const b = out.find((w) => w.id === 'b')!
    // wallA.start moved; wallB.end moved; the far ends are preserved.
    expect(a.start[0]).toBeCloseTo(1, 9)
    expect(a.end).toEqual([4, 0])
    expect(b.start).toEqual([0, 4])
    expect(b.end[0]).toBeCloseTo(0, 9)
    expect(b.end[1]).toBeCloseTo(1, 9)
  })
})

describe('applyWallFillet — null cases', () => {
  const ok = ellCorner()

  it('returns null when the walls do not share an endpoint', () => {
    const walls: PlanWall[] = [
      { id: 'a', start: [0, 0], end: [4, 0], thickness: 'internal' },
      { id: 'b', start: [10, 10], end: [10, 14], thickness: 'internal' },
    ]
    expect(applyWallFillet(walls, 'a', 'b', 1, 'bevel')).toBeNull()
    expect(applyWallFillet(walls, 'a', 'b', 1, 'round')).toBeNull()
  })

  it('returns null for a missing id', () => {
    expect(applyWallFillet(ok, 'a', 'nope', 1, 'bevel')).toBeNull()
    expect(applyWallFillet(ok, 'nope', 'b', 1, 'bevel')).toBeNull()
  })

  it('returns null when idA === idB', () => {
    expect(applyWallFillet(ok, 'a', 'a', 1, 'bevel')).toBeNull()
  })

  it('returns null when either wall is locked', () => {
    const walls: PlanWall[] = [
      { id: 'a', start: [0, 0], end: [4, 0], thickness: 'internal', locked: true },
      { id: 'b', start: [0, 0], end: [0, 4], thickness: 'internal' },
    ]
    expect(applyWallFillet(walls, 'a', 'b', 1, 'bevel')).toBeNull()
  })

  it('returns null for amount <= 0', () => {
    expect(applyWallFillet(ok, 'a', 'b', 0, 'bevel')).toBeNull()
    expect(applyWallFillet(ok, 'a', 'b', -1, 'round')).toBeNull()
  })

  it('returns null for a radius too large to fit (cornerFilletArc → null)', () => {
    // tangentDist = r/tan(45°) = r; segments are length 4, so r > 4 overruns.
    expect(applyWallFillet(ok, 'a', 'b', 5, 'round')).toBeNull()
  })
})
