// @vitest-environment happy-dom
/**
 * A11Y sweep: actions that silently reshuffle a room's furniture (Tidy up
 * room / reroll) must announce via a toast, same as mirror/clone/swap — a
 * screen-reader user gets no other signal the layout changed.
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

describe('FinishPicker — tidyRoom announces (A11Y)', () => {
  it('toasts "Room tidied up" after Tidy up room', () => {
    render(<FinishPicker />)
    fireEvent.click(screen.getByRole('button', { name: 'Tidy up room' }))
    expect(useStore.getState().notifications.some((n) => n.title === 'Room tidied up')).toBe(true)
  })
})
