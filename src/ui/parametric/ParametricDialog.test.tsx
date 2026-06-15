import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useStore } from '../../state/store'

// The live R3F preview needs a WebGL canvas — not available (or relevant)
// under jsdom. The geometry it renders is covered by buildParts.test.ts.
vi.mock('./ParametricPreview', () => ({ ParametricPreview: () => null }))

import { ParametricDialog } from './ParametricDialog'

describe('ParametricDialog (PF1) — Simple/Pro gating', () => {
  beforeEach(() => useStore.getState().__resetForTest())

  it('renders in Simple mode (default) when opened — parametricFurniture is simple-tier', () => {
    act(() => useStore.getState().setParametricOpen(true))
    render(<ParametricDialog />)
    expect(useStore.getState().uiMode).toBe('simple')
    expect(useStore.getState().featureFlags.parametricFurniture).toBe(true)
    expect(screen.getByText('Custom-size furniture')).toBeTruthy()
  })

  it('renders in Pro mode with type tabs + dimension controls', () => {
    act(() => {
      useStore.getState().setUiMode('pro')
      useStore.getState().setParametricOpen(true)
    })
    render(<ParametricDialog />)
    expect(screen.getByText('Custom-size furniture')).toBeTruthy()
    expect(screen.getByText('Bookshelf')).toBeTruthy()
    expect(screen.getByText('Wardrobe')).toBeTruthy()
    expect(screen.getByText('Sideboard / TV console')).toBeTruthy()
    expect(screen.getByText('Desk')).toBeTruthy()
    expect(screen.getByLabelText('Width (cm)')).toBeTruthy()
  })

  it('stays hidden when closed in Pro mode', () => {
    act(() => useStore.getState().setUiMode('pro'))
    render(<ParametricDialog />)
    expect(screen.queryByText('Custom-size furniture')).toBeNull()
  })

  it('clamps out-of-range typed dimensions (never crashes)', () => {
    act(() => {
      useStore.getState().setUiMode('pro')
      useStore.getState().setParametricOpen(true)
    })
    render(<ParametricDialog />)
    const width = screen.getByLabelText('Width (cm)') as HTMLInputElement
    fireEvent.change(width, { target: { value: '9999' } })
    // Bookshelf max width is 240 cm — the default name reflects the clamp.
    expect((screen.getByLabelText('Item name') as HTMLInputElement).placeholder).toBe(
      'Custom bookshelf 240 × 200 cm',
    )
    // Clearing the field is harmless (keeps the last committed value).
    fireEvent.change(width, { target: { value: '' } })
    expect((screen.getByLabelText('Item name') as HTMLInputElement).placeholder).toBe(
      'Custom bookshelf 240 × 200 cm',
    )
  })

  it('switching type resets to that type defaults (wardrobe doors on)', () => {
    act(() => {
      useStore.getState().setUiMode('pro')
      useStore.getState().setParametricOpen(true)
    })
    render(<ParametricDialog />)
    fireEvent.click(screen.getByText('Wardrobe'))
    expect(screen.getByLabelText('Doors')).toBeTruthy()
    expect((screen.getByLabelText('Doors') as HTMLElement).getAttribute('aria-checked')).toBe(
      'true',
    )
    expect(screen.getByText('2 leaves (each ≤ 60 cm)')).toBeTruthy()
  })
})

describe('ParametricDialog — Kitchen tab (C270)', () => {
  beforeEach(() => useStore.getState().__resetForTest())

  it('Kitchen tab visible in Simple mode (kitchenCabinets is simple-tier)', () => {
    act(() => {
      // Simple mode (default) → kitchenCabinets is simple-tier, so on.
      useStore.getState().setParametricOpen(true)
    })
    render(<ParametricDialog />)
    // parametricFurniture is simple-tier → the dialog mounts, and the
    // simple-tier kitchenCabinets flag keeps the Kitchen tab present.
    expect(screen.getByText('Kitchen run')).toBeTruthy()
  })

  it('Kitchen tab visible in Pro mode', () => {
    act(() => {
      useStore.getState().setUiMode('pro')
      useStore.getState().setParametricOpen(true)
    })
    render(<ParametricDialog />)
    expect(screen.getByText('Kitchen run')).toBeTruthy()
  })

  it('switching to Kitchen tab shows bay-count slider and upper-cabinets toggle', () => {
    act(() => {
      useStore.getState().setUiMode('pro')
      useStore.getState().setParametricOpen(true)
    })
    render(<ParametricDialog />)
    fireEvent.click(screen.getByText('Kitchen run'))
    expect(screen.getByLabelText('Bay count')).toBeTruthy()
    expect(screen.getByLabelText('Upper cabinets')).toBeTruthy()
  })

  it('Kitchen tab shows Worktop height label (not generic Height)', () => {
    act(() => {
      useStore.getState().setUiMode('pro')
      useStore.getState().setParametricOpen(true)
    })
    render(<ParametricDialog />)
    fireEvent.click(screen.getByText('Kitchen run'))
    expect(screen.getByLabelText('Worktop height (cm)')).toBeTruthy()
  })

  it('toggling upper cabinets toggles the switch aria-checked', () => {
    act(() => {
      useStore.getState().setUiMode('pro')
      useStore.getState().setParametricOpen(true)
    })
    render(<ParametricDialog />)
    fireEvent.click(screen.getByText('Kitchen run'))
    const toggle = screen.getByLabelText('Upper cabinets') as HTMLElement
    expect(toggle.getAttribute('aria-checked')).toBe('false')
    fireEvent.click(toggle)
    expect(
      (screen.getByLabelText('Upper cabinets') as HTMLElement).getAttribute('aria-checked'),
    ).toBe('true')
  })

  it('kitchenCabinets flag off → Kitchen tab hidden in Pro mode', () => {
    act(() => {
      useStore.getState().setUiMode('pro')
      useStore.getState().setFeatureFlag('kitchenCabinets', false)
      useStore.getState().setParametricOpen(true)
    })
    render(<ParametricDialog />)
    expect(screen.queryByText('Kitchen run')).toBeNull()
  })
})
