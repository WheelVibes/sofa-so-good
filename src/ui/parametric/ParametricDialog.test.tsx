import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useStore } from '../../state/store'

// The live R3F preview needs a WebGL canvas — not available (or relevant)
// under jsdom. The geometry it renders is covered by buildParts.test.ts.
vi.mock('./ParametricPreview', () => ({ ParametricPreview: () => null }))

import { ParametricDialog } from './ParametricDialog'

describe('ParametricDialog (PF1) — Simple/Pro gating', () => {
  beforeEach(() => useStore.getState().__resetForTest())

  it('does NOT render in Simple mode (default) even when opened', () => {
    act(() => useStore.getState().setParametricOpen(true))
    render(<ParametricDialog />)
    expect(useStore.getState().uiMode).toBe('simple')
    expect(useStore.getState().featureFlags.parametricFurniture).toBe(false)
    expect(screen.queryByText('Custom-size furniture')).toBeNull()
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
