// @vitest-environment happy-dom
/**
 * PERF-C — the procedural branch of `buildMaterial` used to synchronously bake
 * a full 256²-512² texture set (pattern fields + height→normal + roughness)
 * on every new finish id, hitching a frame right when a finish is applied or
 * a colour/scale composition scrub settles. When the off-thread worker
 * (`runProceduralWorker.ts`) is available, it already re-bakes the same
 * full-quality set a moment later — so the synchronous "fallback" only needs
 * to look right for that brief window, not be full quality.
 *
 * These tests mock `generateProcedural`/`isProceduralWorkerAvailable`/
 * `requestProceduralWorker` (real procedural generation needs a real 2D
 * canvas context, which happy-dom doesn't provide — see the other
 * `materials/*.test.ts` files) and assert the *decision logic*: which size
 * `buildMaterial` bakes synchronously, whether it kicks off a worker upgrade,
 * and that a failed worker never leaves a material stuck at preview quality.
 */
import { Texture } from 'three'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProceduralMaterialDef, TexturedMaterialDef } from './types'

const generateProceduralMock = vi.fn()
const isProceduralWorkerAvailableMock = vi.fn()
const requestProceduralWorkerMock = vi.fn()
const recolorImageToCanvasMock = vi.fn()

vi.mock('./procedural/generators', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  generateProcedural: (...args: unknown[]) => generateProceduralMock(...args),
}))

vi.mock('./procedural/runProceduralWorker', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  isProceduralWorkerAvailable: () => isProceduralWorkerAvailableMock(),
  requestProceduralWorker: (...args: unknown[]) => requestProceduralWorkerMock(...args),
}))

// FINISH-RECOLOR — happy-dom has no real 2D pixel pipeline, so the recolor bake
// is mocked; the tests below assert the textured branch's *routing* (repaint vs
// multiply fallback) and the own()/shared disposal contract, not the pixel math
// (that's `recolor.test.ts`, node env).
vi.mock('./recolor', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  recolorImageToCanvas: (...args: unknown[]) => recolorImageToCanvasMock(...args),
}))

function fakeMaps() {
  return {
    albedo: new Texture(),
    normal: new Texture(),
    roughness: new Texture(),
    metalness: 0,
  }
}

function woodDef(id: string): ProceduralMaterialDef {
  return {
    id,
    name: 'Test wood',
    category: 'floor',
    kind: 'procedural',
    pattern: 'wood',
    swatch: '#8a5a2b',
    uvScale: [1, 1],
  }
}

