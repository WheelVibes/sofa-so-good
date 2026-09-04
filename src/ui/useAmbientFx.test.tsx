// @vitest-environment happy-dom
/**
 * Tests for `useAmbientFx` (P7) — the single gate for decorative ambient
 * effects: the `ambientFx` flag AND a non-`performance` `qualityTier` AND no
 * `prefers-reduced-motion`. Dormant by default (Performance is every device's
 * default tier), so effects render nothing unless a user opts into a heavier
 * tier. Each gate is verified independently.
 */
import { renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RenderTier } from '../scene/quality'
import { useStore } from '../state/store'
import { useAmbientFx } from './useAmbientFx'

/** Mock `matchMedia` so `(prefers-reduced-motion: reduce)` matches or not. */
function setReducedMotion(reduce: boolean) {
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

function seed(opts: { on: boolean; tier: RenderTier; reduce: boolean }) {
  setReducedMotion(opts.reduce)
  useStore.setState({
    featureFlags: { ...useStore.getState().featureFlags, ambientFx: opts.on },
    qualityTier: opts.tier,
  })
}

describe('useAmbientFx', () => {
  beforeEach(() => {
    useStore.getState().__resetForTest()
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('is true when the flag is on, tier is non-performance, and no reduced-motion', () => {
    seed({ on: true, tier: 'realistic', reduce: false })
    const { result } = renderHook(() => useAmbientFx())
    expect(result.current).toBe(true)
  })

  it('is false in the default performance tier (dormant by default)', () => {
    seed({ on: true, tier: 'performance', reduce: false })
    const { result } = renderHook(() => useAmbientFx())
    expect(result.current).toBe(false)
  })

  it('is false under prefers-reduced-motion', () => {
    seed({ on: true, tier: 'realistic', reduce: true })
    const { result } = renderHook(() => useAmbientFx())
    expect(result.current).toBe(false)
  })

  it('is false when the ambientFx flag is off', () => {
    seed({ on: false, tier: 'realistic', reduce: false })
    const { result } = renderHook(() => useAmbientFx())
    expect(result.current).toBe(false)
  })
})
