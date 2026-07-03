// @vitest-environment happy-dom
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ColorPicker } from './ColorPicker'

describe('ColorPicker', () => {
  it('renders a swatch trigger tinted with the current colour', () => {
    render(<ColorPicker value="#ff0000" onChange={() => {}} ariaLabel="Tint" />)
    const trigger = screen.getByRole('button', { name: 'Tint' })
    expect(trigger).toBeInTheDocument()
    expect(trigger.style.backgroundColor).toBeTruthy()
  })

  it('opens the editor and commits a valid hex typed into the field', () => {
    const onChange = vi.fn()
    render(<ColorPicker value="#ff0000" onChange={onChange} ariaLabel="Tint" />)
    fireEvent.click(screen.getByRole('button', { name: 'Tint' }))
    const hex = screen.getByLabelText('Hex colour') as HTMLInputElement
    fireEvent.change(hex, { target: { value: '#00ff00' } })
    expect(onChange).toHaveBeenCalledWith('#00ff00')
  })

  it('ignores an invalid hex while typing', () => {
    const onChange = vi.fn()
    render(<ColorPicker value="#ff0000" onChange={onChange} ariaLabel="Tint" />)
    fireEvent.click(screen.getByRole('button', { name: 'Tint' }))
    const hex = screen.getByLabelText('Hex colour') as HTMLInputElement
    fireEvent.change(hex, { target: { value: '#zz' } })
    expect(onChange).not.toHaveBeenCalled()
  })

  it('exposes a hue + saturation/brightness control', () => {
    render(<ColorPicker value="#3b82f6" onChange={() => {}} ariaLabel="Tint" />)
    fireEvent.click(screen.getByRole('button', { name: 'Tint' }))
    expect(screen.getByLabelText('Hue')).toBeInTheDocument()
    expect(screen.getByLabelText('Saturation and brightness')).toBeInTheDocument()
  })
})
