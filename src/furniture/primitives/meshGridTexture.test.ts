// @vitest-environment happy-dom
/**
 * AUD-002: the per-colour/per-tint base caches for the canvas-drawn safety-mesh
 * and sisal-rope textures are bounded LRUs — repeated param changes (a colour
 * picker drag cycling many distinct hues) must hold the live cache at/under the
 * cap and dispose the evicted GPU textures, never leak one per colour.
 *
 * happy-dom has no 2D canvas context, so we install a minimal `getContext('2d')`
 * stub that records the drawing calls the texture builders make — enough to run
 * the REAL cache path end to end.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  __clearMeshGridCacheForTest,
  __meshGridCacheSizeForTest,
  getMeshGridTexture,
  MESH_GRID_CACHE_MAX,
} from './meshGridTexture'
import {
  __clearSisalCacheForTest,
  __sisalCacheSizeForTest,
  getSisalTexture,
  SISAL_CACHE_MAX,
} from './sisalTexture'

function fakeCtx() {
  return {
    fillStyle: '',
    strokeStyle: '',
    globalAlpha: 1,
    lineWidth: 1,
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
  } as unknown as CanvasRenderingContext2D
}

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
    () => fakeCtx() as unknown as ReturnType<HTMLCanvasElement['getContext']>,
  )
})
afterEach(() => {
  __clearMeshGridCacheForTest()
  __clearSisalCacheForTest()
  vi.restoreAllMocks()
})

describe('getMeshGridTexture — bounded base cache', () => {
  it('returns the same instance for a repeated colour (cache hit)', () => {
    const a = getMeshGridTexture('#123456')
    const b = getMeshGridTexture('#123456')
    expect(b).toBe(a)
    expect(__meshGridCacheSizeForTest()).toBe(1)
  })

  it('holds the cache at/under the cap across many distinct colours', () => {
    for (let i = 0; i < MESH_GRID_CACHE_MAX + 20; i++) {
      // Distinct 6-digit hex per iteration.
      getMeshGridTexture(`#${(0x100000 + i).toString(16).slice(-6)}`)
    }
    expect(__meshGridCacheSizeForTest()).toBeLessThanOrEqual(MESH_GRID_CACHE_MAX)
  })
})

describe('getSisalTexture — bounded base cache', () => {
  it('returns the same instance for a repeated tint (cache hit)', () => {
    const a = getSisalTexture('#c9a875')
    const b = getSisalTexture('#c9a875')
    expect(b).toBe(a)
  })

  it('holds the cache at/under the cap across many distinct tints', () => {
    for (let i = 0; i < SISAL_CACHE_MAX + 20; i++) {
      getSisalTexture(`#${(0x200000 + i).toString(16).slice(-6)}`)
    }
    expect(__sisalCacheSizeForTest()).toBeLessThanOrEqual(SISAL_CACHE_MAX)
  })
})
