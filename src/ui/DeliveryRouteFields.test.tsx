// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useStore } from '../state/store'
import { DeliveryRouteFields } from './DeliveryRouteFields'

afterEach(cleanup)

/**
 * DELIVERY-ROUTE-OVERRIDE (v0.31.9.0) — `deliveryRouteMeasure` is `pro`, so the
 * section must be absent in Simple and present in Pro. Both modes are tested
 * because the root CLAUDE.md requires it of anything whose visibility depends on
 * the tier, and because a pro-only editor silently appearing in Simple would
 * undercut "Simple is genuinely minimal".
 */
describe('DeliveryRouteFields', () => {
  beforeEach(() => {
    useStore.getState().clearDeliveryRoute()
  })

  it('renders nothing in Simple mode (pro-tier flag)', () => {
    useStore.getState().setUiMode('simple')
    useStore.getState().reresolveFeatureFlags()
    const { container } = render(<DeliveryRouteFields />)
    expect(container.firstChild).toBeNull()
  })

  it('renders the three apertures in Pro mode', () => {
    useStore.getState().setUiMode('pro')
    useStore.getState().reresolveFeatureFlags()
    render(<DeliveryRouteFields />)
    expect(screen.getByText('Delivery route')).toBeTruthy()
    expect(screen.getByText('Lift door opening')).toBeTruthy()
    expect(screen.getByText('Lift cabin')).toBeTruthy()
    expect(screen.getByText('Main entrance door')).toBeTruthy()
  })

  it('gives every field a UNIQUE accessible name', () => {
    // The first cut labelled all three "Width measured on site, millimetres",
    // which is unusable on a screen reader — this test is why it was caught.
    useStore.getState().setUiMode('pro')
    useStore.getState().reresolveFeatureFlags()
    const { container } = render(<DeliveryRouteFields />)
    const names = [...container.querySelectorAll('input')].map((i) => i.getAttribute('aria-label'))
    expect(names.length).toBeGreaterThan(3)
    expect(new Set(names).size).toBe(names.length)
  })

  it('shows the published typical as the PLACEHOLDER, so empty reads as "typical"', () => {
    useStore.getState().setUiMode('pro')
    useStore.getState().reresolveFeatureFlags()
    render(<DeliveryRouteFields />)
    const width = screen.getByLabelText(
      'Lift door opening width measured on site, millimetres',
    ) as HTMLInputElement
    // Lift door typical is 0.80 m; the field is empty and hints 800.
    expect(width.value).toBe('')
    expect(width.placeholder).toBe('800 typical')
  })

  it('offers the reset only once something is measured', () => {
    useStore.getState().setUiMode('pro')
    useStore.getState().reresolveFeatureFlags()
    const first = render(<DeliveryRouteFields />)
    expect(first.queryByText('Reset to typicals')).toBeNull()
    cleanup()
    useStore.getState().setDeliveryRouteDim('lift-door', 'widthM', 0.75)
    render(<DeliveryRouteFields />)
    expect(screen.getByText('Reset to typicals')).toBeTruthy()
  })

  it('names the corridor turn as unchecked rather than offering a field for it', () => {
    // A turn is not a rectangular aperture, so `AccessConstraint` cannot model
    // it — and a field the check ignores would be worse than saying so.
    useStore.getState().setUiMode('pro')
    useStore.getState().reresolveFeatureFlags()
    render(<DeliveryRouteFields />)
    expect(screen.getByText(/corridor turn from the lift lobby is not checked/i)).toBeTruthy()
    expect(screen.queryByLabelText(/corridor turn measured/i)).toBeNull()
  })
})
