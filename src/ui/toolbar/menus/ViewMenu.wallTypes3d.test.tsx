// @vitest-environment happy-dom
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { useStore } from '../../../state/store'
import { ViewMenu } from './ViewMenu'

/**
 * Wall-types 3D overlay toggle — gated by the `wallTypes3d` pro-tier flag,
 * shown only in the orbit camera (whole-flat overview AND the room editor,
 * since neither `roomEditorActive` nor `overview` gates this entry).
 */
describe('ViewMenu wall-types toggle (wallTypes3d)', () => {
  beforeEach(() => {
    useStore.getState().__resetForTest()
  })

  it('shows the Wall types item in Pro mode', () => {
    useStore.getState().setUiMode('pro')
    render(<ViewMenu />)
    fireEvent.click(screen.getByRole('button', { name: 'View' }))
    expect(screen.getByText('Wall types')).toBeInTheDocument()
  })

  it('hides the Wall types item in Simple mode', () => {
    useStore.getState().setUiMode('simple')
    render(<ViewMenu />)
    fireEvent.click(screen.getByRole('button', { name: 'View' }))
    expect(screen.queryByText('Wall types')).not.toBeInTheDocument()
  })

  it('toggles the store value on click', () => {
    useStore.getState().setUiMode('pro')
    render(<ViewMenu />)
    fireEvent.click(screen.getByRole('button', { name: 'View' }))
    expect(useStore.getState().showWallTypes).toBe(false)
    fireEvent.click(screen.getByText('Wall types'))
    expect(useStore.getState().showWallTypes).toBe(true)
  })

  it('stays visible inside the room editor (not gated by `overview`)', () => {
    useStore.getState().setUiMode('pro')
    useStore.setState({ roomEditor: { active: true, roomId: 'kitchen' } } as never)
    render(<ViewMenu />)
    fireEvent.click(screen.getByRole('button', { name: 'View' }))
    expect(screen.getByText('Wall types')).toBeInTheDocument()
  })
})
