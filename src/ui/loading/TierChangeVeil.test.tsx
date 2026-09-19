// @vitest-environment happy-dom
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { TierChangeVeil } from './TierChangeVeil'

afterEach(cleanup)

describe('TierChangeVeil', () => {
  it('exposes the data-transition-overlay automation hook while mounted (parity with LoadingOverlay)', () => {
    render(<TierChangeVeil active label="Applying Realistic quality…" />)
    expect(document.body.querySelectorAll('[data-transition-overlay]').length).toBe(1)
    expect(document.body.querySelectorAll('[data-tier-change-veil]').length).toBe(1)
  })

  it('renders no brand mark -- caption text only, no "Sofa So Good" title', () => {
    render(<TierChangeVeil active label="Applying Realistic quality…" />)
    const overlay = document.body.querySelector('[data-tier-change-veil]') as Element
    expect(overlay.textContent).not.toContain('Sofa So Good')
    expect(overlay.textContent).toContain('Applying Realistic quality…')
  })

  it('shows the caption text passed as label', () => {
    render(<TierChangeVeil active label="Applying Performance quality…" />)
    expect(document.body.textContent).toContain('Applying Performance quality…')
  })

  it('renders nothing when inactive and never shown', () => {
    render(<TierChangeVeil active={false} label="" />)
    expect(document.body.querySelector('[data-transition-overlay]')).toBeNull()
  })

  it('the indeterminate bar fill has no sweep animation class when reduced motion is on', () => {
    const original = window.matchMedia
    window.matchMedia = ((query: string) => ({
      matches: query.includes('prefers-reduced-motion'),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
      // Legacy API surface some libs still probe for.
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
      onchange: null,
    })) as unknown as typeof window.matchMedia

    render(<TierChangeVeil active label="Applying Realistic quality…" />)
    expect(document.body.querySelectorAll('.tier-veil-bar-fill').length).toBe(0)

    window.matchMedia = original
  })

  it('the indeterminate bar fill carries the sweep animation class by default (no reduced motion)', () => {
    render(<TierChangeVeil active label="Applying Realistic quality…" />)
    expect(document.body.querySelectorAll('.tier-veil-bar-fill').length).toBe(1)
  })
})
