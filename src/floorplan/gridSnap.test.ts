import { describe, expect, it } from 'vitest'
import type { FurnitureItem } from '../furniture/types'
import { snapPlanToGrid } from './gridSnap'
import type { FloorPlan } from './types'

const GRID = 0.05

/** Every number in a coordinate list lands on a multiple of `gridM`. */
function onGrid(values: number[], gridM = GRID): boolean {
  return values.every((v) => Math.abs(v / gridM - Math.round(v / gridM)) < 1e-9)
}

/** Collect every coordinate the snapper touches across a plan (ground + storeys). */
function allCoords(plan: FloorPlan): number[] {
  const out: number[] = [...plan.extent]
  const sweep = (g: {
    walls: FloorPlan['walls']
    openings: FloorPlan['openings']
    rooms: FloorPlan['rooms']
  }) => {
    for (const w of g.walls) out.push(w.start[0], w.start[1], w.end[0], w.end[1])
    for (const o of g.openings) out.push(o.offset, o.width)
    for (const r of g.rooms) {
      out.push(r.origin[0], r.origin[1], r.width, r.depth)
      if (r.extension) {
        out.push(r.extension.offset[0], r.extension.offset[1], r.extension.width, r.extension.depth)
      }
      if (r.polygon) for (const p of r.polygon) out.push(p[0], p[1])
      if (r.labelOffset) out.push(r.labelOffset[0], r.labelOffset[1])
    }
  }
  sweep(plan)
  for (const lvl of plan.upperLevels ?? []) {
    out.push(lvl.elevation)
    sweep(lvl)
  }
  for (const n of plan.notes ?? []) out.push(n.x, n.z)
  for (const d of plan.dimensions ?? []) out.push(d.a[0], d.a[1], d.b[0], d.b[1])
  for (const pl of plan.polylines ?? []) for (const pt of pl.points) out.push(pt[0], pt[1])
  return out
}

/** An off-grid plan with one upper storey + annotations + an opening. */
function offGridPlan(): FloorPlan {
  return {
    id: 'p1',
    name: 'off-grid',
    ceilingHeight: 2.63,
    extent: [5.43, 4.41],
    walls: [
      { id: 'w1', start: [0.07, 0.13], end: [5.36, 0.13], thickness: 'external' },
      { id: 'w2', start: [5.36, 0.13], end: [5.36, 4.28], thickness: 'external' },
    ],
    openings: [
      { id: 'o1', kind: 'door', wallId: 'w1', offset: 1.23, width: 0.91, sill: 0, head: 2 },
    ],
    rooms: [
      {
        id: 'r1',
        name: 'Living',
        origin: [0.17, 0.23],
        width: 3.11,
        depth: 2.97,
        extension: { offset: [3.11, 0.41], width: 1.02, depth: 1.53 },
        labelOffset: [0.12, -0.08],
      },
      {
        id: 'r2',
        name: 'Poly',
        origin: [0, 0],
        width: 2,
        depth: 2,
        polygon: [
          [0.07, 3.13],
          [2.11, 3.13],
          [2.11, 4.27],
          [0.07, 4.27],
        ],
      },
    ],
    upperLevels: [
      {
        id: 'L2',
        name: 'Level 2',
        elevation: 2.93,
        walls: [{ id: 'uw1', start: [0.07, 0.13], end: [3.39, 0.13], thickness: 'internal' }],
        openings: [
          {
            id: 'uo1',
            kind: 'window',
            wallId: 'uw1',
            offset: 0.83,
            width: 1.21,
            sill: 0.9,
            head: 2.1,
          },
        ],
        rooms: [{ id: 'ur1', name: 'Loft', origin: [0.17, 0.21], width: 3.03, depth: 2.51 }],
      },
    ],
    notes: [{ id: 'n1', x: 1.37, z: 2.44, text: 'hi' }],
    dimensions: [{ id: 'd1', a: [0.07, 0.13], b: [5.36, 0.13] }],
    polylines: [
      {
        id: 'pl1',
        points: [
          [0.11, 0.22],
          [1.33, 2.44],
        ],
      },
    ],
  }
}

