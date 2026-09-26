import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSettleEmitter, createThrottledEmitter } from './throttledEmitter'

describe('createThrottledEmitter', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('emits the first value immediately (leading edge)', () => {
    const fn = vi.fn()
    const t = createThrottledEmitter<string>(fn, 150)
    t.emit('a')
    expect(fn).toHaveBeenCalledTimes(1)
    expect(fn).toHaveBeenCalledWith('a')
  })

  it('coalesces a burst inside the window into one trailing emit of the LAST value', () => {
    const fn = vi.fn()
    const t = createThrottledEmitter<string>(fn, 150)
    t.emit('a') // leading → fires 'a'
    t.emit('b')
    t.emit('c')
    expect(fn).toHaveBeenCalledTimes(1) // still just the leading 'a'
    vi.advanceTimersByTime(150)
    expect(fn).toHaveBeenCalledTimes(2)
    expect(fn).toHaveBeenLastCalledWith('c') // trailing fires the latest only
  })

  it('a single emit fires exactly once (no spurious trailing emit)', () => {
    const fn = vi.fn()
    const t = createThrottledEmitter<string>(fn, 150)
    t.emit('a')
    vi.advanceTimersByTime(500)
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('sustained emits fire at a steady cadence (leading + one per window)', () => {
    const fn = vi.fn()
    const t = createThrottledEmitter<number>(fn, 100)
    t.emit(1) // leading → 1
    t.emit(2)
    vi.advanceTimersByTime(100) // window end → 2
    t.emit(3)
    vi.advanceTimersByTime(100) // window end → 3
    expect(fn.mock.calls.map((c) => c[0])).toEqual([1, 2, 3])
  })

  it('flush fires the latest pending value exactly once, immediately', () => {
    const fn = vi.fn()
    const t = createThrottledEmitter<string>(fn, 150)
    t.emit('a') // leading → 'a'
    t.emit('b') // pending
    t.flush()
    expect(fn).toHaveBeenCalledTimes(2)
    expect(fn).toHaveBeenLastCalledWith('b')
  })

  it('does not emit again after a flush, even as timers advance', () => {
    const fn = vi.fn()
    const t = createThrottledEmitter<string>(fn, 150)
    t.emit('a')
    t.emit('b')
    t.flush() // fires 'b'
    fn.mockClear()
    vi.advanceTimersByTime(1000)
    expect(fn).not.toHaveBeenCalled()
  })

  it('flush with nothing pending is a no-op', () => {
    const fn = vi.fn()
    const t = createThrottledEmitter<string>(fn, 150)
    t.emit('a') // leading only, nothing pending
    fn.mockClear()
    t.flush()
    expect(fn).not.toHaveBeenCalled()
  })

  it('cancel drops the pending value without firing it', () => {
    const fn = vi.fn()
    const t = createThrottledEmitter<string>(fn, 150)
    t.emit('a') // leading → 'a'
    t.emit('b') // pending
    t.cancel()
    fn.mockClear()
    vi.advanceTimersByTime(1000)
    expect(fn).not.toHaveBeenCalled()
  })

  it('starts a fresh leading emit after the window has fully drained', () => {
    const fn = vi.fn()
    const t = createThrottledEmitter<string>(fn, 150)
    t.emit('a') // leading → 'a'
    vi.advanceTimersByTime(150) // window ends, nothing pending
    t.emit('b') // fresh leading → 'b'
    expect(fn.mock.calls.map((c) => c[0])).toEqual(['a', 'b'])
  })
})

describe('createSettleEmitter', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('fires a DELIBERATE single change immediately — the whole reason for a leading edge', () => {
    const fn = vi.fn()
    const s = createSettleEmitter<string>(fn, 300)
    s.emit('noon')
    expect(fn).toHaveBeenCalledTimes(1)
    expect(fn).toHaveBeenCalledWith('noon')
    vi.advanceTimersByTime(1000)
    // Nothing trailing: one emit is not a stream, so it must not apply twice.
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('a drag pays ONCE at the start and ONCE at the end, never per step', () => {
    const fn = vi.fn()
    const s = createSettleEmitter<number>(fn, 300)
    for (let i = 0; i < 12; i++) {
      s.emit(i)
      vi.advanceTimersByTime(120)
    }
    expect(fn).toHaveBeenCalledTimes(1) // the leading edge only
    vi.advanceTimersByTime(300)
    expect(fn).toHaveBeenCalledTimes(2)
    expect(fn).toHaveBeenLastCalledWith(11)
  })

  it('does NOT re-open its window mid-stream, which is the difference from the throttle', () => {
    const settle = vi.fn()
    const throttle = vi.fn()
    const s = createSettleEmitter<number>(settle, 300)
    const t = createThrottledEmitter<number>(throttle, 300)
    for (let i = 0; i < 20; i++) {
      s.emit(i)
      t.emit(i)
      vi.advanceTimersByTime(120)
    }
    expect(settle).toHaveBeenCalledTimes(1)
    expect(throttle.mock.calls.length).toBeGreaterThan(5)
  })

  it('arms its window from the END of the work, so a slow fn cannot pace its own trigger', () => {
    // The measured failure: a capture longer than the window returned to an ALREADY-EXPIRED
    // window, so every event that queued behind the blocked main thread took the leading edge
    // again — 12 drag steps became 12 serialized captures over 60 s.
    const fn = vi.fn(() => {
      vi.advanceTimersByTime(1000) // `fn` blocks for far longer than the 300 ms floor
    })
    const s = createSettleEmitter<number>(fn, 300)
    s.emit(0)
    expect(fn).toHaveBeenCalledTimes(1)
    // The events that were stuck behind that work now arrive back-to-back.
    s.emit(1)
    s.emit(2)
    expect(fn).toHaveBeenCalledTimes(1) // coalesced, NOT a fresh leading edge each
    vi.advanceTimersByTime(1000)
    expect(fn).toHaveBeenCalledTimes(2)
    expect(fn).toHaveBeenLastCalledWith(2)
  })

  it('scales its window to the work: a slow call cannot be re-triggered at the 300 ms floor', () => {
    // Arming from the end is not enough on a slow machine — the CALLER's follow-on work (for the
    // room probes, a ~400-material shader recompile) lands between the two, so the next queued
    // event commits after a fixed window has already closed. A real slider drag measured 7
    // captures / 43.8 s that way. `max(quietMs, lastDuration)` is what closes it.
    const fn = vi.fn(() => {
      vi.advanceTimersByTime(2000)
    })
    const s = createSettleEmitter<number>(fn, 300)
    s.emit(0)
    expect(fn).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(300) // the FLOOR has elapsed…
    s.emit(1)
    expect(fn).toHaveBeenCalledTimes(1) // …but the window is 2000, so this coalesces
    vi.advanceTimersByTime(1999)
    expect(fn).toHaveBeenCalledTimes(1) // and the restart keeps the full 2000 ms
    vi.advanceTimersByTime(1)
    expect(fn).toHaveBeenCalledTimes(2)
    expect(fn).toHaveBeenLastCalledWith(1)
  })

  it('a coalesced emit restarts the ADAPTIVE window, not the 300 ms floor', () => {
    const fn = vi.fn(() => {
      vi.advanceTimersByTime(2000)
    })
    const s = createSettleEmitter<number>(fn, 300)
    s.emit(0) // 2000 ms of work → a 2000 ms window
    s.emit(1) // coalesced; the restart must keep the 2000 ms window
    vi.advanceTimersByTime(500)
    s.emit(2) // still inside it
    vi.advanceTimersByTime(500)
    expect(fn).toHaveBeenCalledTimes(1) // a 300 ms restart would already have fired here
    vi.advanceTimersByTime(1500)
    expect(fn).toHaveBeenCalledTimes(2)
    expect(fn).toHaveBeenLastCalledWith(2)
  })

  it('treats a gap longer than the quiet window as a new deliberate change', () => {
    const fn = vi.fn()
    const s = createSettleEmitter<string>(fn, 300)
    s.emit('a')
    vi.advanceTimersByTime(1000)
    s.emit('b')
    expect(fn).toHaveBeenCalledTimes(2)
    expect(fn).toHaveBeenLastCalledWith('b')
  })

  it('flush() applies a pending value now; cancel() drops it', () => {
    const fn = vi.fn()
    const s = createSettleEmitter<string>(fn, 300)
    s.emit('a')
    s.emit('b')
    s.flush()
    expect(fn).toHaveBeenCalledTimes(2)
    expect(fn).toHaveBeenLastCalledWith('b')

    fn.mockClear()
    s.emit('c')
    s.emit('d')
    s.cancel()
    vi.advanceTimersByTime(1000)
    expect(fn).toHaveBeenCalledTimes(1) // only the leading 'c'
    expect(fn).toHaveBeenLastCalledWith('c')
  })
})
