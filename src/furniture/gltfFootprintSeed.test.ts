import { describe, expect, it } from 'vitest'
import { getCachedGltfFootprint, seedGltfFootprint } from './GltfModel'

describe('seedGltfFootprint', () => {
  it('seeds a cache entry from footprint + anchor offset', () => {
    seedGltfFootprint('blob:test-1', { w: 1.05, d: 2.09, h: 1.0, anchorOffset: [0.1, 0.5, -0.2] })
    expect(getCachedGltfFootprint('blob:test-1')).toEqual({
      w: 1.05,
      d: 2.09,
      h: 1.0,
      ox: 0.1,
      oz: -0.2,
    })
  })
  it('does not overwrite an existing entry', () => {
    seedGltfFootprint('blob:test-2', { w: 1, d: 1, h: 1, anchorOffset: [0, 0, 0] })
    seedGltfFootprint('blob:test-2', { w: 9, d: 9, h: 9, anchorOffset: [0, 0, 0] })
    expect(getCachedGltfFootprint('blob:test-2')?.w).toBe(1)
  })
  it('keys by the base url so tier-variant lookups hit the seeded entry', () => {
    seedGltfFootprint('/m/sofa.glb', { w: 2, d: 1, h: 0.8, anchorOffset: [0, 0, 0] })
    // A low/medium variant url must resolve to the same (base-keyed) footprint.
    expect(getCachedGltfFootprint('/m/sofa-low.glb')?.w).toBe(2)
    expect(getCachedGltfFootprint('/m/sofa-medium.glb')?.w).toBe(2)
  })
})
