// @vitest-environment happy-dom
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PHRASE_CYCLE_MS, PHRASE_FADE_MS } from './loadingPhrases'
import { useCyclingPhrase } from './useCyclingPhrase'

describe('useCyclingPhrase', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('advances to the next phrase after the cycle interval + fade', () => {
    const phrases = ['First…', 'Second…'] as const
    const { result } = renderHook(() => useCyclingPhrase(true, phrases))

    expect(result.current.phrase).toBe('First…')
    expect(result.current.visible).toBe(true)

    act(() => {
      vi.advanceTimersByTime(PHRASE_CYCLE_MS)
    })
    expect(result.current.visible).toBe(false)

    act(() => {
      vi.advanceTimersByTime(PHRASE_FADE_MS)
    })
    expect(result.current.phrase).toBe('Second…')
    expect(result.current.visible).toBe(true)
  })

  it('stops cycling when inactive', () => {
    const phrases = ['First…', 'Second…'] as const
    const { result, rerender } = renderHook(({ active }) => useCyclingPhrase(active, phrases), {
      initialProps: { active: true },
    })

    rerender({ active: false })
    act(() => {
      vi.advanceTimersByTime(PHRASE_CYCLE_MS + PHRASE_FADE_MS)
    })
    expect(result.current.phrase).toBe('First…')
  })
})
