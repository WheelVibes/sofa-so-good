// @vitest-environment happy-dom
import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { resolveFlags, setResolvedFlags } from '../../../features/featureFlags'
import { useStore } from '../../../state/store'
import { shortcutLabel } from '../shortcuts'
import { ViewMenu } from './ViewMenu'

describe('P24 ViewMenu shortcut chips', () => {
  beforeEach(() => {
    useStore.getState().__resetForTest()
    setResolvedFlags(resolveFlags(true))
  })
  afterEach(() => {
    setResolvedFlags(resolveFlags(true))
  })

  it('renders Top view and Reset view shortcuts as right-aligned .mi-kbd chips', () => {
    render(<ViewMenu />)
    fireEvent.click(screen.getByRole('button', { name: 'View' }))
    const chips = Array.from(document.body.querySelectorAll('.mi-kbd')).map((c) => c.textContent)
    expect(chips).toContain(shortcutLabel('topView'))
    expect(chips).toContain(shortcutLabel('resetView'))
    expect(screen.queryByText(/Top view\s*\(/)).toBeNull()
    expect(screen.queryByText(/Reset view\s*\(/)).toBeNull()
  })
})
