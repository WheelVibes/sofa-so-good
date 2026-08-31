import { describe, expect, it } from 'vitest'
import { SWAPPABLE_MAP_SLOTS, syncMaterialMaps } from './materialMapSync'

/** The two textures PERF-C swaps between: a 64² quick preview and the real bake. */
const preview = { id: 'preview-64' }
const upgraded = { id: 'upgraded-512' }

describe('syncMaterialMaps', () => {
  it('re-points a stale clone at the source’s upgraded maps', () => {
    const source = { map: upgraded, normalMap: upgraded, roughnessMap: upgraded }
    const clone = { map: preview, normalMap: preview, roughnessMap: preview }
    expect(syncMaterialMaps(source, clone)).toBe(true)
    expect(clone.map).toBe(upgraded)
    expect(clone.normalMap).toBe(upgraded)
    expect(clone.roughnessMap).toBe(upgraded)
  })

  it('reports no change when the clone is already current', () => {
    const source = { map: upgraded, normalMap: upgraded }
    const clone = { map: upgraded, normalMap: upgraded }
    expect(syncMaterialMaps(source, clone)).toBe(false)
  })

  // This is the case that makes the false return worth having: the signal is
  // global, so a face clone is asked to sync on EVERY material's swap and must
  // not request a frame for one it has nothing to do with.
  it('is a no-op for an unrelated material’s swap', () => {
    const source = { map: upgraded }
    const clone = { map: upgraded }
    expect(syncMaterialMaps(source, clone)).toBe(false)
    expect(clone.map).toBe(upgraded)
  })

  it('carries the metalness scalar the same swap writes', () => {
    const source = { metalness: 0.9 }
    const clone = { metalness: 0 }
    expect(syncMaterialMaps(source, clone)).toBe(true)
    expect(clone.metalness).toBe(0.9)
  })

  it('copies an undefined slot so a clone cannot keep a map the source dropped', () => {
    const source: { map?: unknown } = {}
    const clone: { map?: unknown } = { map: preview }
    expect(syncMaterialMaps(source, clone)).toBe(true)
    expect(clone.map).toBeUndefined()
  })

  it('covers every slot the worker upgrade replaces', () => {
    expect([...SWAPPABLE_MAP_SLOTS]).toEqual([
      'map',
      'normalMap',
      'roughnessMap',
      'aoMap',
      'metalnessMap',
      'metalness',
    ])
  })
})
