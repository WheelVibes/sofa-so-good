// @vitest-environment happy-dom
/**
 * Tests for `shouldReduceMotion` (U4) — the single gate every
 * `prefers-reduced-motion` call site now routes through. Verifies the
 * tri-state resolution: `'system'` defers to the OS query, while an explicit
 * `'on'`/`'off'` WINS over the OS query either way (mirrors `modePref`).
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useStore } from '../state/store'
import { shouldReduceMotion } from './motionPreference'

/** Mock `matchMedia` so `(prefers-reduced-motion: reduce)` matches or not. */
function setOsReducedMotion(reduce: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: reduce && query.includes('reduced-motion'),
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia
}

describe('shouldReduceMotion', () => {
  afterEach(() => {
    useStore.getState().__resetForTest?.()
  })

  it('"system" (the default) defers to the OS query when the OS wants reduced motion', () => {
    useStore.setState({ reduceMotion: 'system' })
    setOsReducedMotion(true)
    expect(shouldReduceMotion()).toBe(true)
  })

  it('"system" defers to the OS query when the OS has no preference', () => {
    useStore.setState({ reduceMotion: 'system' })
    setOsReducedMotion(false)
    expect(shouldReduceMotion()).toBe(false)
  })

  it('"on" forces reduced motion even when the OS has no preference', () => {
    useStore.setState({ reduceMotion: 'on' })
    setOsReducedMotion(false)
    expect(shouldReduceMotion()).toBe(true)
  })

  it('"off" allows motion even when the OS asks to reduce it', () => {
    useStore.setState({ reduceMotion: 'off' })
    setOsReducedMotion(true)
    expect(shouldReduceMotion()).toBe(false)
  })

  it('defaults to "system" for a fresh store', () => {
    expect(useStore.getState().reduceMotion).toBe('system')
  })
})
