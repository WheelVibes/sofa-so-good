import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { KbdChip } from './KbdChip'

describe('KbdChip', () => {
  it('renders a <kbd class="mi-kbd"> with the combo label', () => {
    render(<KbdChip>⌘K</KbdChip>)
    const chip = screen.getByText('⌘K')
    expect(chip.tagName).toBe('KBD')
    expect(chip).toHaveClass('mi-kbd')
  })
})
