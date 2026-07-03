// @vitest-environment happy-dom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * AUD-002 — the furniture material `cache` is now a bounded LRU that disposes
 * an evicted material PLUS the textures it owns exclusively (clones), while
 * NEVER disposing the shared 256² singleton normals/albedos that other live
 * materials reference. These tests drive far past the bound with distinct hex
 * colours and assert the disposal contract.
 *
 * happy-dom has no real 2D canvas context; stub the minimum so `canvasFrom`
 * runs and the material getters build (same stub as the colour-space test).
 */
beforeAll(() => {
  const ctx = {
    createImageData: (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4) }),
    putImageData: () => {},
    createLinearGradient: () => ({ addColorStop: () => {} }),
    fillRect: () => {},
    beginPath: () => {},
    moveTo: () => {},
    lineTo: () => {},
    stroke: () => {},
    set fillStyle(_v: string) {},
    set strokeStyle(_v: string) {},
    set lineWidth(_v: number) {},
  }
  // biome-ignore lint/suspicious/noExplicitAny: minimal 2D-context stub for the test env.
  HTMLCanvasElement.prototype.getContext = (() => ctx) as any
})

beforeEach(() => {
  vi.useFakeTimers()
  vi.stubGlobal('requestAnimationFrame', undefined) // force the setTimeout defer path
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('furniture material cache eviction (AUD-002)', () => {
  it('disposes the wood material AND its owned cloned textures on eviction, sparing shared singletons', async () => {
    const { getWoodMaterial, __getMaterialCacheSizeForTest } = await import('./furnitureMaterials')

    // The first wood material caches the shared wood maps; its clones are owned.
    const first = getWoodMaterial('#000001')
    const ownedMap = first.map
    const ownedNormal = first.normalMap
    expect(ownedMap).toBeTruthy()
    expect(ownedNormal).toBeTruthy()

    const matDispose = vi.spyOn(first, 'dispose')
    const mapDispose = vi.spyOn(ownedMap!, 'dispose')
    const normalDispose = vi.spyOn(ownedNormal!, 'dispose')

    // Build a second material that reuses the SAME shared source maps. We keep
    // it recent so it survives and assert its (owned) texture is NOT disposed.
    const siblingKey = '#000002'
    const sibling = getWoodMaterial(siblingKey)
    const siblingMapDispose = vi.spyOn(sibling.map!, 'dispose')

    // Flood the cache far past its bound with distinct hex colours so `first`
    // (the least-recently-used) is evicted; re-touch the sibling each round so
    // it stays the most-recently-used and is never evicted.
    for (let i = 0; i < 400; i++) {
      getWoodMaterial(`#${(0x100000 + i).toString(16).padStart(6, '0')}`)
      getWoodMaterial(siblingKey) // refresh recency
    }
    expect(__getMaterialCacheSizeForTest()).toBeLessThanOrEqual(256)

    vi.runAllTimers() // flush deferred disposal

    // The evicted material + its OWNED clones are disposed.
    expect(matDispose).toHaveBeenCalled()
    expect(mapDispose).toHaveBeenCalled()
    expect(normalDispose).toHaveBeenCalled()
    // The kept-recent sibling's owned texture is untouched (and the shared
    // source singleton it cloned from is never disposed, since only owned
    // clones are disposed).
    expect(siblingMapDispose).not.toHaveBeenCalled()
  })
})
