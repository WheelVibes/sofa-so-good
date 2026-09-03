import { describe, expect, it, vi } from 'vitest'
import { effectiveAssetTier } from '../../scene/quality'
import { __resetLodCacheForTest, resolveLodUrlSync } from './lod'
import { applyTextureBudget } from './textureBudget'

describe('Original (high) asset tier is lossless', () => {
  it('resolves to the base GLB url with no LOD suffix', () => {
    __resetLodCacheForTest()
    const url = 'https://example.com/assets/furniture/sofa.glb'
    expect(resolveLodUrlSync(url, 'high')).toBe(url)
  })

  it('applyTextureBudget is a no-op on high (never resizes)', () => {
    const resize = vi.fn()
    // A fake mesh whose texture is well over any budget cap.
    const tex = { image: { width: 8192, height: 8192 }, needsUpdate: false }
    const root = {
      traverse(fn: (o: unknown) => void) {
        fn({ isMesh: true, material: { map: tex } })
      },
    } as unknown as import('three').Object3D
    applyTextureBudget(root, 'high', resize as never)
    expect(resize).not.toHaveBeenCalled()
    expect(tex.needsUpdate).toBe(false)
  })

  it('an explicit Original choice is never overridden by the render tier', () => {
    // Whatever the render tier (incl. the mobile/desktop default Performance),
    // an explicit high asset tier stays high — no device branch exists.
    expect(effectiveAssetTier('high', 'performance', 'weak')).toBe('high')
    expect(effectiveAssetTier('high', 'performance', 'capable')).toBe('high')
    expect(effectiveAssetTier('high', 'realistic', 'capable')).toBe('high')
  })
})
