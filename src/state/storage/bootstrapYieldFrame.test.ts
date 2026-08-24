// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'

import { yieldFrame } from './bootstrap'

/** Pretend the tab is hidden/visible for the duration of one test. */
function setHidden(hidden: boolean) {
  Object.defineProperty(document, 'hidden', { value: hidden, configurable: true })
  Object.defineProperty(document, 'visibilityState', {
    value: hidden ? 'hidden' : 'visible',
    configurable: true,
  })
}

describe('yieldFrame', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
    setHidden(false)
  })

  it('resolves on the animation frame when the tab is visible', async () => {
    setHidden(false)
    const raf = vi.fn((cb: FrameRequestCallback) => {
      cb(0)
      return 1
    })
    vi.stubGlobal('requestAnimationFrame', raf)

    await expect(yieldFrame()).resolves.toBeUndefined()
    expect(raf).toHaveBeenCalledTimes(1)
  })

  // The regression this guards: Chrome throttles rAF to zero in a hidden tab,
  // so awaiting a frame there used to deadlock the whole boot bootstrap.
  it('resolves without an animation frame when the tab is hidden', async () => {
    setHidden(true)
    const raf = vi.fn(() => 1)
    vi.stubGlobal('requestAnimationFrame', raf)

    await expect(yieldFrame()).resolves.toBeUndefined()
    expect(raf).not.toHaveBeenCalled()
  })

  it('falls back to the timer when a visible tab never fires the frame', async () => {
    setHidden(false)
    vi.useFakeTimers()
    // A frame that is requested but never delivered — a tab hidden *after* the
    // check, or an offscreen/occluded document.
    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn(() => 1),
    )

    let settled = false
    const p = yieldFrame().then(() => {
      settled = true
    })

    await vi.advanceTimersByTimeAsync(49)
    expect(settled).toBe(false)

    await vi.advanceTimersByTimeAsync(1)
    await p
    expect(settled).toBe(true)
  })

  it('resolves only once when both the frame and the timer fire', async () => {
    setHidden(false)
    vi.useFakeTimers()
    const frames: FrameRequestCallback[] = []
    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn((cb: FrameRequestCallback) => {
        frames.push(cb)
        return 1
      }),
    )

    const p = yieldFrame()
    for (const frame of frames) frame(0)
    await vi.advanceTimersByTimeAsync(100)
    await expect(p).resolves.toBeUndefined()
  })
})
