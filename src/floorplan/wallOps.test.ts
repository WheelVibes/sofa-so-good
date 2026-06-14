import { describe, expect, it } from 'vitest'
import type { PlanOpening, PlanWall } from './types'
import {
  endForAngle,
  endForLength,
  joinAdjacentWalls,
  reverseWallGeometry,
  wallAngleDeg,
} from './wallOps'

const wall = (id: string, start: [number, number], end: [number, number]): PlanWall => ({
  id,
  start,
  end,
  thickness: 'internal',
})
const win = (id: string, wallId: string, offset: number, width = 1): PlanOpening => ({
  id,
  kind: 'window',
  wallId,
  offset,
  width,
  sill: 0.9,
  head: 2.1,
})

describe('reverseWallGeometry', () => {
  it('swaps start/end and keeps openings in place', () => {
    // A 4 m wall along +X; a 1 m-wide window at offset 1 (spans 1..2 from start).
    const res = reverseWallGeometry([wall('w', [0, 0], [4, 0])], [win('o', 'w', 1)], 'w')!
    expect(res.walls[0].start).toEqual([4, 0])
    expect(res.walls[0].end).toEqual([0, 0])
    // From the new start the same span is now (4-2)..(4-1) = 2..3 → offset 2.
    expect(res.openings[0].offset).toBeCloseTo(2)
    expect(res.openings[0].width).toBeCloseTo(1)
  })

  it('returns null for a missing or degenerate wall', () => {
    expect(reverseWallGeometry([wall('w', [0, 0], [4, 0])], [], 'nope')).toBeNull()
    expect(reverseWallGeometry([wall('w', [1, 1], [1, 1])], [], 'w')).toBeNull()
  })
})

describe('joinAdjacentWalls', () => {
  let n = 0
  const genId = () => `merged-${n++}`

  it('merges two collinear walls sharing an endpoint into one spanning wall', () => {
    n = 0
    const walls = [wall('a', [0, 0], [2, 0]), wall('b', [2, 0], [5, 0])]
    const res = joinAdjacentWalls(walls, [], 'a', genId)!
    expect(res.walls).toHaveLength(1)
    expect(res.walls[0].id).toBe('merged-0')
    expect(res.walls[0].start).toEqual([0, 0])
    expect(res.walls[0].end).toEqual([5, 0])
  })

  it('re-homes openings from both walls onto the merged wall', () => {
    n = 0
    const walls = [wall('a', [0, 0], [2, 0]), wall('b', [2, 0], [5, 0])]
    // window on a at offset 0.5; window on b at offset 1 (→ world x 3..4).
    const res = joinAdjacentWalls(walls, [win('oa', 'a', 0.5), win('ob', 'b', 1)], 'a', genId)!
    const oa = res.openings.find((o) => o.id === 'oa')!
    const ob = res.openings.find((o) => o.id === 'ob')!
    expect(oa.wallId).toBe(res.mergedId)
    expect(oa.offset).toBeCloseTo(0.5)
    expect(ob.offset).toBeCloseTo(3) // world x 3 from merged start at x=0
    expect(ob.width).toBeCloseTo(1)
  })

  it('handles a reversed neighbour (b pointing back at the shared corner)', () => {
    n = 0
    // b runs 5→2 (toward the shared corner); still collinear, still joinable.
    const walls = [wall('a', [0, 0], [2, 0]), wall('b', [5, 0], [2, 0])]
    const res = joinAdjacentWalls(walls, [win('ob', 'b', 1)], 'a', genId)!
    expect(res.walls).toHaveLength(1)
    // The window spans b-offset 1..2 → world x 4..3 → merged offset 3, width 1.
    expect(res.openings[0].offset).toBeCloseTo(3)
    expect(res.openings[0].width).toBeCloseTo(1)
  })

  it('returns null when no collinear neighbour shares an endpoint', () => {
    // Perpendicular walls meeting at a corner are NOT collinear.
    const walls = [wall('a', [0, 0], [2, 0]), wall('b', [2, 0], [2, 3])]
    expect(joinAdjacentWalls(walls, [], 'a', genId)).toBeNull()
    // Disjoint collinear walls (no shared endpoint) are not joined.
    const apart = [wall('a', [0, 0], [2, 0]), wall('c', [3, 0], [5, 0])]
    expect(joinAdjacentWalls(apart, [], 'a', genId)).toBeNull()
  })

  it('keeps the merged wall external if either segment was external', () => {
    n = 0
    const walls: PlanWall[] = [
      { ...wall('a', [0, 0], [2, 0]), thickness: 'internal' },
      { ...wall('b', [2, 0], [5, 0]), thickness: 'external' },
    ]
    expect(joinAdjacentWalls(walls, [], 'a', genId)!.walls[0].thickness).toBe('external')
  })
})

describe('editable wall length / angle (PARITY-WALLDIM)', () => {
  it('endForLength keeps start + direction and sets the exact length', () => {
    // A 3-4-5 wall (length 5) along (0.6,0.8) → resize to 10 keeps direction.
    const w = wall('a', [1, 1], [4, 5])
    expect(endForLength(w, 10)).toEqual([1 + 0.6 * 10, 1 + 0.8 * 10])
    // Clamps to a 1 cm minimum (never zero/negative).
    expect(endForLength(w, 0)).toEqual([1 + 0.6 * 0.01, 1 + 0.8 * 0.01])
  })

  it('endForLength runs +X for a zero-length wall', () => {
    expect(endForLength(wall('a', [2, 2], [2, 2]), 3)).toEqual([5, 2])
  })

  it('wallAngleDeg reports the compass bearing (+X=0, +Z=90)', () => {
    expect(wallAngleDeg(wall('a', [0, 0], [1, 0]))).toBeCloseTo(0)
    expect(wallAngleDeg(wall('a', [0, 0], [0, 1]))).toBeCloseTo(90)
    expect(wallAngleDeg(wall('a', [0, 0], [-1, 0]))).toBeCloseTo(180)
    expect(wallAngleDeg(wall('a', [0, 0], [0, -1]))).toBeCloseTo(270)
  })

  it('endForAngle rotates about start, preserving length', () => {
    const w = wall('a', [1, 1], [4, 1]) // length 3, bearing 0
    const [x, z] = endForAngle(w, 90)
    expect(x).toBeCloseTo(1)
    expect(z).toBeCloseTo(4) // start + (0,1)*3
  })

  it('endForAngle leaves a zero-length wall unchanged', () => {
    expect(endForAngle(wall('a', [2, 2], [2, 2]), 45)).toEqual([2, 2])
  })
})
