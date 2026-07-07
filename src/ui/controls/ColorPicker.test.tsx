// @vitest-environment happy-dom
import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useStore } from '../../state/store'
import { ColorPicker } from './ColorPicker'

afterEach(() => {
  useStore.getState().__resetForTest?.()
})

/** Controlled harness: mirrors real usage where `onChange` feeds back into the
 *  `value` prop (via the store → finish → picker), so `close()` can compare the
 *  current colour against the one the editor opened on. */
function Controlled({ initial }: { initial: string }) {
  const [v, setV] = useState(initial)
  return <ColorPicker value={v} onChange={setV} ariaLabel="Tint" />
}

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

  // A11Y-FINISH-INSPECTOR: the SV pad + hue bar are `role="slider"` and
  // keyboard-focusable, but had no keydown handler at all — a keyboard/screen-
  // reader user could tab to them but never change the colour (WCAG 2.1.1).
  it('the saturation/brightness pad is keyboard-operable (arrow keys change the colour)', () => {
    const onChange = vi.fn()
    render(<ColorPicker value="#808080" onChange={onChange} ariaLabel="Tint" />)
    fireEvent.click(screen.getByRole('button', { name: 'Tint' }))
    const pad = screen.getByLabelText('Saturation and brightness')
    fireEvent.keyDown(pad, { key: 'ArrowRight' })
    expect(onChange).toHaveBeenCalled()
    const first = onChange.mock.calls[0][0] as string
    expect(first).not.toBe('#808080')
    onChange.mockClear()
    fireEvent.keyDown(pad, { key: 'ArrowUp' })
    expect(onChange).toHaveBeenCalled()
  })

  it('the hue bar is keyboard-operable (arrow keys step the hue)', () => {
    const onChange = vi.fn()
    render(<ColorPicker value="#ff0000" onChange={onChange} ariaLabel="Tint" />)
    fireEvent.click(screen.getByRole('button', { name: 'Tint' }))
    const hue = screen.getByLabelText('Hue')
    fireEvent.keyDown(hue, { key: 'ArrowRight' })
    expect(onChange).toHaveBeenCalled()
    expect(onChange.mock.calls[0][0]).not.toBe('#ff0000')
  })

  it('opening then closing an untouched editor does NOT push to recents', () => {
    render(<Controlled initial="#ff0000" />)
    const trigger = screen.getByRole('button', { name: 'Tint' })
    fireEvent.click(trigger) // open
    fireEvent.click(trigger) // close, unchanged
    expect(useStore.getState().recentColors).toEqual([])
  })

  it('closing after changing the colour commits the FINAL colour to recents', () => {
    render(<Controlled initial="#ff0000" />)
    const trigger = screen.getByRole('button', { name: 'Tint' })
    fireEvent.click(trigger) // open
    const hex = screen.getByLabelText('Hex colour') as HTMLInputElement
    fireEvent.change(hex, { target: { value: '#00ff00' } })
    fireEvent.click(trigger) // close
    expect(useStore.getState().recentColors).toEqual(['#00ff00'])
  })

  it('a recent-colour swatch exposes aria-pressed for the active colour', () => {
    useStore.getState().pushRecentColor('#123456')
    render(<ColorPicker value="#123456" onChange={() => {}} ariaLabel="Tint" />)
    fireEvent.click(screen.getByRole('button', { name: 'Tint' }))
    const swatch = screen.getByRole('button', { name: 'Recent colour #123456' })
    expect(swatch).toHaveAttribute('aria-pressed', 'true')
  })
})
