import { describe, expect, it } from 'vitest'
import { BUILTIN_CATALOG } from './builtinCatalog'
import { itemPrice } from './furniturePrices'
import { itemsCost } from './itemsCost'
import type { FurnitureItem } from './types'

const mk = (defId: string): FurnitureItem => ({
  id: defId,
  defId,
  position: [0, 0],
  rotation: 0,
  props: {},
})

describe('itemsCost', () => {
  it('is 0 for no items', () => {
    expect(itemsCost([], BUILTIN_CATALOG)).toBe(0)
  })

  it('sums each item via itemPrice', () => {
    const sofa = BUILTIN_CATALOG['sofa-3seat']
    const stool = BUILTIN_CATALOG['bar-stool']
    const expected = itemPrice(sofa, sofa.category) + itemPrice(stool, stool.category)
    expect(itemsCost([mk('sofa-3seat'), mk('bar-stool')], BUILTIN_CATALOG)).toBe(expected)
  })

  it('skips unknown def ids', () => {
    const sofa = BUILTIN_CATALOG['sofa-3seat']
    expect(itemsCost([mk('sofa-3seat'), mk('does-not-exist')], BUILTIN_CATALOG)).toBe(
      itemPrice(sofa, sofa.category),
    )
  })
})
