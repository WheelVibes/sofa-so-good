import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useStore } from '../state/store'
import { HqRenderModal } from './HqRenderModal'

/**
 * PC2-CAM-DOF-LENS: the lens/DoF controls are gated by the `cameraDof` pro-tier
 * flag. They must render in Pro mode and be absent in Simple mode (where the
 * lone f-stop fallback dropdown shows instead).
 */
describe('HqRenderModal lens + DoF controls (cameraDof)', () => {
  beforeEach(() => {
    useStore.getState().__resetForTest()
    useStore.getState().setHqRenderOpen(true)
  })
  afterEach(() => {
    useStore.getState().setHqRenderOpen(false)
  })

  it('shows the lens + aperture controls in Pro mode', () => {
    useStore.getState().setUiMode('pro')
    render(<HqRenderModal />)
    expect(screen.getByLabelText('Lens focal length')).toBeInTheDocument()
    expect(screen.getByLabelText('Aperture (f-stop)')).toBeInTheDocument()
    // The simple-fallback combined dropdown is not present in Pro.
    expect(screen.queryByLabelText('Depth of field')).not.toBeInTheDocument()
  })

  it('hides the lens controls in Simple mode (shows the fallback dropdown)', () => {
    useStore.getState().setUiMode('simple')
    render(<HqRenderModal />)
    expect(screen.queryByLabelText('Lens focal length')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Aperture (f-stop)')).not.toBeInTheDocument()
    // The fallback combined DoF dropdown is the Simple-mode control.
    expect(screen.getByLabelText('Depth of field')).toBeInTheDocument()
  })
})
