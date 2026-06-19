import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Spy on drei's useGLTF.clear so we can assert eviction clears each url an
// asset can be loaded under (base + tier variants). We keep the real module
// otherwise so the rest of GltfModel imports unchanged. `vi.hoisted` runs the
// spy creation before the hoisted `vi.mock` factory references it.
const clearSpy = vi.hoisted(() => vi.fn())
vi.mock('@react-three/drei', async (orig) => {
  const mod = (await orig()) as Record<string, unknown>
  const useGLTF = mod.useGLTF as { clear: (u: string | string[]) => void }
  useGLTF.clear = clearSpy
  return mod
})

import {
  __resetLoadedScenesForTest,
  evictGltfAsset,
  getCachedGltfFootprint,
  getCachedSupportPlaneY,
  seedGltfFootprint,
  seedGltfSupportPlane,
} from './GltfModel'
import { __resetLodCacheForTest, registerLodVariants } from './gltf/lod'

beforeEach(() => {
  clearSpy.mockClear()
  __resetLodCacheForTest()
  __resetLoadedScenesForTest()
})

afterEach(() => {
  __resetLodCacheForTest()
  __resetLoadedScenesForTest()
})

describe('evictGltfAsset', () => {
  it('clears the drei cache for the base url and its suffix-derived tier siblings', () => {
    evictGltfAsset('/m/chair.glb')
    const cleared = clearSpy.mock.calls.map((c) => c[0])
    expect(cleared).toContain('/m/chair.glb')
    expect(cleared).toContain('/m/chair-low.glb')
    expect(cleared).toContain('/m/chair-medium.glb')
  })

  it('clears registered upload blob variants too (base + low + medium)', () => {
    registerLodVariants('blob:base', { low: 'blob:low', medium: 'blob:med' })
    evictGltfAsset('blob:base')
    const cleared = clearSpy.mock.calls.map((c) => c[0])
    expect(cleared).toContain('blob:base')
    expect(cleared).toContain('blob:low')
    expect(cleared).toContain('blob:med')
  })

  it('resolves a tier-variant url back to the base before clearing', () => {
    // Passing the low-variant url must evict the whole asset (base + siblings).
    evictGltfAsset('/m/chair-low.glb')
    const cleared = clearSpy.mock.calls.map((c) => c[0])
    expect(cleared).toContain('/m/chair.glb')
    expect(cleared).toContain('/m/chair-low.glb')
    expect(cleared).toContain('/m/chair-medium.glb')
  })

  it('prunes the footprint + support-plane module caches for the removed asset', () => {
    seedGltfFootprint('/m/chair.glb', { w: 1, d: 1, h: 1, anchorOffset: [0, 0, 0] })
    seedGltfSupportPlane('/m/chair.glb', 0.4)
    expect(getCachedGltfFootprint('/m/chair.glb')).not.toBeNull()
    expect(getCachedSupportPlaneY('/m/chair.glb')).toBe(0.4)

    evictGltfAsset('/m/chair.glb')

    expect(getCachedGltfFootprint('/m/chair.glb')).toBeNull()
    expect(getCachedSupportPlaneY('/m/chair.glb')).toBeNull()
  })

  it('does not evict a different asset that is still in use', () => {
    seedGltfFootprint('/m/keep.glb', { w: 1, d: 1, h: 1, anchorOffset: [0, 0, 0] })
    seedGltfFootprint('/m/drop.glb', { w: 2, d: 2, h: 2, anchorOffset: [0, 0, 0] })

    evictGltfAsset('/m/drop.glb')

    expect(getCachedGltfFootprint('/m/drop.glb')).toBeNull()
    // The other asset's footprint is untouched.
    expect(getCachedGltfFootprint('/m/keep.glb')).not.toBeNull()
  })

  it('is a no-op for an asset that was never loaded/cached', () => {
    expect(() => evictGltfAsset('/m/never.glb')).not.toThrow()
    // Still clears the (empty) cache slots — harmless.
    expect(getCachedGltfFootprint('/m/never.glb')).toBeNull()
  })
})
