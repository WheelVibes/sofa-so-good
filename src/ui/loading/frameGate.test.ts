import { describe, expect, it, vi } from 'vitest'
import { afterFrames, type FrameGateDeps, shouldForceSceneReady } from './frameGate'

/** Controllable deps: frames and timers fire only when the test says so. */
function harness(hidden = false) {
  const frames: (() => void)[] = []
  const timers: { cb: () => void; ms: number; id: number }[] = []
  let nextId = 1
  const deps: FrameGateDeps = {
    hidden: () => hidden,
    raf: (cb) => {
      frames.push(cb)
      return frames.length
    },
    cancelRaf: () => {},
    timer: (cb, ms) => {
      const id = nextId++
      timers.push({ cb, ms, id })
      return id as unknown as ReturnType<typeof setTimeout>
    },
    clearTimer: (h) => {
      const i = timers.findIndex((t) => t.id === (h as unknown as number))
      if (i >= 0) timers.splice(i, 1)
    },
  }
  return {
    deps,
    setHidden: (v: boolean) => {
      hidden = v
    },
    tickFrame: () => frames.shift()?.(),
    tickTimer: () => timers.shift()?.cb(),
    pendingFrames: () => frames.length,
    pendingTimers: () => timers.length,
  }
}

describe('afterFrames', () => {
  it('runs after the requested number of frames on a visible page', () => {
    const h = harness(false)
    const cb = vi.fn()
    afterFrames(2, cb, h.deps)
    h.tickFrame()
    expect(cb).not.toHaveBeenCalled()
    h.tickFrame()
    expect(cb).toHaveBeenCalledTimes(1)
  })

  it('never asks for a frame while hidden — it uses timers instead', () => {
    // The whole point: a hidden tab gets no frames, so awaiting one deadlocks.
    const h = harness(true)
    const cb = vi.fn()
    afterFrames(2, cb, h.deps)
    expect(h.pendingFrames()).toBe(0)
    h.tickTimer()
    h.tickTimer()
    expect(cb).toHaveBeenCalledTimes(1)
  })

  it('still finishes when the tab is backgrounded MID-wait', () => {
    // Asked for a frame while visible, then the window was occluded: the
    // fallback timer is what saves it.
    const h = harness(false)
    const cb = vi.fn()
    afterFrames(1, cb, h.deps)
    expect(h.pendingFrames()).toBe(1)
    h.setHidden(true)
    h.tickTimer() // the fallback for the frame that will never arrive
    expect(cb).toHaveBeenCalledTimes(1)
  })

  it('runs the callback at most once, whichever signal wins', () => {
    const h = harness(false)
    const cb = vi.fn()
    afterFrames(1, cb, h.deps)
    h.tickFrame()
    h.tickTimer()
    expect(cb).toHaveBeenCalledTimes(1)
  })

  it('cancel() stops a pending wait', () => {
    const h = harness(false)
    const cb = vi.fn()
    const cancel = afterFrames(2, cb, h.deps)
    h.tickFrame()
    cancel()
    h.tickFrame()
    h.tickTimer()
    expect(cb).not.toHaveBeenCalled()
  })

  it('fires immediately for a zero-frame wait', () => {
    const cb = vi.fn()
    afterFrames(0, cb, harness().deps)
    expect(cb).toHaveBeenCalledTimes(1)
  })
})

describe('shouldForceSceneReady', () => {
  it('forces only while hidden — a visible tab still waits for real frames', () => {
    expect(shouldForceSceneReady({ hidden: true, sceneReady: false, progressActive: false })).toBe(
      true,
    )
    expect(shouldForceSceneReady({ hidden: false, sceneReady: false, progressActive: false })).toBe(
      false,
    )
  })

  it('waits for streaming assets even while hidden', () => {
    expect(shouldForceSceneReady({ hidden: true, sceneReady: false, progressActive: true })).toBe(
      false,
    )
  })

  it('is a no-op once the scene is ready', () => {
    expect(shouldForceSceneReady({ hidden: true, sceneReady: true, progressActive: false })).toBe(
      false,
    )
  })
})
