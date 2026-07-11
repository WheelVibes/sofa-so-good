// @vitest-environment happy-dom
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Segmented } from './Segmented'

const OPTIONS = [
  { value: 'auto', label: 'Auto' },
  { value: 'on', label: 'On' },
  { value: 'off', label: 'Off' },
]

describe('Segmented', () => {
  it('renders every option as a radio with the selected one checked', () => {
    render(<Segmented ariaLabel="Lights" value="on" onChange={() => {}} options={OPTIONS} />)
    const group = screen.getByRole('radiogroup', { name: 'Lights' })
    expect(group).toBeInTheDocument()
    const radios = screen.getAllByRole('radio')
    expect(radios).toHaveLength(3)
    expect(screen.getByRole('radio', { name: 'On' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('radio', { name: 'Auto' })).toHaveAttribute('aria-checked', 'false')
    expect(screen.getByRole('radio', { name: 'On' })).toHaveClass('on')
  })

  it('clicking a segment commits its value', () => {
    const onChange = vi.fn()
    render(<Segmented ariaLabel="Lights" value="auto" onChange={onChange} options={OPTIONS} />)
    fireEvent.click(screen.getByRole('radio', { name: 'Off' }))
    expect(onChange).toHaveBeenCalledWith('off')
  })

  it('is one tab stop: only the selected segment is tabbable', () => {
    render(<Segmented ariaLabel="Lights" value="on" onChange={() => {}} options={OPTIONS} />)
    expect(screen.getByRole('radio', { name: 'On' })).toHaveAttribute('tabindex', '0')
    expect(screen.getByRole('radio', { name: 'Auto' })).toHaveAttribute('tabindex', '-1')
    expect(screen.getByRole('radio', { name: 'Off' })).toHaveAttribute('tabindex', '-1')
  })

  it('falls back to the first segment as the tab stop when value matches nothing', () => {
    render(<Segmented ariaLabel="Lights" value="nope" onChange={() => {}} options={OPTIONS} />)
    expect(screen.getByRole('radio', { name: 'Auto' })).toHaveAttribute('tabindex', '0')
  })

  it('arrow keys move and select, wrapping at the ends', () => {
    const onChange = vi.fn()
    render(<Segmented ariaLabel="Lights" value="off" onChange={onChange} options={OPTIONS} />)
    const group = screen.getByRole('radiogroup', { name: 'Lights' })
    fireEvent.keyDown(group, { key: 'ArrowRight' })
    expect(onChange).toHaveBeenLastCalledWith('auto') // wraps off → auto
    fireEvent.keyDown(group, { key: 'ArrowLeft' })
    expect(onChange).toHaveBeenLastCalledWith('on') // off → on
  })

  it('Home/End select the first/last enabled option', () => {
    const onChange = vi.fn()
    render(<Segmented ariaLabel="Lights" value="on" onChange={onChange} options={OPTIONS} />)
    const group = screen.getByRole('radiogroup', { name: 'Lights' })
    fireEvent.keyDown(group, { key: 'Home' })
    expect(onChange).toHaveBeenLastCalledWith('auto')
    fireEvent.keyDown(group, { key: 'End' })
    expect(onChange).toHaveBeenLastCalledWith('off')
  })

  it('skips disabled options on arrow navigation and blocks their clicks', () => {
    const onChange = vi.fn()
    const opts = [OPTIONS[0], { ...OPTIONS[1], disabled: true }, OPTIONS[2]]
    render(<Segmented ariaLabel="Lights" value="auto" onChange={onChange} options={opts} />)
    const group = screen.getByRole('radiogroup', { name: 'Lights' })
    fireEvent.keyDown(group, { key: 'ArrowRight' })
    expect(onChange).toHaveBeenLastCalledWith('off') // hops over disabled 'on'
    fireEvent.click(screen.getByRole('radio', { name: 'On' }))
    expect(onChange).not.toHaveBeenCalledWith('on')
  })

  it('does nothing when the whole control is disabled', () => {
    const onChange = vi.fn()
    render(
      <Segmented ariaLabel="Lights" value="auto" onChange={onChange} options={OPTIONS} disabled />,
    )
    fireEvent.click(screen.getByRole('radio', { name: 'Off' }))
    fireEvent.keyDown(screen.getByRole('radiogroup', { name: 'Lights' }), { key: 'ArrowRight' })
    expect(onChange).not.toHaveBeenCalled()
  })

  it('applies the token class variants', () => {
    render(
      <Segmented ariaLabel="Sizes" value="auto" onChange={() => {}} options={OPTIONS} accent fit />,
    )
    const group = screen.getByRole('radiogroup', { name: 'Sizes' })
    expect(group.className).toBe('seg accent fit')
  })
})
