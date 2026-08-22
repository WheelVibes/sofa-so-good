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

/**
 * UIUX-75: the three always-visible tools are toggle buttons, so `aria-pressed`
 * must track the same condition as the visual `.on` class. It didn't — Select
 * rendered lit for the 'scale' tool while reporting aria-pressed=false, and Wall
 * and Split exposed no pressed state at all.
 */
describe('DrawToolPalette — pressed state', () => {
  const props = {
    onPick: vi.fn(),
    fPolyline: false,
    fMep: false,
    mep: { family: 'electrical' as const, kind: 'socket' as const },
    onPickMep: vi.fn(),
  }

  const cluster = () => document.querySelectorAll<HTMLButtonElement>('.seg.accent button')

  it('exposes aria-pressed on every tool button, matching the .on class', () => {
    for (const tool of ['select', 'wall', 'split', 'scale', 'door'] as const) {
      const { unmount } = render(<DrawToolPalette {...props} tool={tool} />)
      const btns = [...cluster()]
      expect(btns.length, tool).toBe(3)
      for (const b of btns) {
        // Both signals present, and always in agreement.
        expect(b.getAttribute('aria-pressed'), `${tool}/${b.textContent}`).not.toBeNull()
        expect(b.getAttribute('aria-pressed') === 'true', `${tool}/${b.textContent}`).toBe(
          b.classList.contains('on'),
        )
      }
      unmount()
    }
  })

  it("reports Select as pressed while the 'scale' tool is active", () => {
    render(<DrawToolPalette {...props} tool="scale" />)
    const select = screen.getByRole('button', { name: 'Select' })
    expect(select.getAttribute('aria-pressed')).toBe('true')
    expect(select.classList.contains('on')).toBe(true)
  })

  it('reports nothing pressed while a dropdown tool is active', () => {
    render(<DrawToolPalette {...props} tool="door" />)
    for (const b of cluster()) expect(b.getAttribute('aria-pressed')).toBe('false')
  })
})
