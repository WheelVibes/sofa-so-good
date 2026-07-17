// @vitest-environment happy-dom
/**
 * AUD-002: the per-colour base cache for the canvas-drawn pegboard hole-grid
 * texture is a bounded LRU — cycling the board-colour picker must hold the live
 * cache at/under the cap and dispose evicted GPU textures, never leak one per
 * colour. happy-dom has no 2D canvas context, so a minimal `getContext('2d')`
 * stub records the drawing calls the builder makes, exercising the REAL cache
 * path end to end.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  __clearPegboardCacheForTest,
  __pegboardCacheSizeForTest,
  getPegboardTexture,
  PEGBOARD_CACHE_MAX,
} from './pegboardTexture'

function fakeCtx() {
  return {
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    fillRect: vi.fn(),
    beginPath: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
  } as unknown as CanvasRenderingContext2D
}

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
    () => fakeCtx() as unknown as ReturnType<HTMLCanvasElement['getContext']>,
  )
})
afterEach(() => {
  __clearPegboardCacheForTest()
  vi.restoreAllMocks()
})

describe('getPegboardTexture — bounded base cache', () => {
  it('returns the same instance for a repeated colour (cache hit)', () => {
    const a = getPegboardTexture('#d8c39a')
    const b = getPegboardTexture('#d8c39a')
    expect(b).toBe(a)
    expect(__pegboardCacheSizeForTest()).toBe(1)
  })

  it('holds the cache at/under the cap across many distinct colours', () => {
    for (let i = 0; i < PEGBOARD_CACHE_MAX + 20; i++) {
      getPegboardTexture(`#${(0x300000 + i).toString(16).slice(-6)}`)
    }
    expect(__pegboardCacheSizeForTest()).toBeLessThanOrEqual(PEGBOARD_CACHE_MAX)
  })
})
