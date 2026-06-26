import { describe, expect, it } from 'vitest'
import type { FurnitureItem } from '../furniture/types'
import { rescalePlan, resolveRescaleFactor } from './rescalePlan'
import { type FloorPlan, type PlanWall, planRoomArea, planRoomPerimeter, wallLength } from './types'

/** A small but feature-rich plan: a rect room with an explicit polygon, an
 *  L-room with an extension, two walls (one axis-aligned for a clean target),
 *  a door + a window, notes/dimensions/polylines, and one upper storey. */
function makePlan(): FloorPlan {
  return {
    id: 'p1',
    name: 'Test',
    ceilingHeight: 2.6,
    extent: [6, 4],
    walls: [
      // A clean 4 m horizontal wall — used as the anchor for target-length tests.
      { id: 'w-anchor', start: [1, 1], end: [5, 1], thickness: 'external', thicknessM: 0.2 },
      { id: 'w2', start: [5, 1], end: [5, 4], thickness: 'internal', arc: 0.5 },
    ],
    openings: [
      { id: 'd1', kind: 'door', wallId: 'w-anchor', offset: 1, width: 0.9, sill: 0, head: 2.1 },
      { id: 'win1', kind: 'window', wallId: 'w2', offset: 0.5, width: 1.2, sill: 0.9, head: 2.1 },
    ],
    rooms: [
      { id: 'r1', name: 'Living', origin: [1, 1], width: 4, depth: 3 },
      {
        id: 'r2',
        name: 'L-room',
        origin: [1, 5],
        width: 3,
        depth: 2,
        extension: { offset: [3, 0], width: 1, depth: 1 },
      },
      {
        id: 'r3',
        name: 'Poly',
        origin: [0, 0],
        width: 2,
        depth: 2,
        polygon: [
          [0, 0],
          [2, 0],
          [2, 2],
          [0, 2],
        ],
      },
    ],
    notes: [{ id: 'n1', x: 2, z: 2, text: 'hi' }],
    dimensions: [{ id: 'dim1', a: [0, 0], b: [4, 0] }],
    polylines: [
      {
        id: 'pl1',
        points: [
          [1, 1],
          [2, 3],
        ],
      },
    ],
    upperLevels: [
      {
        id: 'lvl2',
        name: 'Upper',
        elevation: 3,
        walls: [{ id: 'uw1', start: [2, 2], end: [6, 2], thickness: 'external' }],
        openings: [
          { id: 'ud1', kind: 'door', wallId: 'uw1', offset: 1, width: 0.8, sill: 0, head: 2 },
        ],
        rooms: [{ id: 'ur1', name: 'Upper room', origin: [2, 2], width: 4, depth: 2 }],
      },
    ],
  }
}

function item(over: Partial<FurnitureItem> = {}): FurnitureItem {
  return {
    id: 'i1',
    defId: 'bed',
    position: [2, 3],
    rotation: 0,
    props: { width: 1.5, depth: 2, length: 2, height: 0.5 },
    ...over,
  }
}

