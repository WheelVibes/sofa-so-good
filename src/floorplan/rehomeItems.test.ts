import { describe, expect, it } from 'vitest'
import { rehomeStrandedItems } from './rehomeItems'
import type { FloorPlan } from './types'

const plan = (rooms: FloorPlan['rooms']): FloorPlan => ({
  id: 'p',
  name: 'P',
  ceilingHeight: 2.6,
  extent: [10, 10],
  walls: [],
  openings: [],
  rooms,
})

const ROOM = { id: 'r1', name: 'R1', origin: [0, 0] as [number, number], width: 4, depth: 4 }
const item = (x: number, z: number, defId = 'sofa') => ({
  defId,
  position: [x, z] as [number, number],
})

describe('rehomeStrandedItems', () => {
  it('leaves items that are inside a room untouched, by identity', () => {
    const items = [item(2, 2), item(0.1, 3.9)]
    const out = rehomeStrandedItems(plan([ROOM]), items)
    // Same array AND same objects: an unchanged design must not churn state.
    expect(out).toBe(items)
    expect(out[0]).toBe(items[0])
  })

  it('tolerates an item placed flush against a wall (just outside the rect)', () => {
    const items = [item(-0.15, 2)]
    expect(rehomeStrandedItems(plan([ROOM]), items)).toBe(items)
  })

  it('pulls a stranded item back inside the nearest room', () => {
    const out = rehomeStrandedItems(plan([ROOM]), [item(9, 2)])
    const [x, z] = out[0].position
    expect(x).toBeLessThanOrEqual(4)
    expect(x).toBeGreaterThan(0)
    // Inset from the edge so the item's BODY lands inside, not just its centre.
    expect(x).toBeCloseTo(3.7, 6)
    expect(z).toBeCloseTo(2, 6)
  })

  it('picks the nearest of several rooms', () => {
    const far = { ...ROOM, id: 'r2', origin: [20, 20] as [number, number] }
    const out = rehomeStrandedItems(plan([ROOM, far]), [item(6, 2)])
    expect(out[0].position[0]).toBeCloseTo(3.7, 6)
  })

  it('honours `skip` for wall-mounted / no-clip defs', () => {
    const items = [item(9, 2, 'wall-art')]
    const out = rehomeStrandedItems(plan([ROOM]), items, { skip: (d) => d === 'wall-art' })
    expect(out).toBe(items)
  })

  it('leaves everything alone when the plan has no rooms to move into', () => {
    // An empty canvas is a legitimate state — do not invent a position.
    const items = [item(9, 2)]
    expect(rehomeStrandedItems(plan([]), items)).toBe(items)
  })

  it('resolves a polygon room by its real outline, not its declared rect', () => {
    // An L: the declared width/depth box covers (5,5), the polygon does not.
    const poly = plan([
      {
        ...ROOM,
        width: 6,
        depth: 6,
        polygon: [
          [0, 0],
          [6, 0],
          [6, 2],
          [2, 2],
          [2, 6],
          [0, 6],
        ],
      },
    ])
    // Inside the L's arm — stays put.
    expect(rehomeStrandedItems(poly, [item(1, 5)])[0].position).toEqual([1, 5])
    // Deep in the notch, well outside the polygon — moved back in.
    expect(rehomeStrandedItems(poly, [item(5, 5)])[0].position).not.toEqual([5, 5])
  })

  it('returns the array unchanged when nothing needed moving', () => {
    const items = [item(1, 1), item(2, 2), item(3, 3)]
    expect(rehomeStrandedItems(plan([ROOM]), items)).toBe(items)
  })
})
