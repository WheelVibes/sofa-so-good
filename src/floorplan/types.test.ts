import { describe, expect, it } from 'vitest'
import {
  type FloorPlan,
  type PlanRoom,
  type PlanWall,
  planBounds,
  planRoomArea,
  planRoomPerimeter,
  planTotalArea,
  pointInPolygon,
  pointInRoom,
  polygonArea,
  rectUnionOutline,
  roomPolygon,
  wallLength,
} from './types'

const mkRoom = (r: Partial<PlanRoom> & Pick<PlanRoom, 'origin' | 'width' | 'depth'>): PlanRoom => ({
  id: 'r',
  name: 'Room',
  ...r,
})
const mkWall = (start: [number, number], end: [number, number]): PlanWall => ({
  id: 'w',
  start,
  end,
  thickness: 'internal',
})
const mkPlan = (p: Partial<FloorPlan>): FloorPlan => ({
  id: 'p',
  name: 'Plan',
  ceilingHeight: 2.6,
  extent: [10, 10],
  walls: [],
  openings: [],
  rooms: [],
  ...p,
})

describe('polygonArea', () => {
  it('returns 0 for degenerate polygons (< 3 points)', () => {
    expect(polygonArea([])).toBe(0)
    expect(polygonArea([[0, 0]])).toBe(0)
    expect(
      polygonArea([
        [0, 0],
        [1, 1],
      ]),
    ).toBe(0)
  })

  it('computes a unit square (area 1) regardless of winding', () => {
    const ccw: [number, number][] = [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ]
    const cw = [...ccw].reverse()
    expect(polygonArea(ccw)).toBeCloseTo(1)
    expect(polygonArea(cw)).toBeCloseTo(1)
  })

  it('computes a triangle area', () => {
    expect(
      polygonArea([
        [0, 0],
        [4, 0],
        [0, 3],
      ]),
    ).toBeCloseTo(6)
  })
})

describe('pointInPolygon', () => {
  const square: [number, number][] = [
    [0, 0],
    [4, 0],
    [4, 4],
    [0, 4],
  ]
  it('is true inside, false outside', () => {
    expect(pointInPolygon(2, 2, square)).toBe(true)
    expect(pointInPolygon(5, 2, square)).toBe(false)
    expect(pointInPolygon(-1, 2, square)).toBe(false)
  })

  it('treats a concave (L) notch as outside', () => {
    // L-shape: full 4×4 minus the top-right 2×2 quadrant.
    const L: [number, number][] = [
      [0, 0],
      [4, 0],
      [4, 2],
      [2, 2],
      [2, 4],
      [0, 4],
    ]
    expect(pointInPolygon(1, 1, L)).toBe(true) // in the stem
    expect(pointInPolygon(3, 3, L)).toBe(false) // in the removed notch
  })
})

describe('roomPolygon', () => {
  it('returns the explicit polygon when set', () => {
    const poly: [number, number][] = [
      [0, 0],
      [5, 0],
      [5, 5],
    ]
    expect(roomPolygon(mkRoom({ origin: [0, 0], width: 1, depth: 1, polygon: poly }))).toBe(poly)
  })

  it('derives a 4-corner rectangle from origin/width/depth', () => {
    const p = roomPolygon(mkRoom({ origin: [1, 2], width: 3, depth: 4 }))
    expect(p).toEqual([
      [1, 2],
      [4, 2],
      [4, 6],
      [1, 6],
    ])
  })
})

describe('planRoomArea', () => {
  it('is width × depth for a simple rectangle', () => {
    expect(planRoomArea(mkRoom({ origin: [0, 0], width: 3.6, depth: 3.4 }))).toBeCloseTo(12.24)
  })

  it('sums a non-overlapping L-extension (adjacent rectangles)', () => {
    // main 4×4 (16) + extension 4×2 attached below (8) = 24, no overlap.
    const area = planRoomArea(
      mkRoom({
        origin: [0, 0],
        width: 4,
        depth: 4,
        extension: { offset: [0, 4], width: 4, depth: 2 },
      }),
    )
    expect(area).toBeCloseTo(24)
  })

  it('counts an OVERLAPPING extension only once (union, not sum) — BUG-004 invariant', () => {
    // main [0,0]-[4,4] (16) + ext [2,2]-[6,6] (16); overlap [2,2]-[4,4] (4).
    // Naive sum = 32; correct union = 16 + 16 − 4 = 28.
    const area = planRoomArea(
      mkRoom({
        origin: [0, 0],
        width: 4,
        depth: 4,
        extension: { offset: [2, 2], width: 4, depth: 4 },
      }),
    )
    expect(area).toBeCloseTo(28)
  })
})

