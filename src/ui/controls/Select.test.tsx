import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Select, type SelectOption } from './Select'

const OPTS: SelectOption[] = [
  { value: 'a', label: 'Apple' },
  { value: 'b', label: 'Banana' },
  { value: 'c', label: 'Cherry', disabled: true },
]

describe('Select', () => {
  it('shows the selected option label on the trigger', () => {
    render(<Select value="b" onChange={() => {}} options={OPTS} ariaLabel="Fruit" />)
    expect(screen.getByRole('combobox', { name: 'Fruit' })).toHaveTextContent('Banana')
  })

  it('opens the listbox and commits a clicked option', () => {
    const onChange = vi.fn()
    render(<Select value="a" onChange={onChange} options={OPTS} ariaLabel="Fruit" />)
    fireEvent.click(screen.getByRole('combobox', { name: 'Fruit' }))
    expect(screen.getByRole('listbox')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('option', { name: 'Banana' }))
    expect(onChange).toHaveBeenCalledWith('b')
  })

  it('marks the current value selected', () => {
    render(<Select value="a" onChange={() => {}} options={OPTS} ariaLabel="Fruit" />)
    fireEvent.click(screen.getByRole('combobox', { name: 'Fruit' }))
    expect(screen.getByRole('option', { name: 'Apple' })).toHaveAttribute('aria-selected', 'true')
  })

  it('does not commit a disabled option', () => {
    const onChange = vi.fn()
    render(<Select value="a" onChange={onChange} options={OPTS} ariaLabel="Fruit" />)
    fireEvent.click(screen.getByRole('combobox', { name: 'Fruit' }))
    fireEvent.click(screen.getByRole('option', { name: 'Cherry' }))
    expect(onChange).not.toHaveBeenCalled()
  })

  it('commits the active option on Enter via keyboard', () => {
    const onChange = vi.fn()
    render(<Select value="a" onChange={onChange} options={OPTS} ariaLabel="Fruit" />)
    const trigger = screen.getByRole('combobox', { name: 'Fruit' })
    fireEvent.keyDown(trigger, { key: 'ArrowDown' }) // open, active = current (a)
    fireEvent.keyDown(trigger, { key: 'ArrowDown' }) // → b
    fireEvent.keyDown(trigger, { key: 'Enter' })
    expect(onChange).toHaveBeenCalledWith('b')
  })
})
