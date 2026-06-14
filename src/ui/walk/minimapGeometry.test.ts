import { describe, expect, it } from 'vitest'
import type { FloorPlan, PlanRoom } from '../../floorplan/types'
import { openingSegments, planContentBounds, roomPathD } from './minimapGeometry'

const base = (over: Partial<PlanRoom>): PlanRoom => ({
  id: 'r',
  name: 'Room',
  origin: [0, 0],
  width: 4,
  depth: 3,
  ...over,
})

describe('planContentBounds', () => {
  const plan = (over: Partial<FloorPlan>): FloorPlan =>
    ({ extent: [100, 100], walls: [], rooms: [], openings: [], ...over }) as FloorPlan

  it('returns the true wall/room box, ignoring the padded extent', () => {
    // Extent is a huge 100×100, but the apartment only spans x∈[2,6], z∈[1,4].
    const bounds = planContentBounds(
      plan({ rooms: [base({ origin: [2, 1], width: 4, depth: 3 })] }),
    )
    expect(bounds).toEqual({ minX: 2, minZ: 1, maxX: 6, maxZ: 4 })
  })

  it('includes walls and polygon rooms', () => {
    const bounds = planContentBounds(
      plan({
        walls: [{ id: 'w', start: [0, 0], end: [8, 0], thickness: 'external' } as never],
        rooms: [
          base({
            polygon: [
              [1, 1],
              [1, 5],
              [5, 5],
            ],
          }),
        ],
      }),
    )
    expect(bounds).toEqual({ minX: 0, minZ: 0, maxX: 8, maxZ: 5 })
  })

  it('returns a zero box for an empty plan', () => {
    expect(planContentBounds(plan({}))).toEqual({ minX: 0, minZ: 0, maxX: 0, maxZ: 0 })
  })
})

describe('roomPathD', () => {
  it('draws a single rect for a plain room', () => {
    const d = roomPathD(base({}))
    expect(d).toBe('M0.000 0.000h4.000v3.000h-4.000Z')
  })

  it('offsets the rect by the origin', () => {
    const d = roomPathD(base({ origin: [2, 1], width: 2, depth: 2 }))
    expect(d).toBe('M2.000 1.000h2.000v2.000h-2.000Z')
  })

  it('appends a second subpath for an L-shape extension', () => {
    const d = roomPathD(base({ extension: { offset: [4, 0], width: 2, depth: 1 } }))
    expect(d).toContain('M0.000 0.000h4.000v3.000h-4.000Z')
    expect(d).toContain('M4.000 0.000h2.000v1.000h-2.000Z')
  })

  it('prefers an explicit polygon and closes it', () => {
    const d = roomPathD(
      base({
        polygon: [
          [0, 0],
          [2, 0],
          [2, 2],
        ],
      }),
    )
    expect(d).toBe('M0.000 0.000L2.000 0.000L2.000 2.000Z')
  })

  it('returns empty for a degenerate (zero-size, no-polygon) room', () => {
    expect(roomPathD(base({ width: 0, depth: 0 }))).toBe('')
  })

  it('ignores a too-short polygon and falls back to the rect', () => {
    const d = roomPathD(
      base({
        polygon: [
          [0, 0],
          [1, 1],
        ],
      }),
    )
    expect(d).toBe('M0.000 0.000h4.000v3.000h-4.000Z')
  })
})

const plan = (over: Partial<FloorPlan>): FloorPlan =>
  ({
    name: 'p',
    extent: [10, 10],
    walls: [
      { id: 'w1', start: [0, 0], end: [4, 0], thickness: 'interior' },
      { id: 'w2', start: [0, 0], end: [0, 3], thickness: 'interior' },
    ],
    openings: [],
    rooms: [],
    ...over,
  }) as unknown as FloorPlan

describe('openingSegments', () => {
  it('resolves a door span along its host wall', () => {
    const segs = openingSegments(
      plan({
        openings: [
          { id: 'o1', kind: 'door', wallId: 'w1', offset: 1, width: 0.9, sill: 0, head: 2 },
        ],
      }),
    )
    expect(segs).toHaveLength(1)
    expect(segs[0]).toMatchObject({ id: 'o1', kind: 'door' })
    expect(segs[0].a[0]).toBeCloseTo(1)
    expect(segs[0].b[0]).toBeCloseTo(1.9)
    expect(segs[0].a[1]).toBeCloseTo(0)
  })

  it('resolves along a vertical wall', () => {
    const segs = openingSegments(
      plan({
        openings: [
          { id: 'o2', kind: 'window', wallId: 'w2', offset: 1, width: 1, sill: 1, head: 2 },
        ],
      }),
    )
    expect(segs[0].a).toEqual([0, 1])
    expect(segs[0].b[1]).toBeCloseTo(2)
  })

  it('clamps an over-long span to the wall and skips unknown/zero walls', () => {
    const segs = openingSegments(
      plan({
        walls: [
          { id: 'w1', start: [0, 0], end: [4, 0], thickness: 'interior' },
          { id: 'wz', start: [5, 5], end: [5, 5], thickness: 'interior' },
        ] as unknown as FloorPlan['walls'],
        openings: [
          { id: 'a', kind: 'door', wallId: 'w1', offset: 3.5, width: 2, sill: 0, head: 2 },
          { id: 'b', kind: 'door', wallId: 'missing', offset: 0, width: 1, sill: 0, head: 2 },
          { id: 'c', kind: 'door', wallId: 'wz', offset: 0, width: 1, sill: 0, head: 2 },
        ],
      }),
    )
    expect(segs.map((s) => s.id)).toEqual(['a'])
    expect(segs[0].b[0]).toBeCloseTo(4) // clamped to wall end
  })
})
