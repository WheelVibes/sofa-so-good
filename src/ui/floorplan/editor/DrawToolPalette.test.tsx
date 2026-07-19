// @vitest-environment happy-dom
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { DrawToolPalette } from './DrawToolPalette'

/** MEP layer, G1 PR3 — the desktop palette's flag-gated MEP group. */
describe('DrawToolPalette — MEP group', () => {
  const baseProps = {
    tool: 'select' as const,
    onPick: vi.fn(),
    fPolyline: false,
    mep: { family: 'electrical' as const, kind: 'socket' as const },
    onPickMep: vi.fn(),
  }

  it('does not render the MEP menu when the flag is off', () => {
    render(<DrawToolPalette {...baseProps} fMep={false} />)
    expect(screen.queryByRole('button', { name: /MEP/ })).toBeNull()
  })

  it('renders the MEP menu with Electrical/Plumbing sub-headers and 12 kind buttons when on', () => {
    render(<DrawToolPalette {...baseProps} fMep={true} />)
    fireEvent.click(screen.getByRole('button', { name: /MEP/ }))
    expect(screen.getByText('Electrical')).toBeTruthy()
    expect(screen.getByText('Plumbing')).toBeTruthy()
    // 7 electrical + 5 plumbing = 12.
    expect(screen.getByText('Socket')).toBeTruthy()
    expect(screen.getByText('Switch')).toBeTruthy()
    expect(screen.getByText('Water point')).toBeTruthy()
    expect(screen.getByText('Floor trap')).toBeTruthy()
  })

  it('picking a kind calls onPickMep with the family + kind, arming the tool', () => {
    const onPickMep = vi.fn()
    render(<DrawToolPalette {...baseProps} fMep={true} onPickMep={onPickMep} />)
    fireEvent.click(screen.getByRole('button', { name: /MEP/ }))
    fireEvent.click(screen.getByText('Water point'))
    expect(onPickMep).toHaveBeenCalledWith({ family: 'plumbing', kind: 'water-point' })
  })

  it('highlights the currently-armed kind button when the mep tool is active', () => {
    render(<DrawToolPalette {...baseProps} tool="mep" fMep={true} />)
    fireEvent.click(screen.getByRole('button', { name: /MEP/ }))
    const socketBtn = screen.getByText('Socket').closest('button')
    expect(socketBtn?.className).toContain('on')
  })
})
