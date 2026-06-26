import { describe, expect, it } from 'vitest'
import type { FurnitureItem } from '../furniture/types'
import { mirrorItem, mirrorPlanRegion } from './mirrorPlanRegion'
import {
  type FloorPlan,
  type PlanWall,
  planRoomArea,
  planRoomPerimeter,
  pointInRoom,
  wallLength,
} from './types'

/** A small but feature-rich plan: a rect room, an L-room with an extension, a
 *  polygon room, two walls (one with an arc bulge), a door + a window with
 *  explicit handedness, notes/dimensions/polylines, and one upper storey. */
function makePlan(): FloorPlan {
  return {
    id: 'p1',
    name: 'Test',
    ceilingHeight: 2.6,
    extent: [6, 4],
    walls: [
      { id: 'w1', start: [1, 1], end: [5, 1], thickness: 'external', thicknessM: 0.2 },
      { id: 'w2', start: [5, 1], end: [5, 4], thickness: 'internal', arc: 0.5 },
    ],
    openings: [
      {
        id: 'd1',
        kind: 'door',
        wallId: 'w1',
        offset: 1,
        width: 0.9,
        sill: 0,
        head: 2.1,
        hinge: 'start',
        swing: 'right',
      },
      { id: 'win1', kind: 'window', wallId: 'w2', offset: 0.5, width: 1.2, sill: 0.9, head: 2.1 },
    ],
    rooms: [
      { id: 'r1', name: 'Living', origin: [1, 1], width: 4, depth: 3, labelOffset: [0.5, 0.2] },
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
          {
            id: 'ud1',
            kind: 'door',
            wallId: 'uw1',
            offset: 1,
            width: 0.8,
            sill: 0,
            head: 2,
            hinge: 'end',
            swing: 'left',
          },
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
    rotation: 0.4,
    props: { width: 1.5, depth: 2, length: 2, height: 0.5 },
    ...over,
  }
}

describe('mirrorPlanRegion — coordinates reflect', () => {
  it('reflects every wall endpoint across x = axisX (Z unchanged)', () => {
    const before = makePlan()
    const axisX = 3
    const { plan } = mirrorPlanRegion(before, [], axisX)
    for (const w of before.walls) {
      const after = plan.walls.find((x) => x.id === w.id) as PlanWall
      expect(after.start).toEqual([2 * axisX - w.start[0], w.start[1]])
      expect(after.end).toEqual([2 * axisX - w.end[0], w.end[1]])
    }
  })

  it('preserves wall lengths and room areas/perimeters (reflection is an isometry)', () => {
    const before = makePlan()
    const { plan } = mirrorPlanRegion(before, [], 2)
    for (const w of before.walls) {
      expect(wallLength(plan.walls.find((x) => x.id === w.id)!)).toBeCloseTo(wallLength(w), 9)
    }
    for (const r of before.rooms) {
      const after = plan.rooms.find((x) => x.id === r.id)!
      expect(planRoomArea(after)).toBeCloseTo(planRoomArea(r), 9)
      expect(planRoomPerimeter(after)).toBeCloseTo(planRoomPerimeter(r), 9)
    }
  })

  it('negates a wall arc bulge (handedness flips)', () => {
    const { plan } = mirrorPlanRegion(makePlan(), [], 0)
    expect(plan.walls.find((w) => w.id === 'w2')!.arc).toBeCloseTo(-0.5, 9)
  })

  it('reflects extent unchanged (it is a size, not a position)', () => {
    const { plan } = mirrorPlanRegion(makePlan(), [], 5)
    expect(plan.extent).toEqual([6, 4])
  })

  it('reflects notes, dimensions and polyline vertices in X only', () => {
    const axisX = 3
    const { plan } = mirrorPlanRegion(makePlan(), [], axisX)
    expect([plan.notes![0].x, plan.notes![0].z]).toEqual([2 * axisX - 2, 2])
    expect(plan.dimensions![0].a).toEqual([2 * axisX - 0, 0])
    expect(plan.dimensions![0].b).toEqual([2 * axisX - 4, 0])
    expect(plan.polylines![0].points[1]).toEqual([2 * axisX - 2, 3])
  })

  it('keeps a mirrored rect room covering its reflected footprint', () => {
    const axisX = 4
    const { plan } = mirrorPlanRegion(makePlan(), [], axisX)
    const r1 = plan.rooms.find((r) => r.id === 'r1')!
    // r1 spanned X∈[1,5]; reflected about x=4 → X∈[3,7], origin at min-X = 3.
    expect(r1.origin).toEqual([3, 1])
    expect(r1.width).toBe(4)
    // A point that was inside the original maps to a point inside the mirror.
    expect(pointInRoom(r1, 2 * axisX - 2, 2)).toBe(true)
    // labelOffset X negates.
    expect(r1.labelOffset).toEqual([-0.5, 0.2])
  })

  it('reflects an L-extension so it lands on the mirrored side', () => {
    const before = makePlan()
    const axisX = 0
    const { plan } = mirrorPlanRegion(before, [], axisX)
    const r2 = plan.rooms.find((r) => r.id === 'r2')!
    // Original ext absolute X-span: origin.x(1)+offset.x(3)=4 .. +width(1)=5.
    // Reflected about x=0 → X∈[-5,-4]; new origin.x = mirror(1+3=4)=-4 → ext min-X
    // relative offset = -5 - (-4) = -1.
    const newOriginX = r2.origin[0]
    const extAbsMinX = newOriginX + r2.extension!.offset[0]
    expect(extAbsMinX).toBeCloseTo(-5, 9)
    expect(extAbsMinX + r2.extension!.width).toBeCloseTo(-4, 9)
  })

  it('reflects an explicit polygon vertex-by-vertex', () => {
    const axisX = 1
    const { plan } = mirrorPlanRegion(makePlan(), [], axisX)
    const r3 = plan.rooms.find((r) => r.id === 'r3')!
    expect(r3.polygon).toEqual([
      [2, 0],
      [0, 0],
      [0, 2],
      [2, 2],
    ])
  })
})

describe('mirrorPlanRegion — opening handedness', () => {
  it('flips a door hinge (start↔end) and swing (left↔right)', () => {
    const { plan } = mirrorPlanRegion(makePlan(), [], 3)
    const d1 = plan.openings.find((o) => o.id === 'd1')!
    expect(d1.hinge).toBe('end') // was 'start'
    expect(d1.swing).toBe('left') // was 'right'
  })

  it('makes default door handedness explicit and flipped', () => {
    const p = makePlan()
    // Strip the explicit handedness → relies on the start/right defaults.
    p.openings[0] = { ...p.openings[0], hinge: undefined, swing: undefined }
    const { plan } = mirrorPlanRegion(p, [], 0)
    const d1 = plan.openings.find((o) => o.id === 'd1')!
    expect(d1.hinge).toBe('end')
    expect(d1.swing).toBe('left')
  })

  it('leaves opening offset/width/sill/head unchanged (isometric invariants)', () => {
    const before = makePlan()
    const { plan } = mirrorPlanRegion(before, [], 7)
    const d1 = plan.openings.find((o) => o.id === 'd1')!
    const w1 = before.openings.find((o) => o.id === 'd1')!
    expect(d1.offset).toBe(w1.offset)
    expect(d1.width).toBe(w1.width)
    expect(d1.sill).toBe(w1.sill)
    expect(d1.head).toBe(w1.head)
  })

  it('does not add handedness to a window', () => {
    const { plan } = mirrorPlanRegion(makePlan(), [], 1)
    const win = plan.openings.find((o) => o.id === 'win1')!
    expect(win.hinge).toBeUndefined()
    expect(win.swing).toBeUndefined()
  })
})

describe('mirrorPlanRegion — multi-level consistency', () => {
  it('mirrors every upper-storey wall/room/opening about the same axis', () => {
    const before = makePlan()
    const axisX = 3
    const { plan } = mirrorPlanRegion(before, [], axisX)
    const lvl = plan.upperLevels![0]
    const uw = lvl.walls[0]
    expect(uw.start).toEqual([2 * axisX - 2, 2])
    expect(uw.end).toEqual([2 * axisX - 6, 2])
    // Elevation is vertical → untouched.
    expect(lvl.elevation).toBe(3)
    // Upper door handedness flips too.
    expect(lvl.openings[0].hinge).toBe('start') // was 'end'
    expect(lvl.openings[0].swing).toBe('right') // was 'left'
    // Area preserved.
    expect(planRoomArea(lvl.rooms[0])).toBeCloseTo(planRoomArea(before.upperLevels![0].rooms[0]), 9)
  })
})

describe('mirrorPlanRegion — composition (double-mirror = identity)', () => {
  it('mirroring twice about the same axis restores every coordinate', () => {
    const p = makePlan()
    const axisX = 2.5
    const once = mirrorPlanRegion(p, [], axisX)
    const twice = mirrorPlanRegion(once.plan, once.items, axisX)
    // Deep value-equality with the original (fresh refs, identical values).
    expect(twice.plan).toEqual(p)
  })

  it('double-mirror restores furniture position, rotation and flipX', () => {
    const it = item({ flipX: true })
    const axisX = 1.5
    const m1 = mirrorItem(it, axisX)
    const m2 = mirrorItem(m1, axisX)
    expect(m2.position).toEqual(it.position)
    expect(m2.rotation).toBeCloseTo(it.rotation, 9)
    expect(m2.flipX).toBe(it.flipX)
  })
})

describe('mirrorPlanRegion — furniture', () => {
  it('reflects position X, negates rotation, toggles flipX; preserves z + size', () => {
    const axisX = 3
    const { items } = mirrorPlanRegion(makePlan(), [item()], axisX)
    expect(items[0].position).toEqual([2 * axisX - 2, 3])
    expect(items[0].rotation).toBeCloseTo(-0.4, 9)
    expect(items[0].flipX).toBe(true)
    expect(items[0].props.width).toBe(1.5)
    expect(items[0].props.depth).toBe(2)
  })

  it('preserves elevation and levelId', () => {
    const { items } = mirrorPlanRegion(makePlan(), [item({ elevation: 0.5, levelId: 'lvl2' })], 0)
    expect(items[0].elevation).toBe(0.5)
    expect(items[0].levelId).toBe('lvl2')
  })
})

describe('mirrorPlanRegion — edge cases & purity', () => {
  it('handles an empty plan (no walls/rooms/openings/items)', () => {
    const empty: FloorPlan = {
      id: 'e',
      name: 'Empty',
      ceilingHeight: 2.6,
      extent: [4, 4],
      walls: [],
      openings: [],
      rooms: [],
    }
    const { plan, items } = mirrorPlanRegion(empty, [], 2)
    expect(plan.walls).toEqual([])
    expect(plan.rooms).toEqual([])
    expect(items).toEqual([])
    // Absent optional arrays stay absent (no spurious empty arrays).
    expect(plan.notes).toBeUndefined()
    expect(plan.upperLevels).toBeUndefined()
  })

  it('mirrors about the origin by default (axisX = 0)', () => {
    const { plan } = mirrorPlanRegion(makePlan())
    expect(plan.walls.find((w) => w.id === 'w1')!.start).toEqual([-1, 1])
  })

  it('rejects a non-finite axis', () => {
    const p = makePlan()
    expect(() => mirrorPlanRegion(p, [], Number.NaN)).toThrow(RangeError)
    expect(() => mirrorPlanRegion(p, [], Number.POSITIVE_INFINITY)).toThrow(RangeError)
  })

  it('does not mutate the input plan or items', () => {
    const p = makePlan()
    const it = item()
    mirrorPlanRegion(p, [it], 5)
    expect(p.walls[0].start).toEqual([1, 1])
    expect(p.walls[1].arc).toBe(0.5)
    expect(p.openings[0].hinge).toBe('start')
    expect(it.position).toEqual([2, 3])
    expect(it.flipX).toBeUndefined()
  })
})
