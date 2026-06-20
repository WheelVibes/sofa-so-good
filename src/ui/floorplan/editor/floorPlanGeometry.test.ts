import { describe, expect, it } from 'vitest'
import type { PlanRoom, PlanVec2, PlanWall } from '../../../floorplan/types'
import { alongWall, nearestWall, planCenter } from './floorPlanGeometry'

const wall = (
  id: string,
  start: PlanVec2,
  end: PlanVec2,
  extra: Partial<PlanWall> = {},
): PlanWall => ({ id, start, end, thickness: 'internal', ...extra })

const room = (id: string, origin: PlanVec2, width: number, depth: number): PlanRoom => ({
  id,
  name: id,
  origin,
  width,
  depth,
})

describe('planCenter', () => {
  it('falls back when there is no geometry at all', () => {
    expect(planCenter([], [], [3, 2])).toEqual([3, 2])
  })

  it('centres on a single wall midpoint', () => {
    expect(planCenter([wall('a', [0, 0], [4, 2])], [], [99, 99])).toEqual([2, 1])
  })

  it('centres on a single rectangular room', () => {
    // Room 2..6 in x, 1..4 in z → centre (4, 2.5).
    expect(planCenter([], [room('r', [2, 1], 4, 3)], [99, 99])).toEqual([4, 2.5])
  })

  it('spans the bounding box of many walls + rooms', () => {
    const walls = [wall('a', [0, 0], [2, 0]), wall('b', [8, 5], [10, 6])]
    const rooms = [room('r', [1, 1], 3, 3)] // extends to (4,4)
    // x: min 0, max 10 → 5 ; z: min 0, max 6 → 3.
    expect(planCenter(walls, rooms, [99, 99])).toEqual([5, 3])
  })

  it('does NOT use the extent fallback once any geometry exists', () => {
    expect(planCenter([wall('a', [0, 0], [0, 0])], [], [50, 50])).toEqual([0, 0])
  })

  it('uses an explicit room polygon when present (ignoring origin/width/depth)', () => {
    const r: PlanRoom = {
      ...room('p', [0, 0], 1, 1),
      polygon: [
        [10, 10],
        [20, 10],
        [20, 30],
        [10, 30],
      ],
    }
    // Polygon bbox x:10..20 → 15, z:10..30 → 20.
    expect(planCenter([], [r], [99, 99])).toEqual([15, 20])
  })

  it('treats a degenerate (<3 pt) polygon as a plain rectangle', () => {
    const r: PlanRoom = {
      ...room('p', [2, 2], 2, 2),
      polygon: [
        [0, 0],
        [1, 1],
      ],
    }
    // Falls back to origin/width/depth: 2..4 → centre 3,3.
    expect(planCenter([], [r], [99, 99])).toEqual([3, 3])
  })
})

describe('nearestWall', () => {
  // An L: wall a along x (0,0)→(4,0), wall b along z (4,0)→(4,3).
  const walls = [wall('a', [0, 0], [4, 0]), wall('b', [4, 0], [4, 3])]

  it('returns null when there are no walls', () => {
    expect(nearestWall([], 1, 1)).toBeNull()
  })

  it('returns null when nothing is within the max distance', () => {
    expect(nearestWall(walls, 2, 5)).toBeNull()
  })

  it('finds the nearest wall with its projected offset + distance', () => {
    const hit = nearestWall(walls, 1, 0.1)
    expect(hit?.wall.id).toBe('a')
    expect(hit?.offset).toBeCloseTo(1)
    expect(hit?.dist).toBeCloseTo(0.1)
  })

  it('clamps the projection to the segment (point just beyond an endpoint)', () => {
    // x = -0.2 projects before a's start → offset clamps to 0, dist = 0.2 (in range).
    const hit = nearestWall(walls, -0.2, 0)
    expect(hit?.wall.id).toBe('a')
    expect(hit?.offset).toBeCloseTo(0)
    expect(hit?.dist).toBeCloseTo(0.2)
  })

  it('returns null for a point beyond an endpoint but outside the max distance', () => {
    // x = -1 projects to the corner at dist 1 m → past the 0.4 m default.
    expect(nearestWall(walls, -1, 0)).toBeNull()
  })

  it('detects a point exactly on a vertex (zero distance)', () => {
    const hit = nearestWall(walls, 0, 0)
    expect(hit?.dist).toBeCloseTo(0)
  })

  it('picks the closer wall when two are in range', () => {
    // Near the (4,0) corner but tilted toward wall b's span.
    const hit = nearestWall(walls, 4.05, 1.5)
    expect(hit?.wall.id).toBe('b')
    expect(hit?.offset).toBeCloseTo(1.5)
  })

  it('skips zero-length walls', () => {
    const degenerate = [wall('z', [1, 1], [1, 1]), wall('a', [0, 0], [4, 0])]
    const hit = nearestWall(degenerate, 2, 0.1)
    expect(hit?.wall.id).toBe('a')
  })

  it('returns null when only a zero-length wall is present', () => {
    expect(nearestWall([wall('z', [1, 1], [1, 1])], 1, 1)).toBeNull()
  })

  it('honours a custom max distance', () => {
    // 0.5 m away: outside the default 0.4 m, inside a 0.6 m cap.
    expect(nearestWall(walls, 2, 0.5)).toBeNull()
    expect(nearestWall(walls, 2, 0.5, 0.6)?.wall.id).toBe('a')
  })
})

describe('alongWall', () => {
  const w = wall('a', [0, 0], [4, 0])

  it('projects a point onto the wall as a positive offset', () => {
    expect(alongWall(w, 1.5, 0.2)).toBeCloseTo(1.5)
  })

  it('returns 0 at the start vertex', () => {
    expect(alongWall(w, 0, 0)).toBeCloseTo(0)
  })

  it('returns the full length at the end vertex', () => {
    expect(alongWall(w, 4, 0)).toBeCloseTo(4)
  })

  it('returns a negative offset for a point before the start (not clamped)', () => {
    expect(alongWall(w, -2, 0)).toBeCloseTo(-2)
  })

  it('returns an offset past the length for a point beyond the end (not clamped)', () => {
    expect(alongWall(w, 6, 0)).toBeCloseTo(6)
  })

  it('returns 0 for a zero-length wall', () => {
    expect(alongWall(wall('z', [3, 3], [3, 3]), 5, 5)).toBe(0)
  })

  it('projects along a diagonal wall', () => {
    const diag = wall('d', [0, 0], [3, 4]) // length 5, unit (0.6, 0.8)
    // Point at the midpoint (1.5, 2) → offset 2.5.
    expect(alongWall(diag, 1.5, 2)).toBeCloseTo(2.5)
  })

  it('measures arc length on a curved wall', () => {
    const curved = wall('c', [0, 0], [4, 0], { arc: 1 })
    // The start vertex is offset 0 on the arc.
    expect(alongWall(curved, 0, 0)).toBeCloseTo(0)
    // A point near the end maps to (close to) the full arc length, which exceeds
    // the 4 m chord for a bulged wall.
    expect(alongWall(curved, 4, 0)).toBeGreaterThan(4)
  })
})
