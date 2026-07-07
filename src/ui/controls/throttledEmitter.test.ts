import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createThrottledEmitter } from './throttledEmitter'

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
