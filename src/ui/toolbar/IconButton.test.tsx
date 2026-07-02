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

  it('keeps the normal label + no title when enabled', () => {
    render(<IconButton icon="Undo" label="Undo" shortcut="Ctrl Z" />)
    const btn = screen.getByRole('button', { name: 'Undo' })
    expect(btn).not.toBeDisabled()
    expect(btn.getAttribute('title')).toBeNull()
  })
})
