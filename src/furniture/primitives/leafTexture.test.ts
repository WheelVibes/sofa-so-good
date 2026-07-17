// @vitest-environment happy-dom
/**
 * AUD-002: the per-(species,colour) base cache for the canvas-drawn leaf
 * silhouette textures is a bounded LRU — cycling the foliage-colour picker (or
 * placing many differently-tinted plants) must hold the live cache at/under the
 * cap and dispose evicted GPU textures, never leak one per colour. happy-dom has
 * no 2D canvas context, so a permissive stub records the drawing calls the
 * builder makes, exercising the REAL cache path end to end.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  __clearLeafTexCacheForTest,
  __leafTexCacheSizeForTest,
  getLeafTexture,
  LEAF_TEX_CACHE_MAX,
  type LeafSpecies,
} from './leafTexture'

function fakeCtx() {
  const gradient = { addColorStop() {} }
  return new Proxy(
    {
      fillStyle: '',
      strokeStyle: '',
      globalAlpha: 1,
      lineWidth: 1,
      lineJoin: '',
      globalCompositeOperation: '',
      createLinearGradient: () => gradient,
      createRadialGradient: () => gradient,
    } as Record<string, unknown>,
    {
      get: (t, p: string) => (p in t ? t[p] : () => {}),
      set: (t, p: string, v) => {
        t[p] = v
        return true
      },
    },
  ) as unknown as CanvasRenderingContext2D
}

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
    () => fakeCtx() as unknown as ReturnType<HTMLCanvasElement['getContext']>,
  )
})
afterEach(() => {
  __clearLeafTexCacheForTest()
  vi.restoreAllMocks()
})

const SPECIES: LeafSpecies[] = [
  'monstera',
  'fiddle',
  'frond',
  'blade',
  'pothos',
  'fern',
  'oval',
  'succulent',
  'pampas',
  'seagrass',
]

describe('getLeafTexture — bounded base cache', () => {
  it('returns the same instance for a repeated (species,colour) (cache hit)', () => {
    const a = getLeafTexture('monstera', '#3f6b3a')
    const b = getLeafTexture('monstera', '#3f6b3a')
    expect(b).toBe(a)
    expect(__leafTexCacheSizeForTest()).toBe(1)
  })

  it('draws each species without throwing and caches distinctly', () => {
    for (const s of SPECIES) getLeafTexture(s, '#4a7a44')
    expect(__leafTexCacheSizeForTest()).toBe(SPECIES.length)
  })

  it('holds the cache at/under the cap across many distinct colours', () => {
    for (let i = 0; i < LEAF_TEX_CACHE_MAX + 20; i++) {
      getLeafTexture('oval', `#${(0x300000 + i).toString(16).slice(-6)}`)
    }
    expect(__leafTexCacheSizeForTest()).toBeLessThanOrEqual(LEAF_TEX_CACHE_MAX)
  })
})
