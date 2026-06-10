import { describe, expect, it } from 'vitest'
import { BUILTIN_CATALOG } from './builtinCatalog'
import { itemPrice } from './furniturePrices'
import { buildShoppingGroups } from './shoppingGroups'
import type { FurnitureItem } from './types'

const mk = (defId: string, n: number): FurnitureItem[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `${defId}-${i}`,
    defId,
    position: [0, 0] as [number, number],
    rotation: 0,
    props: {},
  }))

describe('buildShoppingGroups', () => {
  it('totals + counts every priced item', () => {
    const items = [...mk('sofa-3seat', 1), ...mk('dining-chair', 4)]
    const { total, count } = buildShoppingGroups(items, BUILTIN_CATALOG)
    const sofa = BUILTIN_CATALOG['sofa-3seat']
    const chair = BUILTIN_CATALOG['dining-chair']
    expect(count).toBe(5)
    expect(total).toBe(itemPrice(sofa, sofa.category) + 4 * itemPrice(chair, chair.category))
  })

  it('groups identical items into one line with a count', () => {
    const { groups } = buildShoppingGroups(mk('dining-chair', 4), BUILTIN_CATALOG)
    const seating = groups.find((g) => g.cat === 'seating')!
    const line = seating.lines.find((l) => l.defId === 'dining-chair')!
    expect(line.count).toBe(4)
    expect(seating.subtotal).toBe(4 * line.each)
  })

  it('skips unknown defs and ignores empty input', () => {
    expect(buildShoppingGroups([], BUILTIN_CATALOG)).toEqual({ groups: [], total: 0, count: 0 })
    expect(buildShoppingGroups(mk('nope', 3), BUILTIN_CATALOG).count).toBe(0)
  })
})
