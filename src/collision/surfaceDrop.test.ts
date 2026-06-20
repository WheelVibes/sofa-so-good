import { describe, expect, it } from 'vitest'
import { BUILTIN_CATALOG } from '../furniture/builtinCatalog'
import type { FurnitureItem } from '../furniture/types'
import { resolveSurfaceDropHeight } from './surfaceDrop'

const place = (id: string, defId: string, cx: number, cz: number, rot = 0): FurnitureItem => ({
  id,
  defId,
  position: [cx, cz],
  rotation: rot,
  props: {},
})

// A coffee table (category 'tables') and a sofa (category 'seating') at the origin.
const coffee = place('t', 'coffee-table', 2, 2)
const sofa = place('s', 'sofa-3seat', 8, 8)
const coffeeTop = BUILTIN_CATALOG['coffee-table'].defaultFootprint.h

describe('resolveSurfaceDropHeight', () => {
  it('returns the table top when the point is over a table', () => {
    expect(resolveSurfaceDropHeight(2, 2, [coffee], BUILTIN_CATALOG)).toBeCloseTo(coffeeTop, 5)
  })

  it('returns null over open floor (no support → caller leaves height alone)', () => {
    expect(resolveSurfaceDropHeight(20, 20, [coffee, sofa], BUILTIN_CATALOG)).toBeNull()
  })

  it('ignores soft seating (a sofa is not a decor surface)', () => {
    expect(resolveSurfaceDropHeight(8, 8, [sofa], BUILTIN_CATALOG)).toBeNull()
  })

  it('treats storage (sideboard) as a support surface', () => {
    const sideboard = place('sb', 'sideboard', 5, 5)
    const top = resolveSurfaceDropHeight(5, 5, [sideboard], BUILTIN_CATALOG)
    expect(top).toBeCloseTo(BUILTIN_CATALOG.sideboard.defaultFootprint.h, 5)
  })

  it('picks the HIGHER support when two overlap at the point', () => {
    // A tall sideboard and a low coffee table both under the point → the taller wins.
    const tall = place('sb', 'sideboard', 2, 2)
    const top = resolveSurfaceDropHeight(2, 2, [coffee, tall], BUILTIN_CATALOG)
    expect(top).toBeCloseTo(BUILTIN_CATALOG.sideboard.defaultFootprint.h, 5)
  })

  it('adds the support item elevation to its top', () => {
    const lifted: FurnitureItem = { ...place('t2', 'coffee-table', 3, 3), elevation: 0.5 }
    expect(resolveSurfaceDropHeight(3, 3, [lifted], BUILTIN_CATALOG)).toBeCloseTo(
      coffeeTop + 0.5,
      5,
    )
  })

  it('excludes the dragged item itself', () => {
    // The only support under the point IS the excluded item → null.
    expect(resolveSurfaceDropHeight(2, 2, [coffee], BUILTIN_CATALOG, 't')).toBeNull()
  })

  it('only considers supports on the same level (F13 multi-storey)', () => {
    // A table directly above on level "L1" must not capture a ground-floor drop.
    const upstairs: FurnitureItem = { ...place('up', 'coffee-table', 2, 2), levelId: 'L1' }
    // Dragged item is on the ground (levelId undefined → ground): no same-level support.
    expect(
      resolveSurfaceDropHeight(2, 2, [upstairs], BUILTIN_CATALOG, undefined, undefined),
    ).toBeNull()
    // …but a piece ON L1 dropped at the same spot snaps to that table.
    expect(
      resolveSurfaceDropHeight(2, 2, [upstairs], BUILTIN_CATALOG, undefined, 'L1'),
    ).toBeCloseTo(coffeeTop, 5)
  })

  it('respects the support footprint (a point past the edge misses)', () => {
    // Far outside the coffee table footprint on X.
    expect(resolveSurfaceDropHeight(2 + 50, 2, [coffee], BUILTIN_CATALOG)).toBeNull()
  })
})
