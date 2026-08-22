// @vitest-environment happy-dom
/**
 * UIUX-22: ShimmerText is garnish, not content — it renders plain text unless
 * the ambient-fx gate (flag AND non-performance tier AND no reduced-motion)
 * says otherwise, and never shimmers while `active` is false.
 */
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { resolveFlags, setResolvedFlags } from '../../features/featureFlags'
import { useStore } from '../../state/store'
import { ShimmerText } from './ShimmerText'

beforeEach(() => {
  useStore.getState().__resetForTest()
  setResolvedFlags(resolveFlags(true, { ambientFx: true }, false, 'pro'))
  useStore.setState({ featureFlags: resolveFlags(true, { ambientFx: true }, false, 'pro') })
})

describe('ShimmerText gate (UIUX-22)', () => {
  it('renders plain text in the default Performance tier (gate off)', () => {
    useStore.setState({ qualityTier: 'performance' })
    render(<ShimmerText>Denoising…</ShimmerText>)
    expect(screen.getByText('Denoising…').className).toBe('')
  })

  it('shimmers on a heavier tier with the flag on, and stops when inactive', () => {
    useStore.setState({ qualityTier: 'high' })
    const { rerender } = render(<ShimmerText>Denoising…</ShimmerText>)
    expect(screen.getByText('Denoising…').className).toContain('shimmer-text')
    rerender(<ShimmerText active={false}>Denoising…</ShimmerText>)
    expect(screen.getByText('Denoising…').className).toBe('')
  })
})
