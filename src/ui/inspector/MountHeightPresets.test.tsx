// @vitest-environment happy-dom
/** A11Y-FINISH-INSPECTOR: the one-tap mount-height chip row must expose its
 *  active preset via aria-pressed (not just the `.chip.on` visual) and group
 *  the chips under an accessible name. */
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { MountHeightPresets } from './MountHeightPresets'

describe('MountHeightPresets', () => {
  it('groups the chips under "Standard heights" and marks the active one pressed', () => {
    render(<MountHeightPresets defId="wall-art" value={1.45} min={0} max={2} onPick={() => {}} />)
    const group = screen.getByRole('group', { name: 'Standard heights' })
    expect(group).toBeInTheDocument()
    const active = screen.getByRole('button', { pressed: true })
    expect(active).toHaveTextContent(/1\.45/)
  })
})