describe('rescalePlan — factor form', () => {
  it('scales every wall length by the factor', () => {
    const before = makePlan()
    const { plan } = rescalePlan(before, 2)
    for (const w of before.walls) {
      const after = plan.walls.find((x) => x.id === w.id) as PlanWall
      expect(wallLength(after)).toBeCloseTo(wallLength(w) * 2, 9)
    }
  })

  it('scales every room area by factor² and perimeter by factor', () => {
    const before = makePlan()
    const k = 1.5
    const { plan } = rescalePlan(before, k)
    for (const r of before.rooms) {
      const after = plan.rooms.find((x) => x.id === r.id)!
      expect(planRoomArea(after)).toBeCloseTo(planRoomArea(r) * k * k, 9)
      expect(planRoomPerimeter(after)).toBeCloseTo(planRoomPerimeter(r) * k, 9)
    }
  })

  it('keeps openings proportionally placed on their wall', () => {
    const before = makePlan()
    const door = before.openings.find((o) => o.id === 'd1')!
    const wall = before.walls.find((w) => w.id === door.wallId)!
    const fracBefore = door.offset / wallLength(wall)

    const { plan } = rescalePlan(before, 3)
    const dAfter = plan.openings.find((o) => o.id === 'd1')!
    const wAfter = plan.walls.find((w) => w.id === door.wallId)!
    expect(dAfter.offset / wallLength(wAfter)).toBeCloseTo(fracBefore, 9)
    // Width covers the same proportion of the wall.
    expect(dAfter.width / wallLength(wAfter)).toBeCloseTo(door.width / wallLength(wall), 9)
    expect(dAfter.width).toBeCloseTo(door.width * 3, 9)
  })

  it('scales wall thickness override and arc bulge', () => {
    const { plan } = rescalePlan(makePlan(), 2)
    expect(plan.walls.find((w) => w.id === 'w-anchor')!.thicknessM).toBeCloseTo(0.4, 9)
    expect(plan.walls.find((w) => w.id === 'w2')!.arc).toBeCloseTo(1.0, 9)
  })

  it('scales plan extent and ceiling height', () => {
    const { plan } = rescalePlan(makePlan(), 2)
    expect(plan.extent).toEqual([12, 8])
    expect(plan.ceilingHeight).toBeCloseTo(5.2, 9)
  })

  it('scales notes, dimensions and polyline vertices', () => {
    const { plan } = rescalePlan(makePlan(), 2)
    expect([plan.notes![0].x, plan.notes![0].z]).toEqual([4, 4])
    expect(plan.dimensions![0].b).toEqual([8, 0])
    expect(plan.polylines![0].points[1]).toEqual([4, 6])
  })

  it('factor exactly 1 is a no-op (deep clone, equal values, fresh refs)', () => {
    const before = makePlan()
    const { plan, factor } = rescalePlan(before, 1)
    expect(factor).toBe(1)
    expect(plan).toEqual(before)
    expect(plan).not.toBe(before)
    expect(plan.walls).not.toBe(before.walls)
  })

  it('rejects factor ≤ 0, NaN and Infinity', () => {
    const p = makePlan()
    expect(() => rescalePlan(p, 0)).toThrow(RangeError)
    expect(() => rescalePlan(p, -2)).toThrow(RangeError)
    expect(() => rescalePlan(p, Number.NaN)).toThrow(RangeError)
    expect(() => rescalePlan(p, Number.POSITIVE_INFINITY)).toThrow(RangeError)
  })
})

describe('rescalePlan — anchor', () => {
  it('scales about the origin by default (origin point stays fixed)', () => {
    const { plan } = rescalePlan(makePlan(), 2)
    // r3's polygon starts at [0,0] — fixed under an origin-anchored scale.
    expect(plan.rooms.find((r) => r.id === 'r3')!.polygon![0]).toEqual([0, 0])
    expect(plan.rooms.find((r) => r.id === 'r3')!.polygon![1]).toEqual([4, 0])
  })

  it('scales about an explicit anchor (that point stays fixed)', () => {
    const before = makePlan()
    const anchor: [number, number] = [1, 1]
    const { plan } = rescalePlan(before, 2, [], { anchor })
    // The anchor wall starts at [1,1] = the anchor → fixed; its length still ×2.
    const w = plan.walls.find((x) => x.id === 'w-anchor')!
    expect(w.start).toEqual([1, 1])
    expect(wallLength(w)).toBeCloseTo(8, 9)
  })
})

