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
})
