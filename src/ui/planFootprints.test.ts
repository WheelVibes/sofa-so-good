import { describe, expect, it } from 'vitest'
import type { FurnitureDef, FurnitureItem } from '../furniture/types'
import { planFootprints } from './planFootprints'

/** Minimal placed item at the origin, unrotated. */
function item(defId: string, over: Partial<FurnitureItem> = {}): FurnitureItem {
  return {
    id: `i-${defId}`,
    defId,
    position: [0, 0, 0],
    rotation: 0,
    props: {},
    ...over,
  } as FurnitureItem
}

/** Primitive def with a 2 × 1 m footprint; `parts` adds a decomposition. */
function def(over: Partial<FurnitureDef> = {}): FurnitureDef {
  return {
    id: 'd',
    name: 'D',
    category: 'seating',
    kind: 'primitive',
    defaultFootprint: { w: 2, d: 1 },
    ...over,
  } as FurnitureDef
}

describe('planFootprints', () => {
  it('emits one 4-corner polygon for a def with no footprintParts', () => {
    const out = planFootprints([item('d')], { d: def() })
    expect(out).toHaveLength(1)
    expect(out[0]!.corners).toHaveLength(4)
  })

  it('preserves the previous single-OBB corners exactly when there are no parts', () => {
    const out = planFootprints([item('d')], { d: def() })
    const xs = out[0]!.corners.map((c) => c[0]).sort((a, b) => a - b)
    const zs = out[0]!.corners.map((c) => c[1]).sort((a, b) => a - b)
    // A 2 × 1 box centred on the origin.
    expect(xs[0]).toBeCloseTo(-1)
    expect(xs[3]).toBeCloseTo(1)
    expect(zs[0]).toBeCloseTo(-0.5)
    expect(zs[3]).toBeCloseTo(0.5)
  })

  it('emits one polygon PER part for a decomposed (non-rectangular) def', () => {
    const parts = [
      { dx: -0.5, dz: 0, w: 1, d: 1 },
      { dx: 0.5, dz: 0, w: 1, d: 0.5 },
    ]
    const out = planFootprints([item('d')], { d: def({ footprintParts: parts } as never) })
    expect(out).toHaveLength(2)
    for (const f of out) expect(f.corners).toHaveLength(4)
  })

  it('does not claim bbox corners a decomposed def never occupies', () => {
    // A part set narrower than the 2 × 1 bbox in +z must leave that corner free.
    const parts = [{ dx: 0, dz: -0.25, w: 2, d: 0.5 }]
    const out = planFootprints([item('d')], { d: def({ footprintParts: parts } as never) })
    const maxZ = Math.max(...out.flatMap((f) => f.corners.map((c) => c[1])))
    expect(maxZ).toBeLessThan(0.5)
  })

  it("marks a decomposed item's parts as outline:false so internal edges are not drawn", () => {
    const parts = [
      { dx: -0.5, dz: 0, w: 1, d: 1 },
      { dx: 0.5, dz: 0, w: 1, d: 1 },
    ]
    const out = planFootprints([item('d')], { d: def({ footprintParts: parts } as never) })
    expect(out).toHaveLength(2)
    expect(out.every((f) => f.outline === false)).toBe(true)
  })

  it('keeps outline:true for a whole-item rectangle (unchanged hairline edge)', () => {
    const out = planFootprints([item('d')], { d: def() })
    expect(out[0]!.outline).toBe(true)
  })

  it('tints every polygon of one item with its category colour', () => {
    const parts = [
      { dx: -0.5, dz: 0, w: 1, d: 1 },
      { dx: 0.5, dz: 0, w: 1, d: 1 },
    ]
    const out = planFootprints([item('d')], { d: def({ footprintParts: parts } as never) })
    expect(new Set(out.map((f) => f.fill)).size).toBe(1)
    expect(out[0]!.fill).toBeTruthy()
  })

  it('skips an item whose def is missing from the catalog', () => {
    expect(planFootprints([item('nope')], { d: def() })).toEqual([])
  })

  it('skips a malformed def with no defaultFootprint rather than throwing', () => {
    const bad = {
      id: 'd',
      name: 'D',
      category: 'seating',
      kind: 'primitive',
    } as unknown as FurnitureDef
    expect(() => planFootprints([item('d')], { d: bad })).not.toThrow()
    expect(planFootprints([item('d')], { d: bad })).toEqual([])
  })

  it('honours rotation (a 90° turn swaps the drawn extents)', () => {
    const out = planFootprints([item('d', { rotation: Math.PI / 2 })], { d: def() })
    const xs = out[0]!.corners.map((c) => c[0])
    const zs = out[0]!.corners.map((c) => c[1])
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(1)
    expect(Math.max(...zs) - Math.min(...zs)).toBeCloseTo(2)
  })
})
