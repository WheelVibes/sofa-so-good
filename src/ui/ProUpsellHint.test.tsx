// @vitest-environment happy-dom
/**
 * Tests for `ProUpsellHint` (P26) — the single Simple-mode discoverability
 * hint (⌘K footer) that Pro tools exist. Renders only when the `proUpsell`
 * flag is on AND `uiMode === 'simple'`; clicking opens the Appearance
 * popover (where the Simple↔Pro toggle lives), it does not silently flip
 * the mode itself.
 */
import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useStore } from '../state/store'
import { ProUpsellHint } from './ProUpsellHint'

beforeEach(() => {
  useStore.getState().__resetForTest?.()
  useStore.getState().setUiMode('simple')
  useStore.getState().reresolveFeatureFlags()
})

afterEach(() => {
  useStore.setState({ appearanceOpen: false })
})

describe('ProUpsellHint', () => {
  it('renders the hint with a Pro chip in Simple mode when the flag is on', () => {
    render(<ProUpsellHint />)
    expect(document.querySelector('.cmdk-upsell .badge.neutral')).toHaveTextContent('Pro')
    expect(screen.getByRole('button')).toBeInTheDocument()
  })

  it('clicking calls setAppearanceOpen(true)', () => {
    render(<ProUpsellHint />)
    fireEvent.click(screen.getByRole('button'))
    expect(useStore.getState().appearanceOpen).toBe(true)
  })

  it('renders null in Pro mode', () => {
    useStore.getState().setUiMode('pro')
    useStore.getState().reresolveFeatureFlags()
    const { container } = render(<ProUpsellHint />)
    expect(container.firstChild).toBeNull()
  })

  it('renders null when the proUpsell flag is off', () => {
    useStore.setState({
      featureFlags: { ...useStore.getState().featureFlags, proUpsell: false },
    })
    const { container } = render(<ProUpsellHint />)
    expect(container.firstChild).toBeNull()
  })
})
