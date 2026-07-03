// @vitest-environment happy-dom
import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { resolveFlags, setResolvedFlags } from '../../../features/featureFlags'
import { useStore } from '../../../state/store'
import { shortcutLabel } from '../shortcuts'
import { ArrangeMenu } from './ArrangeMenu'

describe('P24 ArrangeMenu shortcut chips', () => {
  beforeEach(() => {
    useStore.getState().__resetForTest()
    setResolvedFlags(resolveFlags(true))
  })
  afterEach(() => {
    setResolvedFlags(resolveFlags(true))
  })

  it('renders Tidy home shortcut as a right-aligned .mi-kbd chip', () => {
    render(<ArrangeMenu />)
    fireEvent.click(screen.getByRole('button', { name: 'Arrange' }))
    const chip = document.body.querySelector('.mi-kbd')
    expect(chip?.textContent).toBe(shortcutLabel('tidyHome'))
    expect(screen.queryByText(/Tidy home\s*\(/)).toBeNull()
  })
})
