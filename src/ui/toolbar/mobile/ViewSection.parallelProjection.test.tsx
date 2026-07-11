// @vitest-environment happy-dom
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { useStore } from '../../../state/store'
import { ViewSection } from './ViewSection'

/**
 * R3-FEAT-3: mobile parity for the "Parallel projection" (orthographic
 * dollhouse) framing toggle — same `parallelProjection` pro-tier gate as the
 * desktop View menu (present in Pro, hidden in Simple).
 */
describe('ViewSection (mobile) parallel-projection toggle (parallelProjection, R3-FEAT-3)', () => {
  beforeEach(() => {
    useStore.getState().__resetForTest()
  })

  const renderSection = () =>
    render(<ViewSection activeId="view" act={(fn) => () => fn()} vrSupported={false} />)

  it('shows the Parallel projection item in Pro mode', () => {
    useStore.getState().setUiMode('pro')
    renderSection()
    expect(screen.getByText('Parallel projection')).toBeInTheDocument()
  })

  it('hides the Parallel projection item in Simple mode', () => {
    useStore.getState().setUiMode('simple')
    renderSection()
    expect(screen.queryByText('Parallel projection')).not.toBeInTheDocument()
  })

  it('toggles the store value on click', () => {
    useStore.getState().setUiMode('pro')
    renderSection()
    expect(useStore.getState().parallelProjection).toBe(false)
    fireEvent.click(screen.getByText('Parallel projection'))
    expect(useStore.getState().parallelProjection).toBe(true)
  })
})
