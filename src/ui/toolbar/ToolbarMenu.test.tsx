// @vitest-environment happy-dom
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { MenuItem, ToolbarMenu } from './ToolbarMenu'

describe('ToolbarMenu', () => {
  it('toggles the panel on trigger click', () => {
    render(
      <ToolbarMenu icon="Sets" label="Arrange">
        <MenuItem icon="Sets" label="Sets" onClick={() => {}} />
      </ToolbarMenu>,
    )
    expect(screen.queryByRole('menuitem')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /arrange/i }))
    expect(screen.getByRole('menuitem')).toBeTruthy()
  })

  it('closes after a menu item is chosen', () => {
    let chosen = false
    render(
      <ToolbarMenu icon="Sets" label="Arrange">
        <MenuItem
          icon="Sets"
          label="Sets"
          onClick={() => {
            chosen = true
          }}
        />
      </ToolbarMenu>,
    )
    fireEvent.click(screen.getByRole('button', { name: /arrange/i }))
    fireEvent.click(screen.getByRole('menuitem'))
    expect(chosen).toBe(true)
    expect(screen.queryByRole('menuitem')).toBeNull()
  })

  // A11Y: the panel is portaled to document.body (Popover uses createPortal),
  // so it sits outside the trigger's natural tab order — without moving focus
  // in on open, a keyboard user who opens the menu with Enter/Space has no way
  // to reach its rows at all.
  it('moves focus onto the first row when the menu opens', () => {
    render(
      <ToolbarMenu icon="Sets" label="Arrange">
        <MenuItem icon="Sets" label="First" onClick={() => {}} />
        <MenuItem icon="Sets" label="Second" onClick={() => {}} />
      </ToolbarMenu>,
    )
    fireEvent.click(screen.getByRole('button', { name: /arrange/i }))
    expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: 'First' }))
  })

  it('traps Tab within the open panel (wraps from last row back to first)', () => {
    render(
      <ToolbarMenu icon="Sets" label="Arrange">
        <MenuItem icon="Sets" label="First" onClick={() => {}} />
        <MenuItem icon="Sets" label="Second" onClick={() => {}} />
      </ToolbarMenu>,
    )
    fireEvent.click(screen.getByRole('button', { name: /arrange/i }))
    const last = screen.getByRole('menuitem', { name: 'Second' })
    last.focus()
    expect(document.activeElement).toBe(last)
    fireEvent.keyDown(document.querySelector('[role="menu"]') as HTMLElement, {
      key: 'Tab',
    })
    expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: 'First' }))
  })

  it('Escape closes the menu and returns focus to the trigger', () => {
    render(
      <ToolbarMenu icon="Sets" label="Arrange">
        <MenuItem icon="Sets" label="First" onClick={() => {}} />
      </ToolbarMenu>,
    )
    const trigger = screen.getByRole('button', { name: /arrange/i })
    fireEvent.click(trigger)
    expect(screen.getByRole('menu')).toBeInTheDocument()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('menu')).toBeNull()
    expect(document.activeElement).toBe(trigger)
  })
})
