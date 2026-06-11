import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { isAnyModalOpen, resetModalGuardForTests } from '../controls/modalGuard'
import { Modal } from './Modal'

beforeEach(() => resetModalGuardForTests())

describe('Modal accessibility', () => {
  it('exposes a labelled dialog role when open', () => {
    render(
      <Modal open onClose={() => {}} title="Help & shortcuts">
        <p>body</p>
      </Modal>,
    )
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog).toHaveAttribute('aria-label', 'Help & shortcuts')
  })

  it('renders nothing when closed', () => {
    render(
      <Modal open={false} onClose={() => {}} title="Hidden">
        <p>body</p>
      </Modal>,
    )
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('moves focus into the dialog on open', () => {
    render(
      <Modal open onClose={() => {}} title="Focus me">
        <p>body</p>
      </Modal>,
    )
    expect(document.activeElement).toBe(screen.getByRole('dialog'))
  })

  it('traps Tab within the dialog (wraps from last to first)', () => {
    render(
      <Modal open onClose={() => {}} title="Trap">
        <button type="button">first</button>
        <button type="button">last</button>
      </Modal>,
    )
    // The close button (X) is the first focusable; our two buttons follow.
    const last = screen.getByRole('button', { name: 'last' })
    last.focus()
    expect(document.activeElement).toBe(last)
    const evt = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true })
    window.dispatchEvent(evt)
    // Focus wraps to the first focusable (the Close button), not out of the modal.
    expect(screen.getByRole('dialog').contains(document.activeElement)).toBe(true)
  })

  it('registers in the open-modal guard while open, releases on close/unmount', () => {
    const body = <p>body</p>
    const { rerender, unmount } = render(
      <Modal open onClose={() => {}} title="Guard">
        {body}
      </Modal>,
    )
    expect(isAnyModalOpen()).toBe(true)
    rerender(
      <Modal open={false} onClose={() => {}} title="Guard">
        {body}
      </Modal>,
    )
    expect(isAnyModalOpen()).toBe(false)
    rerender(
      <Modal open onClose={() => {}} title="Guard">
        {body}
      </Modal>,
    )
    expect(isAnyModalOpen()).toBe(true)
    unmount()
    expect(isAnyModalOpen()).toBe(false)
  })

  it('closes on Escape', () => {
    let closed = false
    render(
      <Modal
        open
        onClose={() => {
          closed = true
        }}
        title="Esc"
      >
        <p>body</p>
      </Modal>,
    )
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(closed).toBe(true)
  })
})
