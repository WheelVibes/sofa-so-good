import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { SliderField } from './SliderField'

describe('SliderField', () => {
  it('renders the label and a .slider range input', () => {
    render(<SliderField label="Field of view" value={50} min={0} max={100} onChange={vi.fn()} />)
    expect(screen.getByText('Field of view')).toBeInTheDocument()
    const input = screen.getByRole('slider', { name: 'Field of view' })
    expect(input).toHaveClass('slider')
    expect(input).toHaveAttribute('type', 'range')
  })

  it('calls onChange with the numeric value when moved', () => {
    const onChange = vi.fn()
    render(<SliderField label="Field of view" value={50} min={0} max={100} onChange={onChange} />)
    const input = screen.getByRole('slider', { name: 'Field of view' })
    fireEvent.change(input, { target: { value: '75' } })
    expect(onChange).toHaveBeenCalledWith(75)
  })

  it('shows a readout reflecting value, honouring format', () => {
    render(
      <SliderField
        label="Field of view"
        value={62}
        min={0}
        max={100}
        onChange={vi.fn()}
        format={(v) => `${v}°`}
      />,
    )
    expect(screen.getByText('62°')).toBeInTheDocument()
  })

  it('defaults the readout to String(value) with no format', () => {
    render(<SliderField label="Eye height" value={1.6} min={0} max={2} onChange={vi.fn()} />)
    expect(screen.getByText('1.6')).toBeInTheDocument()
  })

  it('uses ariaLabel over label for the input accessible name when given', () => {
    render(
      <SliderField
        label="Field of view"
        ariaLabel="Field of view (degrees)"
        value={50}
        min={0}
        max={100}
        onChange={vi.fn()}
      />,
    )
    expect(screen.getByText('Field of view')).toBeInTheDocument()
    expect(screen.getByRole('slider', { name: 'Field of view (degrees)' })).toBeInTheDocument()
  })

  it('hides the inline readout when hideReadout is set', () => {
    render(
      <SliderField
        label="Time of day"
        value={12}
        min={0}
        max={24}
        onChange={vi.fn()}
        hideReadout
      />,
    )
    expect(screen.queryByText('12')).not.toBeInTheDocument()
  })

  it('disables the input when disabled', () => {
    render(
      <SliderField
        label="Field of view"
        value={50}
        min={0}
        max={100}
        onChange={vi.fn()}
        disabled
      />,
    )
    expect(screen.getByRole('slider', { name: 'Field of view' })).toBeDisabled()
  })
})