describe('rescalePlan — target-length form', () => {
  it('hits the target length exactly on the anchor wall', () => {
    const before = makePlan() // w-anchor is 4 m
    const { plan, factor } = rescalePlan(before, { anchorWallId: 'w-anchor', targetLength: 6 })
    expect(factor).toBeCloseTo(1.5, 9)
    const w = plan.walls.find((x) => x.id === 'w-anchor')!
    expect(wallLength(w)).toBeCloseTo(6, 9)
    // The anchor defaults to the wall's start, so that endpoint is fixed.
    expect(w.start).toEqual(before.walls[0].start)
  })

  it('resolveRescaleFactor computes targetLength / currentLength', () => {
    expect(
      resolveRescaleFactor(makePlan(), { anchorWallId: 'w-anchor', targetLength: 2 }),
    ).toBeCloseTo(0.5, 9)
  })

  it('finds the anchor wall on an upper storey too', () => {
    // uw1 is 4 m long on lvl2.
    const f = resolveRescaleFactor(makePlan(), { anchorWallId: 'uw1', targetLength: 8 })
    expect(f).toBeCloseTo(2, 9)
  })

  it('throws on an unknown anchor wall', () => {
    expect(() => rescalePlan(makePlan(), { anchorWallId: 'nope', targetLength: 4 })).toThrow(
      /not found/,
    )
  })

  it('throws on a non-positive target length', () => {
    expect(() => rescalePlan(makePlan(), { anchorWallId: 'w-anchor', targetLength: 0 })).toThrow(
      RangeError,
    )
  })
})

describe('rescalePlan — multi-level consistency', () => {
  it('scales the upper storey geometry and elevation about the same anchor', () => {
    const before = makePlan()
    const { plan } = rescalePlan(before, 2)
    const lvl = plan.upperLevels![0]
    expect(lvl.elevation).toBeCloseTo(6, 9)
    expect(wallLength(lvl.walls[0])).toBeCloseTo(8, 9)
    expect(planRoomArea(lvl.rooms[0])).toBeCloseTo(
      planRoomArea(before.upperLevels![0].rooms[0]) * 4,
      9,
    )
    // Upper opening stays proportional.
    expect(lvl.openings[0].offset).toBeCloseTo(2, 9)
    expect(lvl.openings[0].width).toBeCloseTo(1.6, 9)
  })
})

describe('rescalePlan — composition', () => {
  it('double-scale composes (a then b == a*b) about the origin', () => {
    const p = makePlan()
    const a = 1.5
    const b = 2
    const twice = rescalePlan(rescalePlan(p, a).plan, b).plan
    const once = rescalePlan(p, a * b).plan
    for (const w of p.walls) {
      expect(wallLength(twice.walls.find((x) => x.id === w.id)!)).toBeCloseTo(
        wallLength(once.walls.find((x) => x.id === w.id)!),
        9,
      )
    }
    for (const r of p.rooms) {
      expect(planRoomArea(twice.rooms.find((x) => x.id === r.id)!)).toBeCloseTo(
        planRoomArea(once.rooms.find((x) => x.id === r.id)!),
        9,
      )
    }
  })
})

describe('rescalePlan — furniture', () => {
  it('scales item positions but PRESERVES sizes by default (SH3D parity)', () => {
    const { items } = rescalePlan(makePlan(), 2, [item()])
    expect(items[0].position).toEqual([4, 6])
    expect(items[0].props.width).toBe(1.5)
    expect(items[0].props.depth).toBe(2)
  })

  it('scales item sizes too when scaleFurnitureSize is set', () => {
    const { items } = rescalePlan(makePlan(), 2, [item({ props: { width: 1.5, scale: 1.2 } })], {
      scaleFurnitureSize: true,
    })
    expect(items[0].position).toEqual([4, 6])
    expect(items[0].props.width).toBe(3)
    expect(items[0].props.scale).toBeCloseTo(2.4, 9)
  })

  it('scales item elevation always', () => {
    const { items } = rescalePlan(makePlan(), 2, [item({ elevation: 0.5 })])
    expect(items[0].elevation).toBeCloseTo(1, 9)
  })

  it('does not mutate the input plan or items', () => {
    const p = makePlan()
    const it = item()
    rescalePlan(p, 2, [it])
    expect(p.extent).toEqual([6, 4])
    expect(wallLength(p.walls[0])).toBeCloseTo(4, 9)
    expect(it.position).toEqual([2, 3])
  })
})
