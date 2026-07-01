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
