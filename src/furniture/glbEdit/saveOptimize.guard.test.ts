// @vitest-environment happy-dom
/**
 * Asset Studio Iteration 3 · Stage 7a — AS-OPT-GUARD fail-soft timeout.
 *
 * `optimizeSavedGlb` bounds the save-time optimize pass with a timeout and
 * swallows any rejection, always falling back to the RAW export so a hung/failed
 * Draco/Basis WASM stack can never wedge the designer's save (the dev-harness
 * Draco-wasm MIME hang, 2026-07-16). Here we mock `runOptimize` to drive the three
 * outcomes deterministically — the real preservation/size behaviour is covered by
 * `saveOptimize.test.ts`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { runOptimizeMock } = vi.hoisted(() => ({ runOptimizeMock: vi.fn() }))
vi.mock('../optimize/runOptimize', () => ({ runOptimize: runOptimizeMock }))

import { OPTIMIZE_SAVE_TIMEOUT_MS, optimizeSavedGlb } from './saveOptimize'

const RAW = new Uint8Array([0x67, 0x6c, 0x54, 0x46, 1, 2, 3, 4, 5, 6, 7, 8])

let warnSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  runOptimizeMock.mockReset()
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  warnSpy.mockRestore()
  vi.useRealTimers()
})

describe('Stage 7a — optimizeSavedGlb fail-soft guard', () => {
  it('times out on a never-resolving optimize → persists the RAW GLB', async () => {
    vi.useFakeTimers()
    // A hung WASM stack: the optimize promise never settles.
    runOptimizeMock.mockReturnValue(new Promise(() => {}))

    const promise = optimizeSavedGlb(RAW)
    // Advance past the guard's ceiling so the timeout arm of the race resolves.
    await vi.advanceTimersByTimeAsync(OPTIMIZE_SAVE_TIMEOUT_MS)
    const res = await promise

    expect(res.optimized).toBe(false)
    expect(res.data).toBe(RAW)
    expect(res.beforeBytes).toBe(RAW.byteLength)
    expect(res.afterBytes).toBe(RAW.byteLength)
    expect(warnSpy).toHaveBeenCalledTimes(1)
  })

  it('swallows a rejection → persists the RAW GLB', async () => {
    runOptimizeMock.mockRejectedValue(new Error('wasm mime hang'))

    const res = await optimizeSavedGlb(RAW)

    expect(res.optimized).toBe(false)
    expect(res.data).toBe(RAW)
    expect(res.afterBytes).toBe(RAW.byteLength)
    expect(warnSpy).toHaveBeenCalledTimes(1)
  })

  it('adopts the optimized bytes when strictly smaller (success path unchanged)', async () => {
    const smaller = new Uint8Array([0x67, 0x6c, 0x54, 0x46])
    runOptimizeMock.mockResolvedValue({
      data: smaller,
      report: { beforeBytes: RAW.byteLength, afterBytes: smaller.byteLength },
    })

    const res = await optimizeSavedGlb(RAW)

    expect(res.optimized).toBe(true)
    expect(res.data).toBe(smaller)
    expect(res.afterBytes).toBe(smaller.byteLength)
    expect(res.beforeBytes).toBe(RAW.byteLength)
    expect(warnSpy).not.toHaveBeenCalled()
  })

  it('keeps the RAW GLB when the optimized output is not smaller (no-op guard)', async () => {
    // Draco header overhead on tiny geometry → optimized ≥ raw: keep raw.
    const bigger = new Uint8Array(RAW.byteLength + 4)
    runOptimizeMock.mockResolvedValue({
      data: bigger,
      report: { beforeBytes: RAW.byteLength, afterBytes: bigger.byteLength },
    })

    const res = await optimizeSavedGlb(RAW)

    expect(res.optimized).toBe(false)
    expect(res.data).toBe(RAW)
    expect(res.afterBytes).toBe(RAW.byteLength)
    expect(warnSpy).not.toHaveBeenCalled()
  })
})
