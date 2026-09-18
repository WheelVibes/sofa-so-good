// @vitest-environment happy-dom
import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useDeferredSceneSwap } from './useDeferredSceneSwap'

/** Controllable rAF/timer stand-ins, mirroring `frameGate.test.ts`'s harness —
 *  `useDeferredSceneSwap` now delegates to `frameGate.ts:afterFrames` (see that
 *  file's own exhaustive hidden-tab coverage), so this only needs to prove the
 *  WIRING is correct: two ticks swap the visual, and hidden-tab progress is
 *  reachable through this hook, not just through the underlying primitive. */
function stubFrames() {
  const frames = new Map<number, FrameRequestCallback>()
  let nextId = 1
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    const id = nextId++
    frames.set(id, cb)
    return id
  })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => {
    frames.delete(id)
  })
  const tick = () => {
    const next = [...frames.entries()][0]
    if (!next) return
    const [id, cb] = next
    frames.delete(id)
    cb(0)
  }
  return { tick, pending: () => frames.size }
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('useDeferredSceneSwap', () => {
  it('swaps immediately when not loading', () => {
    const { result } = renderHook(() => useDeferredSceneSwap(false, true, false))
    expect(result.current).toEqual({ roomEditor: true, floorPlan: false })
  })

  it('holds the OLD visual for two frames while loading, on a visible tab', () => {
    const frames = stubFrames()
    const { result, rerender } = renderHook(
      ({ roomEditor }) => useDeferredSceneSwap(true, roomEditor, false),
      { initialProps: { roomEditor: false } },
    )
    expect(result.current).toEqual({ roomEditor: false, floorPlan: false })
    rerender({ roomEditor: true })
    expect(result.current).toEqual({ roomEditor: false, floorPlan: false }) // still old
    act(() => frames.tick())
    expect(result.current).toEqual({ roomEditor: false, floorPlan: false }) // one tick — not yet
    act(() => frames.tick())
    expect(result.current).toEqual({ roomEditor: true, floorPlan: false }) // two — swapped
  })

  it('still swaps via the timer fallback when the tab is hidden (never strands the old scene)', () => {
    vi.useFakeTimers()
    stubFrames() // no ticks fired — a hidden tab gets none
    Object.defineProperty(document, 'hidden', { value: true, configurable: true })
    try {
      const { result, rerender } = renderHook(
        ({ roomEditor }) => useDeferredSceneSwap(true, roomEditor, false),
        { initialProps: { roomEditor: false } },
      )
      rerender({ roomEditor: true })
      expect(result.current).toEqual({ roomEditor: false, floorPlan: false })
      act(() => {
        vi.advanceTimersByTime(100)
      })
      expect(result.current).toEqual({ roomEditor: true, floorPlan: false })
    } finally {
      Object.defineProperty(document, 'hidden', { value: false, configurable: true })
    }
  })
})
