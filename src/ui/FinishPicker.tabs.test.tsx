// @vitest-environment happy-dom
/**
 * The per-room FinishPicker's segmented Floor / Walls / Ceiling surface tab
 * row — only the active surface's block shows. The Ceiling tab only exists
 * when the `ceilingFinish` flag is on; the wall-accents section lives under
 * the Walls tab. The selected tab persists across mounts (LAST_SURFACE_KEY).
 */
import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useStore } from '../state/store'
import { FinishPicker } from './FinishPicker'

// Swatch thumbnails paint a 2D canvas, which happy-dom doesn't implement —
// stub just the data-URL generator (everything else in the module is real).
vi.mock('../materials/procedural/generators', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  proceduralThumbnailDataUrl: () => 'data:,',
}))

const ROOM = 'livingDining'

beforeEach(() => {
  // Tab selection persists to localStorage (LAST_SURFACE_KEY); clear it so each
  // test starts on the default Floor tab regardless of prior tab clicks.
  try {
    localStorage.clear()
  } catch {
    // ignore (unavailable storage)
  }
  useStore.getState().__resetForTest?.()
  useStore.getState().selectRoom(ROOM)
})

afterEach(() => {
  useStore.getState().selectRoom(null)
})

describe('FinishPicker — surface tab row', () => {
  it('renders a Floor | Walls | Ceiling tablist', () => {
    render(<FinishPicker />)
    expect(screen.getByRole('tablist', { name: 'Finish surface' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Floor' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Walls' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Ceiling' })).toBeInTheDocument()
  })

  it('hides the Ceiling tab when the ceilingFinish flag is off', () => {
    useStore.setState({
      featureFlags: { ...useStore.getState().featureFlags, ceilingFinish: false },
    })
    render(<FinishPicker />)
    expect(screen.getByRole('tab', { name: 'Floor' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Walls' })).toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: 'Ceiling' })).toBeNull()
  })

  it('shows only the Floor block by default (not walls / ceiling apply-all)', () => {
    render(<FinishPicker />)
    expect(screen.getByText('Apply floor to all rooms')).toBeInTheDocument()
    expect(screen.queryByText('Apply walls to all rooms')).toBeNull()
    expect(screen.queryByText('Apply ceiling to all rooms')).toBeNull()
  })

  it('switching tabs swaps the visible surface block', () => {
    render(<FinishPicker />)
    fireEvent.click(screen.getByRole('tab', { name: 'Walls' }))
    expect(screen.getByText('Apply walls to all rooms')).toBeInTheDocument()
    expect(screen.queryByText('Apply floor to all rooms')).toBeNull()
    expect(screen.getByRole('tab', { name: 'Walls' })).toHaveAttribute('aria-selected', 'true')

    fireEvent.click(screen.getByRole('tab', { name: 'Ceiling' }))
    expect(screen.getByText('Apply ceiling to all rooms')).toBeInTheDocument()
    expect(screen.queryByText('Apply walls to all rooms')).toBeNull()
  })

  it('shows the accent-walls section only under the Walls tab', () => {
    render(<FinishPicker />)
    // Default Floor tab → no accent section.
    expect(screen.queryByText('Accent walls')).toBeNull()
    fireEvent.click(screen.getByRole('tab', { name: 'Walls' }))
    expect(screen.getByText('Accent walls')).toBeInTheDocument()
    // Move away → gone again.
    fireEvent.click(screen.getByRole('tab', { name: 'Floor' }))
    expect(screen.queryByText('Accent walls')).toBeNull()
  })

  it('persists the selected tab and restores it (LAST_SURFACE_KEY)', () => {
    const { unmount } = render(<FinishPicker />)
    fireEvent.click(screen.getByRole('tab', { name: 'Walls' }))
    unmount()
    render(<FinishPicker />)
    expect(screen.getByRole('tab', { name: 'Walls' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByText('Apply walls to all rooms')).toBeInTheDocument()
  })
})
