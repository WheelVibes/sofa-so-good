import { describe, expect, it } from 'vitest'
import type { PlanRoom } from '../floorplan/types'
import { BUILTIN_CATALOG } from './builtinCatalog'
import { itemPrice } from './furniturePrices'
import { spendByRoom } from './spendByRoom'
import type { FurnitureItem } from './types'

const room = (id: string, ox: number, oz: number): PlanRoom => ({
  id,
  name: id,
  origin: [ox, oz],
  width: 4,
  depth: 4,
})

const at = (defId: string, x: number, z: number): FurnitureItem => ({
  id: `${defId}-${x}-${z}`,
  defId,
  position: [x, z],
  rotation: 0,
  props: {},
})

describe('spendByRoom', () => {
  const rooms = [room('a', 0, 0), room('b', 10, 0)]
  const sofa = BUILTIN_CATALOG['sofa-3seat']
  const stool = BUILTIN_CATALOG['bar-stool']

  it('groups spend by the room each item sits in, highest first', () => {
    const items = [at('sofa-3seat', 1, 1), at('bar-stool', 11, 1)] // a, b
    const { rows, sum } = spendByRoom(items, BUILTIN_CATALOG, rooms)
    expect(sum).toBe(itemPrice(sofa, sofa.category) + itemPrice(stool, stool.category))
    expect(rows[0].amt).toBeGreaterThanOrEqual(rows[1].amt) // sorted desc
    expect(rows.find((r) => r.name === 'a')!.amt).toBe(itemPrice(sofa, sofa.category))
  })

  it('buckets items outside any room under "Outside rooms"', () => {
    const { rows } = spendByRoom([at('bar-stool', 99, 99)], BUILTIN_CATALOG, rooms)
    expect(rows).toHaveLength(1)
    expect(rows[0].name).toBe('Outside rooms')
  })
})
