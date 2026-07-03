// @vitest-environment happy-dom
import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { resolveFlags, setResolvedFlags } from '../../../features/featureFlags'
import { useStore } from '../../../state/store'
import { shortcutLabel } from '../shortcuts'
import { EditMenu } from './EditMenu'

describe('P24 menu shortcut chips', () => {
  beforeEach(() => {
    useStore.getState().__resetForTest()
    setResolvedFlags(resolveFlags(true))
  })
  afterEach(() => {
    setResolvedFlags(resolveFlags(true))
  })

  it('renders the floor-plan-editor shortcut as a right-aligned .mi-kbd chip', () => {
    render(<EditMenu />)
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    const chip = document.body.querySelector('.mi-kbd')
    expect(chip?.textContent).toBe(shortcutLabel('togglePlanEditor'))
    expect(screen.queryByText(/Floor plan editor\s*\(/)).toBeNull()
  })
})