describe('buildMaterial procedural bake — quick placeholder + worker upgrade (PERF-C)', () => {
  let buildMaterial: typeof import('./cache').buildMaterial
  let PROCEDURAL_QUICK_PREVIEW_SIZE: number

  beforeEach(async () => {
    vi.resetModules()
    generateProceduralMock.mockReset()
    isProceduralWorkerAvailableMock.mockReset()
    requestProceduralWorkerMock.mockReset()
    ;({ buildMaterial } = await import('./cache'))
    ;({ PROCEDURAL_QUICK_PREVIEW_SIZE } = await import('./procedural/generators'))
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('bakes only a cheap low-res placeholder synchronously when the worker is available', () => {
    isProceduralWorkerAvailableMock.mockReturnValue(true)
    requestProceduralWorkerMock.mockReturnValue(new Promise(() => {})) // never resolves here
    generateProceduralMock.mockReturnValue(fakeMaps())

    buildMaterial(woodDef('perf-c-quick'))

    expect(generateProceduralMock).toHaveBeenCalledTimes(1)
    expect(generateProceduralMock).toHaveBeenCalledWith(
      'perf-c-quick',
      'wood',
      '#8a5a2b',
      PROCEDURAL_QUICK_PREVIEW_SIZE,
    )
    // The real quality bake is requested off-thread, not synchronously.
    expect(requestProceduralWorkerMock).toHaveBeenCalledTimes(1)
  })

  it('bakes full quality synchronously (no size override) when no worker is available, and never touches the worker', () => {
    isProceduralWorkerAvailableMock.mockReturnValue(false)
    generateProceduralMock.mockReturnValue(fakeMaps())

    buildMaterial(woodDef('perf-c-full'))

    expect(generateProceduralMock).toHaveBeenCalledTimes(1)
    expect(generateProceduralMock).toHaveBeenCalledWith('perf-c-full', 'wood', '#8a5a2b', undefined)
    expect(requestProceduralWorkerMock).not.toHaveBeenCalled()
  })

  it('recovers to a synchronous full-quality bake if the worker resolves null after a quick placeholder was shown', async () => {
    isProceduralWorkerAvailableMock.mockReturnValue(true)
    requestProceduralWorkerMock.mockResolvedValue(null)
    const quick = fakeMaps()
    const full = fakeMaps()
    generateProceduralMock.mockReturnValueOnce(quick).mockReturnValueOnce(full)

    const mat = buildMaterial(woodDef('perf-c-recover'))
    // Placeholder shows immediately.
    expect(mat.map).toBe(quick.albedo)

    // The async worker-upgrade chain resolves null → falls back to a real bake
    // rather than leaving the material stuck at preview quality forever.
    await vi.waitFor(() => expect(generateProceduralMock).toHaveBeenCalledTimes(2))
    expect(generateProceduralMock).toHaveBeenNthCalledWith(2, 'perf-c-recover', 'wood', '#8a5a2b')
    expect(mat.map).toBe(full.albedo)
  })

  it('same-pattern same-size cache key is unaffected — a second build for the same id returns the cached instance', () => {
    isProceduralWorkerAvailableMock.mockReturnValue(true)
    requestProceduralWorkerMock.mockReturnValue(new Promise(() => {}))
    generateProceduralMock.mockReturnValue(fakeMaps())

    const first = buildMaterial(woodDef('perf-c-cache'))
    const second = buildMaterial(woodDef('perf-c-cache'))
    expect(second).toBe(first)
    // Only baked once — the cache hit skips generation entirely (LRU/cache
    // behaviour untouched by the PERF-C change).
    expect(generateProceduralMock).toHaveBeenCalledTimes(1)
  })
})

function texturedDef(id: string, recolorAlbedo?: boolean): TexturedMaterialDef {
  return {
    id,
    name: 'Test oak',
    category: 'floor',
    kind: 'textured',
    source: 'ambientcg',
    swatch: '#8800ff',
    textures: { albedo: 'oak_albedo.jpg' },
    uvScale: [2, 2],
    ...(recolorAlbedo ? { recolorAlbedo: true } : {}),
  }
}

/** A loader-style Texture whose `.image` is set (as drei's useTexture returns). */
function loadedTexture(): Texture {
  const t = new Texture()
  t.image = document.createElement('canvas')
  return t
}

describe('buildMaterial textured branch — repaint vs multiply (FINISH-RECOLOR)', () => {
  let buildMaterial: typeof import('./cache').buildMaterial
  let disposeCachedMaterial: typeof import('./cache').disposeCachedMaterial

  beforeEach(async () => {
    vi.resetModules()
    recolorImageToCanvasMock.mockReset()
    ;({ buildMaterial, disposeCachedMaterial } = await import('./cache'))
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('falls back to the multiply path when recolorAlbedo is set but no albedo image is loaded', () => {
    const albedo = new Texture() // .image is null — not loaded yet
    const m = buildMaterial(texturedDef('recolor-no-image', true), { albedo })
    // No image → the recolor engine is never consulted; legacy multiply shape.
    expect(recolorImageToCanvasMock).not.toHaveBeenCalled()
    expect(m.map).toBe(albedo)
    expect(`#${m.color.getHexString()}`).toBe('#8800ff')
  })

  it('falls back to the multiply path when the recolor bake returns null', () => {
    recolorImageToCanvasMock.mockReturnValue(null)
    const albedo = loadedTexture()
    const m = buildMaterial(texturedDef('recolor-null-bake', true), { albedo })
    expect(recolorImageToCanvasMock).toHaveBeenCalledTimes(1)
    expect(m.map).toBe(albedo) // shared loader map kept
    expect(`#${m.color.getHexString()}`).toBe('#8800ff')
  })

  it('never consults the recolor engine without the recolorAlbedo flag (legacy ids untouched)', () => {
    const albedo = loadedTexture()
    const m = buildMaterial(texturedDef('recolor-legacy'), { albedo })
    expect(recolorImageToCanvasMock).not.toHaveBeenCalled()
    expect(m.map).toBe(albedo)
    expect(`#${m.color.getHexString()}`).toBe('#8800ff')
  })

  it('repaint: swaps in an OWNED recolored CanvasTexture, whitens m.color, and disposes only the owned map on eviction', () => {
    const baked = document.createElement('canvas')
    baked.width = 4
    baked.height = 4
    recolorImageToCanvasMock.mockReturnValue(baked)
    const albedo = loadedTexture()
    const normal = loadedTexture()

    const m = buildMaterial(texturedDef('recolor-repaint', true), { albedo, normal })
    expect(recolorImageToCanvasMock).toHaveBeenCalledWith(albedo.image, '#8800ff')
    // The recolored bake replaces the shared albedo; the tint is baked in, so
    // m.color must be white (no double tint).
    expect(m.map).not.toBe(albedo)
    expect(m.map?.image).toBe(baked)
    expect(`#${m.color.getHexString()}`).toBe('#ffffff')
    // Repeat comes from the def's uvScale, like every other branch.
    expect(m.map?.repeat.x).toBeCloseTo(0.5)
    expect(m.map?.repeat.y).toBeCloseTo(0.5)
    // Non-albedo maps stay the SHARED loader instances.
    expect(m.normalMap).toBe(normal)

    // Ownership contract: eviction/deletion disposes the owned CanvasTexture
    // but never the shared loader-cached maps.
    const ownedDispose = vi.spyOn(m.map as Texture, 'dispose')
    const sharedDispose = vi.spyOn(normal, 'dispose')
    disposeCachedMaterial('recolor-repaint')
    expect(ownedDispose).toHaveBeenCalledTimes(1)
    expect(sharedDispose).not.toHaveBeenCalled()
  })
})
