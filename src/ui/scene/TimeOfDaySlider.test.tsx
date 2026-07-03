// @vitest-environment happy-dom
/**
 * Regression test for a design regression found in review: the SliderField
 * adoption of TimeOfDaySlider (v0.10.0.41) dropped the `.scene-row-head`
 * section-header treatment the "Time of day" row shared with every other
 * SceneMenu section (e.g. "Lights"), replacing it with the plain `.fld .lbl`
 * body-label rung. This asserts the header row is back, alongside the
 * SliderField control it wraps, with no duplicate readout.
 */
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { useStore } from '../../state/store'
import { TimeOfDaySlider } from './TimeOfDaySlider'

beforeEach(() => {
  useStore.getState().__resetForTest?.()
})

describe('TimeOfDaySlider', () => {
  it('renders a scene-row-head header with the label and a clock readout', () => {
    const { container } = render(<TimeOfDaySlider />)
    const head = container.querySelector('.scene-row-head')
    expect(head).toBeInTheDocument()
    expect(head).toHaveTextContent('Time of day')
    expect(head?.querySelector('.scene-clock')).toBeInTheDocument()
  })

  it('renders exactly one time-of-day slider input, with no duplicate readout', () => {
    render(<TimeOfDaySlider />)
    expect(screen.getByRole('slider', { name: 'Time of day' })).toBeInTheDocument()
    // The header clock is the only readout — SliderField's inline .val is suppressed.
    const container = screen.getByRole('slider', { name: 'Time of day' }).closest('.fld')
    expect(container?.querySelector('.val')).not.toBeInTheDocument()
  })
})