describe('planRoomPerimeter', () => {
  it('is 2·(w+d) for a rectangle', () => {
    expect(planRoomPerimeter(mkRoom({ origin: [0, 0], width: 3, depth: 5 }))).toBeCloseTo(16)
  })
})

describe('pointInRoom', () => {
  it('is inclusive of the rectangle boundary', () => {
    const r = mkRoom({ origin: [0, 0], width: 4, depth: 4 })
    expect(pointInRoom(r, 2, 2)).toBe(true)
    expect(pointInRoom(r, 0, 0)).toBe(true) // corner
    expect(pointInRoom(r, 4, 4)).toBe(true) // opposite corner
    expect(pointInRoom(r, 4.01, 2)).toBe(false)
  })

  it('includes the extension rectangle', () => {
    const r = mkRoom({
      origin: [0, 0],
      width: 4,
      depth: 4,
      extension: { offset: [0, 4], width: 4, depth: 2 },
    })
    expect(pointInRoom(r, 2, 5)).toBe(true) // inside the extension
    expect(pointInRoom(r, 2, 7)).toBe(false) // past it
  })

  it('uses the explicit polygon when present', () => {
    const r = mkRoom({
      origin: [0, 0],
      width: 4,
      depth: 4,
      polygon: [
        [0, 0],
        [4, 0],
        [4, 2],
        [2, 2],
        [2, 4],
        [0, 4],
      ],
    })
    expect(pointInRoom(r, 1, 1)).toBe(true)
    expect(pointInRoom(r, 3, 3)).toBe(false) // in the L notch
  })
})

describe('planTotalArea', () => {
  it('sums every room area', () => {
    const plan = mkPlan({
      rooms: [
        mkRoom({ id: 'a', origin: [0, 0], width: 3, depth: 3 }),
        mkRoom({ id: 'b', origin: [3, 0], width: 2, depth: 2 }),
      ],
    })
    expect(planTotalArea(plan)).toBeCloseTo(9 + 4)
  })
})

describe('wallLength', () => {
  it('is the Euclidean distance between endpoints', () => {
    expect(wallLength(mkWall([0, 0], [3, 4]))).toBeCloseTo(5)
    expect(wallLength(mkWall([1, 1], [1, 1]))).toBe(0)
  })
})

describe('planBounds', () => {
  it('is the max of extent and every wall/room extent', () => {
    const plan = mkPlan({
      extent: [5, 5],
      walls: [mkWall([0, 0], [8, 2])],
      rooms: [mkRoom({ origin: [0, 0], width: 3, depth: 12 })],
    })
    expect(planBounds(plan)).toEqual([8, 12])
  })

  it('accounts for an explicit room polygon', () => {
    const plan = mkPlan({
      extent: [2, 2],
      rooms: [
        mkRoom({
          origin: [0, 0],
          width: 1,
          depth: 1,
          polygon: [
            [0, 0],
            [9, 0],
            [9, 7],
          ],
        }),
      ],
    })
    expect(planBounds(plan)).toEqual([9, 7])
  })
})

describe('rectUnionOutline', () => {
  it('merges two side-by-side rectangles into a single outline (correct area)', () => {
    // [0,0,2,2] + [2,0,4,2] → a 4×2 rectangle, area 8.
    const outline = rectUnionOutline([
      [0, 0, 2, 2],
      [2, 0, 4, 2],
    ])
    expect(polygonArea(outline)).toBeCloseTo(8)
  })

  it('unions overlapping rectangles (area counted once)', () => {
    // [0,0,4,4] (16) + [2,2,6,6] (16), overlap 4 → union 28.
    const outline = rectUnionOutline([
      [0, 0, 4, 4],
      [2, 2, 6, 6],
    ])
    expect(polygonArea(outline)).toBeCloseTo(28)
  })

  it('returns an empty outline for no rectangles', () => {
    expect(rectUnionOutline([])).toEqual([])
  })
})
