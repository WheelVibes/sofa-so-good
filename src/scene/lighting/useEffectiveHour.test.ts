import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useStore } from '../../state/store'
import { hoursFromDate, useEffectiveHour } from './useEffectiveHour'

describe('hoursFromDate', () => {
  it('returns fractional hours including minutes and seconds', () => {
    const d = new Date('2026-05-01T03:30:36')
    // 3 + 30/60 + 36/3600 = 3 + 0.5 + 0.01 = 3.51
    expect(hoursFromDate(d)).toBeCloseTo(3.51, 2)
  })
})

describe('useEffectiveHour', () => {
  beforeEach(() => {
    useStore.getState().__resetForTest()
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns manualHour when in manual mode', () => {
    useStore.getState().setManualHour(7.25)
    const { result } = renderHook(() => useEffectiveHour())
    expect(result.current).toBe(7.25)
  })

  it('updates when manualHour changes', () => {
    useStore.getState().setManualHour(8)
    const { result } = renderHook(() => useEffectiveHour())
    expect(result.current).toBe(8)
    act(() => useStore.getState().setManualHour(9))
    expect(result.current).toBe(9)
  })

  it('returns the system clock hour when in system mode', () => {
    vi.setSystemTime(new Date('2026-05-01T14:30:00'))
    const { result } = renderHook(() => useEffectiveHour())
    expect(result.current).toBeCloseTo(14.5, 2)
  })

  it('refreshes the system hour roughly every 60 seconds', () => {
    vi.setSystemTime(new Date('2026-05-01T14:00:00'))
    const { result } = renderHook(() => useEffectiveHour())
    expect(result.current).toBeCloseTo(14.0, 2)

    // advanceTimersByTime moves the system clock forward by 60s and
    // fires the interval; the callback re-reads new Date() = 14:01.
    act(() => {
      vi.advanceTimersByTime(60_000)
    })
    expect(result.current).toBeCloseTo(14 + 1 / 60, 2)
  })

  it('switching from system to manual stops the interval', () => {
    vi.setSystemTime(new Date('2026-05-01T10:00:00'))
    const { result } = renderHook(() => useEffectiveHour())
    expect(result.current).toBeCloseTo(10, 2)
    act(() => useStore.getState().setManualHour(20))
    expect(result.current).toBe(20)
    // Advancing wall clock should not change result, because the
    // interval was cleared when timeMode flipped to 'manual'.
    act(() => {
      vi.advanceTimersByTime(120_000)
    })
    expect(result.current).toBe(20)
  })
})
