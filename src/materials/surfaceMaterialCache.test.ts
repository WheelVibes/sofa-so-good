// @vitest-environment happy-dom
import type { Texture } from 'three'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { TexturedMaterialDef } from './types'

/**
 * PERF-A / REAL-1 — the wall/floor/ceiling material cache (`cache.ts`) is now
 * a bounded LRU (mirroring the furniture material cache's AUD-002 fix, see
 * `furnitureMaterialCache.test.ts`) and applies anisotropic filtering to
 * `textured` (DLC / uploaded) maps the same way the procedural path already
 * does.
 *
 * Each test re-imports a fresh module instance (`vi.resetModules` + dynamic
 * `import`) since `CACHE` and the plaster/anisotropy singletons are
 * module-level mutable state — without this, tests would leak cache entries
 * into each other.
 *
 * happy-dom has no real 2D canvas context; stub the minimum so the procedural
 * generator's `canvasFrom` runs (same stub as `furnitureMaterialCache.test.ts`).
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
  vi.resetModules()
  vi.useFakeTimers()
  vi.stubGlobal('requestAnimationFrame', undefined) // force the setTimeout defer path
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

/** Flush the one-frame-deferred eviction disposal. */
const flush = () => vi.runAllTimers()

function texturedDef(id: string, textures: TexturedMaterialDef['textures']): TexturedMaterialDef {
  return {
    id,
    name: 'Test textured',
    category: 'floor',
    kind: 'textured',
    source: 'polyhaven',
    swatch: '#ffffff',
    textures,
    uvScale: [1, 1],
  }
}

describe('surface material cache capacity (PERF-A)', () => {
  it('stays bounded at 256 and disposes evicted materials', async () => {
    const { buildMaterial, __getSurfaceMaterialCacheSizeForTest } = await import('./cache')

    // Solid finishes are cheap (no canvas bake) — flood well past the bound.
    const built = []
    for (let i = 0; i < 300; i++) {
      built.push(
        buildMaterial({
          id: `solid-flood-${i}`,
          name: 'x',
          category: 'wall',
          kind: 'solid',
          swatch: '#112233',
        }),
      )
    }
    expect(__getSurfaceMaterialCacheSizeForTest()).toBeLessThanOrEqual(256)

    const disposeSpy = vi.spyOn(built[0]!, 'dispose')
    flush()
    // The very first (least-recently-used, never re-touched) entry was evicted
    // and disposed once the deferred frame ran.
    expect(disposeSpy).toHaveBeenCalled()
  })

  it('get() refreshes recency so a still-referenced finish survives further inserts', async () => {
    const { buildMaterial, getCachedMaterial } = await import('./cache')

    const kept = buildMaterial({
      id: 'solid-kept',
      name: 'kept',
      category: 'wall',
      kind: 'solid',
      swatch: '#445566',
    })

    for (let i = 0; i < 300; i++) {
      buildMaterial({
        id: `solid-flood2-${i}`,
        name: 'x',
        category: 'wall',
        kind: 'solid',
        swatch: '#112233',
      })
      // Re-touch the kept entry every round, like a mounted mesh re-rendering.
      getCachedMaterial('solid-kept')
    }
    flush()
    expect(getCachedMaterial('solid-kept')).toBe(kept)
  })
})

describe('surface material cache disposal ownership (PERF-A)', () => {
  it('never disposes the shared plaster normal/roughness singletons on delete', async () => {
    const { buildMaterial, disposeCachedMaterial } = await import('./cache')
    const { getPlasterNormal, getPlasterRoughness } = await import('./procedural/generators')

    buildMaterial({
      id: 'wall-test-plaster',
      name: 'Test plaster',
      category: 'wall',
      kind: 'procedural',
      pattern: 'plaster',
      swatch: '#ffffff',
      uvScale: [2.5, 2.5],
    })
    const sharedNormal = getPlasterNormal()
    const sharedRough = getPlasterRoughness()
    const normalDispose = vi.spyOn(sharedNormal, 'dispose')
    const roughDispose = sharedRough ? vi.spyOn(sharedRough, 'dispose') : undefined

    disposeCachedMaterial('wall-test-plaster')
    flush()

    expect(normalDispose).not.toHaveBeenCalled()
    if (roughDispose) expect(roughDispose).not.toHaveBeenCalled()
  })

  it("disposes a non-plaster procedural material's OWN canvas textures on delete", async () => {
    const { buildMaterial, disposeCachedMaterial } = await import('./cache')
    const { effectivePatternSize } = await import('./procedural/generators')

    const m = buildMaterial({
      id: 'floor-test-concrete',
      name: 'Test concrete',
      category: 'floor',
      kind: 'procedural',
      pattern: 'concrete',
      swatch: '#888888',
      uvScale: [1, 1],
    })
    expect(m.map).toBeTruthy()
    expect(m.normalMap).toBeTruthy()
    expect(m.roughnessMap).toBeTruthy()
    const mapDispose = vi.spyOn(m.map as Texture, 'dispose')
    const normalDispose = vi.spyOn(m.normalMap as Texture, 'dispose')
    const roughDispose = vi.spyOn(m.roughnessMap as Texture, 'dispose')

    // The internal cache key for a non-plaster procedural finish embeds the
    // generation size (see `buildMaterial`'s `cacheKey`).
    const size = effectivePatternSize('concrete')
    disposeCachedMaterial(`floor-test-concrete@${size}`)
    flush()

    expect(mapDispose).toHaveBeenCalled()
    expect(normalDispose).toHaveBeenCalled()
    expect(roughDispose).toHaveBeenCalled()
  })

  it('never disposes textured (DLC/uploaded) maps on delete — a tint sibling may share them', async () => {
    const { Texture } = await import('three')
    const { buildMaterial, disposeCachedMaterial } = await import('./cache')

    const albedo = new Texture()
    const normal = new Texture()
    buildMaterial(
      texturedDef('floor-test-textured-dispose', { albedo: 'a.jpg', normal: 'n.jpg' }),
      {
        albedo,
        normal,
      },
    )
    const albedoDispose = vi.spyOn(albedo, 'dispose')
    const normalDispose = vi.spyOn(normal, 'dispose')

    disposeCachedMaterial('floor-test-textured-dispose')
    flush()

    expect(albedoDispose).not.toHaveBeenCalled()
    expect(normalDispose).not.toHaveBeenCalled()
  })
})

