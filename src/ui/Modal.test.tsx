import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Modal } from './Modal'

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
})
