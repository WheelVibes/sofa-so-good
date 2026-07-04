// @vitest-environment happy-dom
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { useStore } from '../../../state/store'
import { ViewSection } from './ViewSection'

/**
 * FEAT-D: mobile parity for the "Vertical lock" (two-point-perspective)
 * framing toggle — same `twoPointPerspective` pro-tier gate as the desktop
 * View menu (present in Pro, hidden in Simple).
 */
describe('ViewSection (mobile) vertical lock toggle (twoPointPerspective, FEAT-D)', () => {
  beforeEach(() => {
    useStore.getState().__resetForTest()
  })

  const renderSection = () =>
    render(<ViewSection activeId="view" act={(fn) => () => fn()} vrSupported={false} />)

  it('shows the Vertical lock item in Pro mode', () => {
    useStore.getState().setUiMode('pro')
    renderSection()
    expect(screen.getByText('Vertical lock')).toBeInTheDocument()
  })

  it('hides the Vertical lock item in Simple mode', () => {
    useStore.getState().setUiMode('simple')
    renderSection()
    expect(screen.queryByText('Vertical lock')).not.toBeInTheDocument()
  })

  it('toggles the store value on click', () => {
    useStore.getState().setUiMode('pro')
    renderSection()
    expect(useStore.getState().verticalLock).toBe(false)
    fireEvent.click(screen.getByText('Vertical lock'))
    expect(useStore.getState().verticalLock).toBe(true)
  })
})
