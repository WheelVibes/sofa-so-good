/**
 * Tests for the FinishPicker's "Accent walls" management section (v0.9.0.45) —
 * surfaces + clears a room's per-wall accent finishes (`finishes.wallAccents`,
 * keyed `wallId:roomId`) from the per-room panel. Gated by `wallAccentPicker`.
 */
import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useStore } from '../state/store'
import { FinishPicker } from './FinishPicker'

vi.mock('../materials/procedural/generators', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  proceduralThumbnailDataUrl: () => 'data:,',
}))

const ROOM = 'livingDining'

beforeEach(() => {
  useStore.getState().__resetForTest?.()
  useStore.getState().selectRoom(ROOM)
})

afterEach(() => {
  useStore.getState().selectRoom(null)
})

describe('FinishPicker — accent walls section', () => {
  it('shows the section with a tap-a-wall hint when the room has no accents', () => {
    render(<FinishPicker />)
    expect(screen.getByText('Accent walls')).toBeInTheDocument()
    expect(screen.getByText(/Tap any wall in the 3D view/i)).toBeInTheDocument()
  })

  it('lists an existing accent and clears it on demand', () => {
    useStore.getState().setWallAccent(`w1:${ROOM}`, 'wall-beige')
    render(<FinishPicker />)
    // The accent is listed with a remove control.
    const clear = screen.getByRole('button', { name: /Remove accent wall/i })
    expect(clear).toBeInTheDocument()
    expect(useStore.getState().finishes.wallAccents[`w1:${ROOM}`]).toBe('wall-beige')
    fireEvent.click(clear)
    expect(useStore.getState().finishes.wallAccents[`w1:${ROOM}`]).toBeUndefined()
  })

  it('only lists accents for the SELECTED room, not other rooms', () => {
    useStore.getState().setWallAccent(`w1:${ROOM}`, 'wall-beige')
    useStore.getState().setWallAccent('w9:bedroom', 'wall-concrete')
    render(<FinishPicker />)
    // Exactly one remove control — the other room's accent is not listed here.
    expect(screen.getAllByRole('button', { name: /Remove accent wall/i })).toHaveLength(1)
  })

  it('hides the section when the wallAccentPicker flag is off', () => {
    useStore.setState({
      featureFlags: { ...useStore.getState().featureFlags, wallAccentPicker: false },
    })
    render(<FinishPicker />)
    expect(screen.queryByText('Accent walls')).toBeNull()
  })
})