describe('snapPlanToGrid', () => {
  it('lands every coordinate on a multiple of the grid (incl. upper storeys + annotations)', () => {
    const { plan } = snapPlanToGrid(offGridPlan(), [], GRID)
    expect(onGrid(allCoords(plan))).toBe(true)
  })

  it('snaps at a coarser grid too', () => {
    const { plan } = snapPlanToGrid(offGridPlan(), [], 0.25)
    expect(onGrid(allCoords(plan), 0.25)).toBe(true)
  })

  it('is idempotent — snapping a snapped plan changes nothing', () => {
    const once = snapPlanToGrid(offGridPlan(), [], GRID).plan
    const twice = snapPlanToGrid(once, [], GRID).plan
    expect(twice).toEqual(once)
  })

  it('leaves an already-on-grid plan unchanged (value-equal)', () => {
    const onGridPlan: FloorPlan = {
      id: 'p',
      name: 'on-grid',
      ceilingHeight: 2.6,
      extent: [5, 4],
      walls: [{ id: 'w', start: [0, 0], end: [5, 0], thickness: 'external' }],
      openings: [{ id: 'o', kind: 'door', wallId: 'w', offset: 1, width: 0.9, sill: 0, head: 2 }],
      rooms: [{ id: 'r', name: 'R', origin: [0.5, 0.5], width: 3, depth: 2.5 }],
    }
    const { plan } = snapPlanToGrid(onGridPlan, [], GRID)
    expect(plan).toEqual(onGridPlan)
  })

  it('throws on gridM <= 0 / non-finite', () => {
    expect(() => snapPlanToGrid(offGridPlan(), [], 0)).toThrow(RangeError)
    expect(() => snapPlanToGrid(offGridPlan(), [], -0.05)).toThrow(RangeError)
    expect(() => snapPlanToGrid(offGridPlan(), [], Number.NaN)).toThrow(RangeError)
    expect(() => snapPlanToGrid(offGridPlan(), [], Number.POSITIVE_INFINITY)).toThrow(RangeError)
  })

  it('does not mutate the input plan', () => {
    const input = offGridPlan()
    const before = JSON.stringify(input)
    snapPlanToGrid(input, [], GRID)
    expect(JSON.stringify(input)).toBe(before)
  })

  it('keeps every opening on its (snapped) wall — offset within [0, wallLen - width]', () => {
    const { plan } = snapPlanToGrid(offGridPlan(), [], GRID)
    const check = (g: { walls: FloorPlan['walls']; openings: FloorPlan['openings'] }) => {
      for (const o of g.openings) {
        const w = g.walls.find((ww) => ww.id === o.wallId)
        if (!w) continue
        const wlen = Math.hypot(w.end[0] - w.start[0], w.end[1] - w.start[1])
        expect(o.offset).toBeGreaterThanOrEqual(0)
        expect(o.offset + o.width).toBeLessThanOrEqual(wlen + 1e-9)
      }
    }
    check(plan)
    for (const lvl of plan.upperLevels ?? []) check(lvl)
  })

  it('clamps a near-edge opening back onto a shortened wall', () => {
    // A door near the far end of a wall that shrinks when snapped must not run off.
    const plan: FloorPlan = {
      id: 'p',
      name: 'n',
      ceilingHeight: 2.6,
      extent: [3, 3],
      walls: [{ id: 'w', start: [0.02, 0], end: [2.04, 0], thickness: 'external' }],
      openings: [
        { id: 'o', kind: 'door', wallId: 'w', offset: 1.13, width: 0.91, sill: 0, head: 2 },
      ],
      rooms: [],
    }
    const snapped = snapPlanToGrid(plan, [], GRID).plan
    const w = snapped.walls[0]
    const wlen = Math.hypot(w.end[0] - w.start[0], w.end[1] - w.start[1])
    const o = snapped.openings[0]
    expect(o.offset + o.width).toBeLessThanOrEqual(wlen + 1e-9)
  })

  it('leaves a wall that would collapse to zero length unsnapped (never drops it)', () => {
    // Both endpoints round to [0,0] at a 0.5 m grid — keep the original geometry.
    const plan: FloorPlan = {
      id: 'p',
      name: 'n',
      ceilingHeight: 2.6,
      extent: [1, 1],
      walls: [{ id: 'stub', start: [0.04, 0.03], end: [0.12, 0.06], thickness: 'internal' }],
      openings: [],
      rooms: [],
    }
    const snapped = snapPlanToGrid(plan, [], 0.5).plan
    expect(snapped.walls).toHaveLength(1)
    const w = snapped.walls[0]
    // Untouched endpoints (not collapsed to a single point).
    expect(w.start).toEqual([0.04, 0.03])
    expect(w.end).toEqual([0.12, 0.06])
  })

  it('preserves furniture by default and snaps positions only when opted in', () => {
    const items: FurnitureItem[] = [
      {
        id: 'i1',
        defId: 'sofa' as FurnitureItem['defId'],
        position: [1.23, 2.47],
        rotation: 0,
        props: { width: 2 },
      },
    ]
    const kept = snapPlanToGrid(offGridPlan(), items, GRID)
    expect(kept.items[0].position).toEqual([1.23, 2.47])

    const snapped = snapPlanToGrid(offGridPlan(), items, GRID, { snapFurniture: true })
    expect(onGrid(snapped.items[0].position)).toBe(true)
    // Size is always preserved.
    expect(snapped.items[0].props.width).toBe(2)
  })

  it('defaults the grid to 0.05 m when unspecified', () => {
    const { plan, gridM } = snapPlanToGrid(offGridPlan())
    expect(gridM).toBe(0.05)
    expect(onGrid(allCoords(plan), 0.05)).toBe(true)
  })
})
