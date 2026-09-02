/**
 * `itemsInRoom` — the inverse of `roomAtItem`, and wrong in the same way when
 * hand-rolled. `items.filter((it) => pointInRoom(room, x, z))` sweeps up
 * furniture from every storey overlapping the room's XZ, so a ground-floor
 * "Clear room" would have deleted the loft's furniture too.
 */
import { describe, expect, it } from 'vitest'
import type { FurnitureItem } from '../furniture/types'
import { itemsInRoom } from './levels'
import type { FloorPlan } from './types'

/** Ground `g-live` and upper `u-bed` occupy the SAME 6x5 footprint. */
function stacked(): FloorPlan {
  return {
    id: 'p',
    name: 'p',
    extent: [6, 5],
    ceilingHeight: 2.6,
    walls: [],
    openings: [],
    rooms: [{ id: 'g-live', name: 'Living', origin: [0, 0], width: 6, depth: 5 }],
    upperLevels: [
      {
        id: 'upper',
        name: 'Upper',
        elevation: 3,
        walls: [],
        openings: [],
        rooms: [{ id: 'u-bed', name: 'Bedroom', origin: [0, 0], width: 6, depth: 5 }],
      },
    ],
  } as unknown as FloorPlan
}

const item = (id: string, x: number, z: number, levelId?: string): FurnitureItem =>
  ({
    id,
    defId: 'x',
    position: [x, z],
    rotation: 0,
    props: {},
    ...(levelId ? { levelId } : {}),
  }) as unknown as FurnitureItem

describe('itemsInRoom', () => {
  const items = [item('down', 1, 1), item('up', 2, 2, 'upper'), item('outside', 50, 50)]

  it('returns only the items on the ROOM own storey', () => {
    expect(itemsInRoom(stacked(), items, 'g-live').map((i) => i.id)).toEqual(['down'])
    expect(itemsInRoom(stacked(), items, 'u-bed').map((i) => i.id)).toEqual(['up'])
  })

  it('excludes items outside the room footprint', () => {
    expect(itemsInRoom(stacked(), items, 'g-live').some((i) => i.id === 'outside')).toBe(false)
  })

  it('returns [] for an unknown room id rather than throwing', () => {
    expect(itemsInRoom(stacked(), items, 'nope')).toEqual([])
  })

  it('treats an untagged item as ground', () => {
    expect(itemsInRoom(stacked(), [item('bare', 1, 1)], 'g-live')).toHaveLength(1)
    expect(itemsInRoom(stacked(), [item('bare', 1, 1)], 'u-bed')).toHaveLength(0)
  })
})
