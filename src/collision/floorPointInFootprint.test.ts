import { describe, expect, it } from 'vitest'
import type { BuiltinGltfDef, FurnitureItem } from '../furniture/types'
import { floorPointInFootprint } from './placement'

// A 1.0 × 0.6 rectangular piece (no footprint parts → single OBB == min-span).
const def: BuiltinGltfDef = {
  id: 'probe',
  name: 'Probe',
  category: 'decor',
  kind: 'gltf',
  source: 'builtin',
  url: '/none.glb',
  license: 'CC0',
  defaultFootprint: { w: 1.0, d: 0.6, h: 0.5 },
}

const item = (over: Partial<FurnitureItem> = {}): FurnitureItem => ({
  id: 'p1',
  defId: 'probe',
  position: [2, 3],
  rotation: 0,
  props: {},
  ...over,
})

describe('floorPointInFootprint (HOVER-FOOTPRINT)', () => {
  it('is true at the footprint centre', () => {
    expect(floorPointInFootprint(2, 3, item(), def)).toBe(true)
  })

  it('is true just inside each edge and false just outside', () => {
    const it = item() // hx = 0.5, hz = 0.3 about centre [2, 3]
    expect(floorPointInFootprint(2.49, 3, it, def)).toBe(true)
    expect(floorPointInFootprint(2.51, 3, it, def)).toBe(false)
    expect(floorPointInFootprint(2, 3.29, it, def)).toBe(true)
    expect(floorPointInFootprint(2, 3.31, it, def)).toBe(false)
  })

  it('respects the item yaw: a 90° rotation swaps the effective extents', () => {
    const rot = item({ rotation: Math.PI / 2 })
    // After 90°, the 1.0m width runs along local X → world Z; the 0.6m depth → world X.
    expect(floorPointInFootprint(2.29, 3, rot, def)).toBe(true) // within ±0.3 in world X
    expect(floorPointInFootprint(2.31, 3, rot, def)).toBe(false)
    expect(floorPointInFootprint(2, 3.49, rot, def)).toBe(true) // within ±0.5 in world Z
    expect(floorPointInFootprint(2, 3.51, rot, def)).toBe(false)
  })

  it('a point clearly outside the footprint is false', () => {
    expect(floorPointInFootprint(10, 10, item(), def)).toBe(false)
  })
})
