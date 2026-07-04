// @vitest-environment happy-dom
import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { isAnyModalOpen, resetModalGuardForTests } from '../../controls/modalGuard'
import { ConfirmDialog } from './ConfirmDialog'

describe('ConfirmDialog accessibility', () => {
  it('exposes a labelled alertdialog role when open', () => {
    render(
      <ConfirmDialog
        open
        title="Delete this file?"
        message="This can't be undone."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    )
    const dialog = screen.getByRole('alertdialog')
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog).toHaveAttribute('aria-label', 'Delete this file?')
  })

  it('focuses the cancel button (the safe default) on open', () => {
    render(
      <ConfirmDialog
        open
        title="T"
        message="m"
        confirmLabel="OK"
        cancelLabel="Cancel"
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    )
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Cancel' }))
  })

  it('restores focus to the previously-focused element on close', () => {
    resetModalGuardForTests()
    function Harness() {
      const [open, setOpen] = useState(false)
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            open
          </button>
          <ConfirmDialog
            open={open}
            title="T"
            message="m"
            confirmLabel="OK"
            cancelLabel="Cancel"
            onConfirm={() => setOpen(false)}
            onCancel={() => setOpen(false)}
          />
        </>
      )
    }
    render(<Harness />)
    const trigger = screen.getByRole('button', { name: 'open' })
    trigger.focus()
    fireEvent.click(trigger)
    expect(screen.getByRole('alertdialog')).toBeInTheDocument()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(document.activeElement).toBe(trigger)
  })

  it('traps Tab within the dialog (wraps from last button back to first)', () => {
    render(
      <ConfirmDialog
        open
        title="T"
        message="m"
        confirmLabel="Delete"
        cancelLabel="Cancel"
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    )
    const cancel = screen.getByRole('button', { name: 'Cancel' })
    const confirm = screen.getByRole('button', { name: 'Delete' })
    confirm.focus()
    expect(document.activeElement).toBe(confirm)
    fireEvent.keyDown(window, { key: 'Tab' })
    expect(document.activeElement).toBe(cancel)
  })

  it('Enter confirms, Escape cancels', () => {
    const onConfirm = vi.fn()
    const onCancel = vi.fn()
    render(
      <ConfirmDialog
        open
        title="T"
        message="m"
        confirmLabel="OK"
        cancelLabel="Cancel"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    )
    fireEvent.keyDown(window, { key: 'Enter' })
    expect(onConfirm).toHaveBeenCalledTimes(1)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('registers in the open-modal guard while open', () => {
    resetModalGuardForTests()
    const { rerender } = render(
      <ConfirmDialog
        open
        title="T"
        message="m"
        confirmLabel="OK"
        cancelLabel="Cancel"
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    )
    expect(isAnyModalOpen()).toBe(true)
    rerender(
      <ConfirmDialog
        open={false}
        title="T"
        message="m"
        confirmLabel="OK"
        cancelLabel="Cancel"
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    )
    expect(isAnyModalOpen()).toBe(false)
  })
})
