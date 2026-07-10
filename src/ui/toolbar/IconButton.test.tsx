// @vitest-environment happy-dom
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { IconButton } from './IconButton'

describe('P33 disabled-with-reason', () => {
  it('disables the button and carries the reason on title when disabled', () => {
    render(<IconButton icon="Undo" label="Undo" disabled disabledReason="Nothing to undo" />)
    const btn = screen.getByRole('button', { name: /Undo/ })
    expect(btn).toBeDisabled()
    expect(btn.getAttribute('title')).toBe('Nothing to undo')
  })

  it('keeps the label mirrored onto title when enabled (touch has no hover tooltip — TB-7)', () => {
    render(<IconButton icon="Undo" label="Undo" shortcut="Ctrl Z" />)
    const btn = screen.getByRole('button', { name: 'Undo' })
    expect(btn).not.toBeDisabled()
    expect(btn.getAttribute('title')).toBe('Undo')
  })
})
