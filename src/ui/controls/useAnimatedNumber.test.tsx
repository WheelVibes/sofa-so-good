// @vitest-environment happy-dom
/**
 * UIUX-21: the animated numeric readout eases to the new value and settles on
 * it exactly; under prefers-reduced-motion it snaps immediately.
 */
import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useAnimatedNumber } from './useAnimatedNumber'

function mockReducedMotion(matches: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockReturnValue({ matches, addEventListener() {}, removeEventListener() {} }),
  )
}

afterEach(() => vi.unstubAllGlobals())

describe('useAnimatedNumber (UIUX-21)', () => {
  it('snaps immediately under prefers-reduced-motion', () => {
    mockReducedMotion(true)
    const { result, rerender } = renderHook(({ v }) => useAnimatedNumber(v), {
      initialProps: { v: 0 },
    })
    rerender({ v: 1200 })
    expect(result.current).toBe(1200)
  })

  it('eases to and settles exactly on the target value', async () => {
    mockReducedMotion(false)
    const { result, rerender } = renderHook(({ v }) => useAnimatedNumber(v), {
      initialProps: { v: 0 },
    })
    expect(result.current).toBe(0)
    rerender({ v: 1000 })
    // Mid-flight the value should be somewhere between (not teleported)…
    await act(() => new Promise((r) => setTimeout(r, 100)))
    const mid = result.current
    expect(mid).toBeGreaterThan(0)
    // …and after the duration it settles on the exact target.
    await act(() => new Promise((r) => setTimeout(r, 400)))
    expect(result.current).toBe(1000)
  })
})
