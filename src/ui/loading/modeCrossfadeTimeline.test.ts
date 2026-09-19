// @vitest-environment happy-dom
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MODE_CROSSFADE_MS, useModeSwitchCrossfade } from './modeCrossfadeTimeline'

describe('useModeSwitchCrossfade', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  function advance(ms: number) {
    act(() => {
      vi.advanceTimersByTime(ms)
    })
  }

  it('starts unmounted (no veil before any switch)', () => {
    const { result } = renderHook(({ nonce, reduced }) => useModeSwitchCrossfade(nonce, reduced), {
      initialProps: { nonce: 0, reduced: false },
    })
    expect(result.current.mounted).toBe(false)
    expect(result.current.fading).toBe(false)
  })

  it('a nonce bump mounts opaque, then fades, then unmounts after MODE_CROSSFADE_MS', () => {
    const { result, rerender } = renderHook(
      ({ nonce, reduced }) => useModeSwitchCrossfade(nonce, reduced),
      { initialProps: { nonce: 0, reduced: false } },
    )
    rerender({ nonce: 1, reduced: false })
    // Mounted immediately, at full opacity (not fading) for at least one tick.
    expect(result.current.mounted).toBe(true)
    expect(result.current.fading).toBe(false)

    // Next tick: starts fading, stays mounted.
    advance(0)
    expect(result.current.mounted).toBe(true)
    expect(result.current.fading).toBe(true)

    // After the fade duration it unmounts.
    advance(MODE_CROSSFADE_MS)
    expect(result.current.mounted).toBe(false)
    expect(result.current.fading).toBe(false)
  })

  it('a second nonce bump mid-fade restarts from full opacity', () => {
    const { result, rerender } = renderHook(
      ({ nonce, reduced }) => useModeSwitchCrossfade(nonce, reduced),
      { initialProps: { nonce: 0, reduced: false } },
    )
    rerender({ nonce: 1, reduced: false })
    advance(0)
    expect(result.current.fading).toBe(true)

    // A second real switch before the first fade finished.
    rerender({ nonce: 2, reduced: false })
    expect(result.current.mounted).toBe(true)
    expect(result.current.fading).toBe(false)

    // The stale timer from the first timeline must not unmount/fade this one early.
    advance(MODE_CROSSFADE_MS / 2)
    expect(result.current.mounted).toBe(true)

    advance(MODE_CROSSFADE_MS)
    expect(result.current.mounted).toBe(false)
  })

  it('prefers-reduced-motion: the veil never mounts at all (instant switch)', () => {
    const { result, rerender } = renderHook(
      ({ nonce, reduced }) => useModeSwitchCrossfade(nonce, reduced),
      { initialProps: { nonce: 0, reduced: true } },
    )
    rerender({ nonce: 1, reduced: true })
    expect(result.current.mounted).toBe(false)
    advance(MODE_CROSSFADE_MS * 2)
    expect(result.current.mounted).toBe(false)
    expect(result.current.fading).toBe(false)
  })

  it('a no-op nonce (unchanged) does not retrigger the timeline', () => {
    const { result, rerender } = renderHook(
      ({ nonce, reduced }) => useModeSwitchCrossfade(nonce, reduced),
      { initialProps: { nonce: 1, reduced: false } },
    )
    // Same nonce as the initial render -- no edge, nothing should mount.
    rerender({ nonce: 1, reduced: false })
    expect(result.current.mounted).toBe(false)
  })
})
