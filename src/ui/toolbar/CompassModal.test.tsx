import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { useStore } from '../../state/store'
import { CompassModal } from './CompassModal'

/** UX-004: the sun-direction dial is on the shared Modal (dialog role + focus
 *  management) and the dial is a keyboard-operable slider. */
describe('CompassModal accessibility (UX-004)', () => {
  beforeEach(() => useStore.getState().__resetForTest())

  it('renders as a dialog with a slider dial', () => {
    render(<CompassModal open onClose={() => {}} />)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    const slider = screen.getByRole('slider')
    expect(slider).toBeInTheDocument()
    expect(slider).toHaveAttribute('aria-valuemin', '0')
    expect(slider).toHaveAttribute('aria-valuemax', '359')
  })

  it('arrow keys nudge the sun heading (±5°, ±15° with Shift)', () => {
    useStore.getState().setOrientationDeg(0)
    render(<CompassModal open onClose={() => {}} />)
    const slider = screen.getByRole('slider')

    fireEvent.keyDown(slider, { key: 'ArrowRight' })
    expect(Math.round(useStore.getState().orientationDeg)).toBe(5)

    fireEvent.keyDown(slider, { key: 'ArrowRight', shiftKey: true })
    expect(Math.round(useStore.getState().orientationDeg)).toBe(20)

    fireEvent.keyDown(slider, { key: 'ArrowLeft' })
    expect(Math.round(useStore.getState().orientationDeg)).toBe(15)
  })

  it('Home resets the heading to 0° (north)', () => {
    useStore.getState().setOrientationDeg(120)
    render(<CompassModal open onClose={() => {}} />)
    fireEvent.keyDown(screen.getByRole('slider'), { key: 'Home' })
    expect(Math.round(useStore.getState().orientationDeg)).toBe(0)
  })

  it('does not render when closed', () => {
    render(<CompassModal open={false} onClose={() => {}} />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('non-arrow keys are ignored (no heading change)', () => {
    useStore.getState().setOrientationDeg(42)
    render(<CompassModal open onClose={() => {}} />)
    fireEvent.keyDown(screen.getByRole('slider'), { key: 'a' })
    expect(Math.round(useStore.getState().orientationDeg)).toBe(42)
  })
})
