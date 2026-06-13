import { describe, expect, it } from 'vitest'
import type { PlanOpening, PlanWall } from './types'
import { joinAdjacentWalls, reverseWallGeometry } from './wallOps'

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