describe('disposeCachedMaterialsFor — user-material delete sweep (DE-4a)', () => {
  const solid = (id: string) =>
    ({ id, name: 'x', category: 'wall', kind: 'solid', swatch: '#112233' }) as const

  it('drops the base entry AND its tint/furn/size derivatives, sparing prefix-colliding ids', async () => {
    const { buildMaterial, disposeCachedMaterialsFor, getCachedMaterial } = await import('./cache')

    // Simulate the key shapes a deleted user material can leave in the cache:
    // the plain build, a tint recolour, a furniture-finish entry, and an
    // UNRELATED id that shares the prefix (must survive the sweep).
    const base = buildMaterial(solid('user-mat-1'))
    buildMaterial(solid('tint:user-mat-1:#ff0000'))
    buildMaterial(solid('furn:user-mat-1:x1.00'))
    const collider = buildMaterial(solid('user-mat-12'))

    const baseDispose = vi.spyOn(base, 'dispose')
    disposeCachedMaterialsFor('user-mat-1')

    expect(getCachedMaterial('user-mat-1')).toBeUndefined()
    expect(getCachedMaterial('tint:user-mat-1:#ff0000')).toBeUndefined()
    expect(getCachedMaterial('furn:user-mat-1:x1.00')).toBeUndefined()
    // Explicit deletion disposes immediately (LruCache.delete → caller-owned).
    expect(baseDispose).toHaveBeenCalled()
    // The prefix-colliding sibling is untouched.
    expect(getCachedMaterial('user-mat-12')).toBe(collider)
  })

  it('is a harmless no-op for an id with no cached entries', async () => {
    const { disposeCachedMaterialsFor, __getSurfaceMaterialCacheSizeForTest } = await import(
      './cache'
    )
    const before = __getSurfaceMaterialCacheSizeForTest()
    expect(() => disposeCachedMaterialsFor('never-built')).not.toThrow()
    expect(__getSurfaceMaterialCacheSizeForTest()).toBe(before)
  })
})

describe('surface material cache anisotropy (REAL-1)', () => {
  it('applies the current anisotropy cap to every textured (DLC/uploaded) map', async () => {
    const { Texture } = await import('three')
    const { buildMaterial } = await import('./cache')
    const { getAnisotropy } = await import('./anisotropy')

    const albedo = new Texture()
    const normal = new Texture()
    const roughness = new Texture()
    const ao = new Texture()
    buildMaterial(
      texturedDef('floor-test-textured-aniso', {
        albedo: 'a.jpg',
        normal: 'n.jpg',
        roughness: 'r.jpg',
        ao: 'ao.jpg',
      }),
      { albedo, normal, roughness, ao },
    )

    const cap = getAnisotropy()
    expect(cap).toBeGreaterThan(0)
    expect(albedo.anisotropy).toBe(cap)
    expect(normal.anisotropy).toBe(cap)
    expect(roughness.anisotropy).toBe(cap)
    expect(ao.anisotropy).toBe(cap)
  })

  it('re-applies the device max once known, matching the procedural path', async () => {
    const { Texture } = await import('three')
    const { buildMaterial } = await import('./cache')
    const { setMaxAnisotropy } = await import('./anisotropy')

    const albedo = new Texture()
    buildMaterial(texturedDef('floor-test-textured-devicemax', { albedo: 'a.jpg' }), { albedo })

    setMaxAnisotropy(16)
    expect(albedo.anisotropy).toBe(16)
  })
})
