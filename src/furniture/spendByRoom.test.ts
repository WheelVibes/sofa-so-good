import { describe, expect, it } from 'vitest'
import type { FloorPlan, PlanRoom } from '../floorplan/types'
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

/** A single-storey plan carrying the given rooms. */
const planOf = (rooms: PlanRoom[], upperLevels?: unknown): FloorPlan =>
  ({
    id: 'p',
    name: 'p',
    ceilingHeight: 2.6,
    extent: [40, 40],
    walls: [],
    openings: [],
    rooms,
    ...(upperLevels ? { upperLevels } : {}),
  }) as unknown as FloorPlan

describe('spendByRoom', () => {
  const rooms = [room('a', 0, 0), room('b', 10, 0)]
  const plan = planOf(rooms)
  const sofa = BUILTIN_CATALOG['sofa-3seat']
  const stool = BUILTIN_CATALOG['bar-stool']

  it('groups spend by the room each item sits in, highest first', () => {
    const items = [at('sofa-3seat', 1, 1), at('bar-stool', 11, 1)] // a, b
    const { rows, sum } = spendByRoom(items, BUILTIN_CATALOG, plan)
    expect(sum).toBe(itemPrice(sofa, sofa.category) + itemPrice(stool, stool.category))
    expect(rows[0].amt).toBeGreaterThanOrEqual(rows[1].amt) // sorted desc
    expect(rows.find((r) => r.name === 'a')!.amt).toBe(itemPrice(sofa, sofa.category))
    expect(rows.find((r) => r.name === 'a')!.count).toBe(1)
  })

  it('buckets items outside any room under "Outside rooms"', () => {
    const { rows } = spendByRoom([at('bar-stool', 99, 99)], BUILTIN_CATALOG, plan)
    expect(rows).toHaveLength(1)
    expect(rows[0].name).toBe('Outside rooms')
  })

  it('a per-instance price override (ITEM-META) is reflected in the room total', () => {
    const overridden = { ...at('sofa-3seat', 1, 1), meta: { price: 1 } }
    const { rows, sum } = spendByRoom([overridden], BUILTIN_CATALOG, plan)
    expect(sum).toBe(1)
    expect(rows[0].amt).toBe(1)
  })
})

describe('spendByRoom — multi-storey (F13)', () => {
  const sofa = BUILTIN_CATALOG['sofa-3seat']
  const stool = BUILTIN_CATALOG['bar-stool']

  /** Ground room `a` and upper room `up` occupy the SAME footprint. */
  const stacked = () =>
    planOf(
      [room('a', 0, 0)],
      [
        {
          id: 'upper',
          name: 'Upper',
          elevation: 3,
          walls: [],
          openings: [],
          rooms: [room('up', 0, 0)],
        },
      ],
    )

  it('credits an upstairs item to the upstairs room, not the one below it', () => {
    const upstairs = { ...at('bar-stool', 1, 1), levelId: 'upper' }
    const { rows } = spendByRoom([upstairs], BUILTIN_CATALOG, stacked())
    // Ground-only rooms filed this under "Outside rooms"; a flat room list
    // would have filed it under 'a', the room directly beneath it.
    expect(rows).toHaveLength(1)
    expect(rows[0]!.name).toBe('up')
  })

  it('keeps two stacked rooms separate', () => {
    const { rows } = spendByRoom(
      [at('sofa-3seat', 1, 1), { ...at('bar-stool', 2, 2), levelId: 'upper' }],
      BUILTIN_CATALOG,
      stacked(),
    )
    expect(rows.map((r) => r.name).sort()).toEqual(['a', 'up'])
    expect(rows.find((r) => r.name === 'a')!.amt).toBe(itemPrice(sofa, sofa.category))
    expect(rows.find((r) => r.name === 'up')!.amt).toBe(itemPrice(stool, stool.category))
  })
})
