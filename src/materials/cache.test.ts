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
import type { ProceduralMaterialDef } from './types'

const generateProceduralMock = vi.fn()
const isProceduralWorkerAvailableMock = vi.fn()
const requestProceduralWorkerMock = vi.fn()

vi.mock('./procedural/generators', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  generateProcedural: (...args: unknown[]) => generateProceduralMock(...args),
}))

vi.mock('./procedural/runProceduralWorker', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  isProceduralWorkerAvailable: () => isProceduralWorkerAvailableMock(),
  requestProceduralWorker: (...args: unknown[]) => requestProceduralWorkerMock(...args),
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
