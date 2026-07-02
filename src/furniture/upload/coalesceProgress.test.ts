import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { coalesceProgress } from './coalesceProgress'

describe('coalesceProgress', () => {
  beforeEach(() => {
    vi.stubGlobal('requestAnimationFrame', undefined)
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('collapses many pushes before the frame into a single sink call with the latest value', () => {
    const sink = vi.fn()
    const c = coalesceProgress<number>(sink)
    c.push(1)
    c.push(2)
    c.push(3)
    expect(sink).not.toHaveBeenCalled() // nothing until the frame fires
    vi.advanceTimersByTime(16) // setTimeout fallback (rAF stubbed undefined)
    expect(sink).toHaveBeenCalledTimes(1)
    expect(sink).toHaveBeenLastCalledWith(3)
  })

  it('flush() delivers the latest value synchronously and cancels the pending frame', () => {
    const sink = vi.fn()
    const c = coalesceProgress<number>(sink)
    c.push(7)
    c.flush()
    expect(sink).toHaveBeenCalledTimes(1)
    expect(sink).toHaveBeenLastCalledWith(7)
    vi.advanceTimersByTime(16) // pending frame was cancelled — no second call
    expect(sink).toHaveBeenCalledTimes(1)
  })

  it('flush() with nothing pending is a no-op', () => {
    const sink = vi.fn()
    const c = coalesceProgress<number>(sink)
    c.flush()
    expect(sink).not.toHaveBeenCalled()
  })

  it('prefers requestAnimationFrame when available', () => {
    const raf = vi.fn((cb: FrameRequestCallback) => {
      cb(0)
      return 1
    })
    vi.stubGlobal('requestAnimationFrame', raf)
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
    const sink = vi.fn()
    const c = coalesceProgress<number>(sink)
    c.push(5)
    expect(raf).toHaveBeenCalledTimes(1)
    expect(sink).toHaveBeenLastCalledWith(5)
  })
})
