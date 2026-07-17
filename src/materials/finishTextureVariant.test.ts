// @vitest-environment happy-dom
/**
 * Asset Studio Stage 6c — the scaled/grain-rotated finish texture variant cache
 * is bounded (a slider drag reuses a small key set, never leaks a clone per
 * frame) and never mutates the shared source texture.
 */
import { CanvasTexture } from 'three'
import { afterEach, describe, expect, it } from 'vitest'
import {
  __clearFinishVariantCacheForTest,
  __finishVariantCacheSizeForTest,
  finishTextureVariant,
  finishVariantKey,
} from './finishTextureVariant'

function tex(): CanvasTexture {
  const c = document.createElement('canvas')
  c.width = c.height = 4
  const t = new CanvasTexture(c)
  t.repeat.set(2, 2)
  return t
}

afterEach(() => __clearFinishVariantCacheForTest())

describe('finishTextureVariant', () => {
  it('scale divides the base repeat (larger = coarser); rotation sets radians', () => {
    const base = tex()
    const v = finishTextureVariant(base, 2, 90)
    // repeat halved (2 / scale), rotation 90° in radians about the centre.
    expect(v.repeat.x).toBeCloseTo(1, 5)
    expect(v.repeat.y).toBeCloseTo(1, 5)
    expect(v.rotation).toBeCloseTo(Math.PI / 2, 5)
    expect(v.center.x).toBeCloseTo(0.5, 5)
  })

  it('never mutates the shared source texture', () => {
    const base = tex()
    finishTextureVariant(base, 4, 90)
    expect(base.repeat.x).toBe(2)
    expect(base.repeat.y).toBe(2)
    expect(base.rotation).toBe(0)
  })

  it('reuses a cached variant for the same (source, scale, rotation)', () => {
    const base = tex()
    const a = finishTextureVariant(base, 1.5, 0)
    const b = finishTextureVariant(base, 1.5, 0)
    expect(a).toBe(b)
    expect(__finishVariantCacheSizeForTest()).toBe(1)
  })

  it('stays bounded across a slider sweep (distinct keys, not one-per-frame)', () => {
    const base = tex()
    // 300 slider frames but only a handful of distinct rounded (scale, rotation)
    // values → the cache holds only those distinct variants, bounded by max.
    for (let i = 0; i < 300; i++) {
      const scale = 0.25 + (i % 8) * 0.5 // 8 distinct scales
      finishTextureVariant(base, scale, i % 2 === 0 ? 0 : 90)
    }
    // 8 scales × 2 rotations = 16 distinct variants — nowhere near the 96 bound,
    // and crucially NOT 300 (no per-frame leak).
    expect(__finishVariantCacheSizeForTest()).toBeLessThanOrEqual(16)
  })

  it('key is stable + distinct per (uuid, scale, rotation)', () => {
    const base = tex()
    expect(finishVariantKey(base, 2, 90)).toBe(finishVariantKey(base, 2, 90))
    expect(finishVariantKey(base, 2, 90)).not.toBe(finishVariantKey(base, 2, 0))
  })
})
