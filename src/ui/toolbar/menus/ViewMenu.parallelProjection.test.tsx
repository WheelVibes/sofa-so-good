// @vitest-environment happy-dom
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { useStore } from '../../../state/store'
import { ViewMenu } from './ViewMenu'

/**
 * R3-FEAT-3: the "Parallel projection" (orthographic dollhouse) framing toggle
 * is gated by the `parallelProjection` pro-tier flag — present in Pro mode,
 * hidden in Simple mode where the camera menu keeps only the core view loop.
 */
describe('ViewMenu parallel-projection toggle (parallelProjection, R3-FEAT-3)', () => {
  beforeEach(() => {
    useStore.getState().__resetForTest()
  })

  it('shows the Parallel projection item in Pro mode', () => {
    useStore.getState().setUiMode('pro')
    render(<ViewMenu />)
    fireEvent.click(screen.getByRole('button', { name: 'View' }))
    expect(screen.getByText('Parallel projection')).toBeInTheDocument()
  })

  it('hides the Parallel projection item in Simple mode', () => {
    useStore.getState().setUiMode('simple')
    render(<ViewMenu />)
    fireEvent.click(screen.getByRole('button', { name: 'View' }))
    expect(screen.queryByText('Parallel projection')).not.toBeInTheDocument()
  })

  it('toggles the store value on click', () => {
    useStore.getState().setUiMode('pro')
    render(<ViewMenu />)
    fireEvent.click(screen.getByRole('button', { name: 'View' }))
    expect(useStore.getState().parallelProjection).toBe(false)
    fireEvent.click(screen.getByText('Parallel projection'))
    expect(useStore.getState().parallelProjection).toBe(true)
  })
})
