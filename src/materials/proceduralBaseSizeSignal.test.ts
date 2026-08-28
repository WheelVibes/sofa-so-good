import { afterEach, describe, expect, it, vi } from 'vitest'
import { getProceduralBaseSize, setProceduralBaseSize } from './procedural/generators'
import {
  getProceduralBaseSizeVersion,
  subscribeProceduralBaseSize,
} from './proceduralBaseSizeSignal'

afterEach(() => {
  setProceduralBaseSize(512)
})

describe('procedural base-size signal', () => {
  it('notifies subscribers when the size actually changes', () => {
    setProceduralBaseSize(512)
    const seen = vi.fn()
    const off = subscribeProceduralBaseSize(seen)
    setProceduralBaseSize(256)
    expect(seen).toHaveBeenCalledTimes(1)
    off()
  })

  // The whole point of the fix: the value must already be readable when the
  // notification arrives, because `QualityController` writes it from an effect and a
  // tier subscriber would otherwise re-resolve at the OLD size (v0.31.5.37's reverted
  // attempt did exactly that).
  it('has the new size readable by the time listeners run', () => {
    setProceduralBaseSize(512)
    let sizeAtNotify = 0
    const off = subscribeProceduralBaseSize(() => {
      sizeAtNotify = getProceduralBaseSize()
    })
    setProceduralBaseSize(256)
    expect(sizeAtNotify).toBe(256)
    off()
  })

  it('does not notify when the size is set to what it already is', () => {
    setProceduralBaseSize(256)
    const seen = vi.fn()
    const off = subscribeProceduralBaseSize(seen)
    setProceduralBaseSize(256)
    expect(seen).not.toHaveBeenCalled()
    off()
  })

  it('advances a monotonic version usable as a useSyncExternalStore snapshot', () => {
    setProceduralBaseSize(512)
    const before = getProceduralBaseSizeVersion()
    setProceduralBaseSize(256)
    const after = getProceduralBaseSizeVersion()
    expect(after).toBeGreaterThan(before)
    // Stable between changes — a snapshot that varied per call would loop forever.
    expect(getProceduralBaseSizeVersion()).toBe(after)
  })

  it('stops notifying after unsubscribe', () => {
    setProceduralBaseSize(512)
    const seen = vi.fn()
    subscribeProceduralBaseSize(seen)()
    setProceduralBaseSize(256)
    expect(seen).not.toHaveBeenCalled()
  })
})
