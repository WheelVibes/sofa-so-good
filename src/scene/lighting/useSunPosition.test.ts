// @vitest-environment happy-dom
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useStore } from '../../state/store'
import { __resetSunCacheForTest, FALLBACK_LOCATION, useSunPosition } from './useSunPosition'

describe('FALLBACK_LOCATION', () => {
  it('is Singapore', () => {
    expect(FALLBACK_LOCATION).toEqual({ lat: 1.35, lon: 103.82 })
  })
})

describe('useSunPosition', () => {
  beforeEach(() => {
    useStore.getState().__resetForTest()
    __resetSunCacheForTest()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-01T04:00:00.000Z')) // 12:00 SGT
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns a SunPosition derived from the fallback when no user location', () => {
    const { result } = renderHook(() => useSunPosition())
    expect(typeof result.current.altitude).toBe('number')
    // Singapore at noon — sun should be high.
    expect(result.current.altitude).toBeGreaterThan(0.8) // > ~46°
  })

  it('uses the user location when set', () => {
    useStore.getState().setLocation({ lat: 51.5, lon: 0 })
    useStore.getState().setManualHour(12) // forces manual mode at noon
    const { result } = renderHook(() => useSunPosition())
    // London at "noon" on May 1: altitude < Singapore noon.
    expect(result.current.altitude).toBeLessThan(1.2) // < ~69°
  })

  it('updates when manualHour changes', () => {
    useStore.getState().setManualHour(0) // midnight
    const { result } = renderHook(() => useSunPosition())
    const midnight = result.current.altitude
    act(() => useStore.getState().setManualHour(12))
    const noon = result.current.altitude
    expect(midnight).toBeLessThan(0)
    expect(noon).toBeGreaterThan(0)
  })

  it('memoises a stable reference for identical inputs, recomputes on change (PERF-MAX-3)', () => {
    useStore.getState().setManualHour(12)
    const a = renderHook(() => useSunPosition())
    const first = a.result.current
    // A second independent caller with identical (hour, location) shares the ONE
    // cached object — no redundant SunCalc.getPosition / Date allocation.
    const b = renderHook(() => useSunPosition())
    expect(b.result.current).toBe(first)
    // Changing the hour busts the key → the same hook now yields a fresh object.
    act(() => useStore.getState().setManualHour(6))
    expect(a.result.current).not.toBe(first)
  })
})
