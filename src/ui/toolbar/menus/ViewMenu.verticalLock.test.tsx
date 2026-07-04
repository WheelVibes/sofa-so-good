// @vitest-environment happy-dom
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { useStore } from '../../../state/store'
import { ViewMenu } from './ViewMenu'

/**
 * FEAT-D: the "Vertical lock" (two-point-perspective) framing toggle is
 * gated by the `twoPointPerspective` pro-tier flag — present in Pro mode,
 * hidden in Simple mode where the camera menu keeps only the core view loop.
 */
describe('ViewMenu vertical lock toggle (twoPointPerspective, FEAT-D)', () => {
  beforeEach(() => {
    useStore.getState().__resetForTest()
  })

  it('shows the Vertical lock item in Pro mode', () => {
    useStore.getState().setUiMode('pro')
    render(<ViewMenu />)
    fireEvent.click(screen.getByRole('button', { name: 'View' }))
    expect(screen.getByText('Vertical lock')).toBeInTheDocument()
  })

  it('hides the Vertical lock item in Simple mode', () => {
    useStore.getState().setUiMode('simple')
    render(<ViewMenu />)
    fireEvent.click(screen.getByRole('button', { name: 'View' }))
    expect(screen.queryByText('Vertical lock')).not.toBeInTheDocument()
  })

  it('toggles the store value on click', () => {
    useStore.getState().setUiMode('pro')
    render(<ViewMenu />)
    fireEvent.click(screen.getByRole('button', { name: 'View' }))
    expect(useStore.getState().verticalLock).toBe(false)
    fireEvent.click(screen.getByText('Vertical lock'))
    expect(useStore.getState().verticalLock).toBe(true)
  })
})
