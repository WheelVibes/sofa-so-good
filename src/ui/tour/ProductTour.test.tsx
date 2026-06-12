import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useStore } from '../../state/store'
import { ProductTour } from './ProductTour'
import { TOUR_STEPS } from './tourSteps'

/** Drive `useIsMobile` (which reads `window.matchMedia('(max-width: 640px)')`). */
function setViewport(mobile: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: mobile && query.includes('max-width'),
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia
}

describe('ProductTour', () => {
  beforeEach(() => {
    useStore.getState().__resetForTest()
  })
  afterEach(() => {
    useStore.getState().endTour()
  })

  it('does not render when the tour is closed', () => {
    setViewport(false)
    const { container } = render(<ProductTour />)
    expect(container.firstChild).toBeNull()
  })

  it('renders the first step on desktop and keeps the tour open', () => {
    setViewport(false)
    useStore.getState().startTour()
    render(<ProductTour />)
    expect(screen.getByText(TOUR_STEPS[0].title)).toBeInTheDocument()
    expect(useStore.getState().tourOpen).toBe(true)
  })

  // Regression: picking "Take the guided tour" on mobile used to flash the tour
  // open and immediately end it (so the location prompt surfaced instead). The
  // tour must stay open and show its centred-card walkthrough on mobile too.
  it('renders on mobile as a centred card and stays open', () => {
    setViewport(true)
    useStore.getState().startTour()
    render(<ProductTour />)
    expect(screen.getByText(TOUR_STEPS[0].title)).toBeInTheDocument()
    expect(useStore.getState().tourOpen).toBe(true)
    // No spotlight on mobile: even an `action` step offers a Next button rather
    // than forcing a click on a control hidden in the hamburger sheet.
    expect(screen.getByRole('button', { name: /next/i })).toBeInTheDocument()
  })
})
