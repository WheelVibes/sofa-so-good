// @vitest-environment happy-dom
/**
 * A11Y test for `MobileToolbar` (v0.9.0.36): the mobile menu sheet closes on
 * Escape (it was previously the lone overlay without an Escape handler).
 */
import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useStore } from '../../state/store'
import { MobileToolbar } from './MobileToolbar'

beforeEach(() => {
  useStore.getState().__resetForTest?.()
})

afterEach(() => {
  useStore.getState().__resetForTest?.()
})

describe('MobileToolbar menu sheet — Escape to close', () => {
  it('opens the sheet from the Menu button and closes it on Escape', () => {
    render(<MobileToolbar />)
    // Open the sheet.
    fireEvent.click(screen.getByRole('button', { name: 'Menu' }))
    // The sheet's own Close button is present while open.
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument()
    // Escape closes it.
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('button', { name: 'Close' })).toBeNull()
  })
})

describe('MobileToolbar menu sheet — grab-pill swipe up dismisses (TB-3)', () => {
  const openSheet = () => {
    const utils = render(<MobileToolbar />)
    fireEvent.click(screen.getByRole('button', { name: 'Menu' }))
    const grab = utils.container.parentElement?.querySelector('.m-sheet-grab') as HTMLElement
    return grab ?? (document.querySelector('.m-sheet-grab') as HTMLElement)
  }

  it('a swipe UP past the threshold closes the sheet', () => {
    const grab = openSheet()
    expect(grab).toBeTruthy()
    fireEvent.touchStart(grab, { touches: [{ clientY: 300 }] })
    fireEvent.touchEnd(grab, { changedTouches: [{ clientY: 240 }] })
    expect(document.querySelector('.m-sheet')).toBeNull()
  })

  it('a small or downward swipe keeps the sheet open', () => {
    const grab = openSheet()
    fireEvent.touchStart(grab, { touches: [{ clientY: 300 }] })
    fireEvent.touchEnd(grab, { changedTouches: [{ clientY: 290 }] })
    expect(document.querySelector('.m-sheet')).not.toBeNull()
    fireEvent.touchStart(grab, { touches: [{ clientY: 300 }] })
    fireEvent.touchEnd(grab, { changedTouches: [{ clientY: 400 }] })
    expect(document.querySelector('.m-sheet')).not.toBeNull()
  })
})

describe('MobileToolbar rail — whole-flat Arrange in the overview (TB-4)', () => {
  const railTitles = () =>
    screen.getAllByRole('tab').map((t) => t.getAttribute('title') ?? t.getAttribute('aria-label'))

  it('the OVERVIEW rail includes Arrange (desktop parity: whole-flat presets/styles)', () => {
    render(<MobileToolbar />)
    fireEvent.click(screen.getByRole('button', { name: 'Menu' }))
    expect(railTitles()).toContain('Arrange')
    // Selecting it shows the Arrange detail pane (save-style row is unconditional).
    fireEvent.click(screen.getByRole('tab', { name: 'Arrange' }))
    expect(screen.getByText('Save current style…')).toBeInTheDocument()
  })

  it('the room-editor rail keeps Arrange too', () => {
    useStore.getState().enterRoomEditor('livingDining')
    render(<MobileToolbar />)
    fireEvent.click(screen.getByRole('button', { name: 'Menu' }))
    expect(railTitles()).toContain('Arrange')
  })
})
