// @vitest-environment happy-dom
/**
 * Tests for the asset-credits entry (v0.9.0.41): a "View asset credits" button
 * in the shared AppearanceControls (desktop popover + mobile menu) opens the
 * (now-wired) CreditsModal. Gated by the `assetCredits` flag (simple, on in both
 * modes).
 */
import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { FEATURE_FLAGS } from '../../features/featureFlags'
import { useStore } from '../../state/store'
import { AppearanceControls } from './AppearancePopover'

beforeEach(() => {
  useStore.getState().__resetForTest?.()
})

afterEach(() => {
  useStore.getState().setCreditsOpen(false)
})

describe('assetCredits flag', () => {
  it('is a simple-tier default-on flag, enabled in BOTH modes', () => {
    const flag = FEATURE_FLAGS.assetCredits
    expect(flag.tier).toBe('simple')
    expect(flag.default).toBe(true)

    useStore.getState().setUiMode('simple')
    useStore.getState().reresolveFeatureFlags()
    expect(useStore.getState().featureFlags.assetCredits).toBe(true)
    useStore.getState().setUiMode('pro')
    useStore.getState().reresolveFeatureFlags()
    expect(useStore.getState().featureFlags.assetCredits).toBe(true)
  })
})

describe('AppearanceControls — asset-credits entry', () => {
  it('shows the credits button and opens the modal on click', () => {
    render(<AppearanceControls />)
    const btn = screen.getByRole('button', { name: 'Asset credits' })
    expect(btn).toBeInTheDocument()
    expect(useStore.getState().creditsOpen).toBe(false)
    fireEvent.click(btn)
    expect(useStore.getState().creditsOpen).toBe(true)
  })

  it('hides the credits button when the flag is off', () => {
    useStore.setState({
      featureFlags: { ...useStore.getState().featureFlags, assetCredits: false },
    })
    render(<AppearanceControls />)
    expect(screen.queryByRole('button', { name: 'Asset credits' })).toBeNull()
  })
})
