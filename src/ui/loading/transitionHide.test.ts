import { describe, expect, it } from 'vitest'
import {
  MAX_WAIT_MS,
  READY_FRAMES,
  SWAP_COMMIT_RAFS,
  scheduleTransitionHide,
  type TransitionHideDeps,
} from './transitionHide'

/** Manual rAF/timer/frame harness so the sequencing is fully deterministic. */
function makeHarness() {
  let rafId = 0
  const rafQueue = new Map<number, FrameRequestCallback>()
  let timerId = 0
  const timers = new Map<number, { cb: () => void; ms: number }>()
  const frameListeners = new Set<() => void>()

  const deps: TransitionHideDeps = {
    raf: (cb) => {
      rafId += 1
      rafQueue.set(rafId, cb)
      return rafId
    },
    caf: (id) => {
      rafQueue.delete(id)
    },
    setTimeout: (cb, ms) => {
      timerId += 1
      timers.set(timerId, { cb, ms })
      return timerId
    },
    clearTimeout: (id) => {
      timers.delete(id)
    },
    onFrame: (cb) => {
      frameListeners.add(cb)
      return () => frameListeners.delete(cb)
    },
  }

  return {
    deps,
    /** Fire all currently queued rAF callbacks (one animation tick). */
    tickRaf() {
      const pending = [...rafQueue.entries()]
      rafQueue.clear()
      for (const [, cb] of pending) cb(0)
    },
    /** Notify a rendered WebGL frame. */
    renderFrame() {
      for (const l of [...frameListeners]) l()
    },
    /** Fire all pending timeouts (the safety net). */
    fireTimers() {
      const pending = [...timers.values()]
      timers.clear()
      for (const t of pending) t.cb()
    },
    get timerCount() {
      return timers.size
    },
    get frameListenerCount() {
      return frameListeners.size
    },
    timerDelays: () => [...timers.values()].map((t) => t.ms),
  }
}

describe('scheduleTransitionHide', () => {
  it('hides only after the swap-commit rAFs AND the ready frames', () => {
    const h = makeHarness()
    let hidden = 0
    scheduleTransitionHide(() => hidden++, h.deps)

    // Frames rendered before the swap commits (old scene) must not count.
    for (let i = 0; i < READY_FRAMES + 2; i++) h.renderFrame()
    expect(hidden).toBe(0)

    for (let i = 0; i < SWAP_COMMIT_RAFS; i++) h.tickRaf()
    expect(hidden).toBe(0)

    for (let i = 0; i < READY_FRAMES - 1; i++) h.renderFrame()
    expect(hidden).toBe(0)
    h.renderFrame()
    expect(hidden).toBe(1)
  })

  it('hides via the safety timeout when no frame ever renders', () => {
    const h = makeHarness()
    let hidden = 0
    scheduleTransitionHide(() => hidden++, h.deps)
    expect(h.timerDelays()).toEqual([MAX_WAIT_MS])
    h.fireTimers()
    expect(hidden).toBe(1)
    // Late frames after the timeout hide must not hide again.
    for (let i = 0; i < SWAP_COMMIT_RAFS; i++) h.tickRaf()
    for (let i = 0; i < READY_FRAMES; i++) h.renderFrame()
    expect(hidden).toBe(1)
  })

  it('cleans up after a frame-driven hide (no leaked timer or listener)', () => {
    const h = makeHarness()
    let hidden = 0
    scheduleTransitionHide(() => hidden++, h.deps)
    for (let i = 0; i < SWAP_COMMIT_RAFS; i++) h.tickRaf()
    for (let i = 0; i < READY_FRAMES; i++) h.renderFrame()
    expect(hidden).toBe(1)
    expect(h.timerCount).toBe(0)
    expect(h.frameListenerCount).toBe(0)
    h.fireTimers()
    expect(hidden).toBe(1)
  })

  it('cancel prevents the hide entirely', () => {
    const h = makeHarness()
    let hidden = 0
    const cancel = scheduleTransitionHide(() => hidden++, h.deps)
    cancel()
    for (let i = 0; i < SWAP_COMMIT_RAFS; i++) h.tickRaf()
    for (let i = 0; i < READY_FRAMES; i++) h.renderFrame()
    h.fireTimers()
    expect(hidden).toBe(0)
    expect(h.timerCount).toBe(0)
    expect(h.frameListenerCount).toBe(0)
  })
})
