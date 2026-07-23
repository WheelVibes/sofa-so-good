// @vitest-environment happy-dom
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { useStore } from '../../../state/store'
import { ViewSection } from './ViewSection'

/** Mobile parity for the desktop `ViewMenu` wall-types toggle (wallTypes3d flag). */
describe('mobile ViewSection wall-types toggle (wallTypes3d)', () => {
  beforeEach(() => {
    useStore.getState().__resetForTest()
  })

  const noop = () => () => {}

  it('shows the Wall types item in Pro mode', () => {
    useStore.getState().setUiMode('pro')
    render(<ViewSection activeId="view" act={noop} vrSupported={false} />)
    expect(screen.getByText('Wall types')).toBeInTheDocument()
  })

  it('hides the Wall types item in Simple mode', () => {
    useStore.getState().setUiMode('simple')
    render(<ViewSection activeId="view" act={noop} vrSupported={false} />)
    expect(screen.queryByText('Wall types')).not.toBeInTheDocument()
  })

  it('toggles the store value on click', () => {
    useStore.getState().setUiMode('pro')
    const act = (fn: () => void) => () => fn()
    render(<ViewSection activeId="view" act={act} vrSupported={false} />)
    expect(useStore.getState().showWallTypes).toBe(false)
    fireEvent.click(screen.getByText('Wall types'))
    expect(useStore.getState().showWallTypes).toBe(true)
  })
})
