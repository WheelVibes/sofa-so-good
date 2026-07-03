// @vitest-environment happy-dom
/**
 * The mobile "TIME OF DAY" sheet section used to render the concept/value
 * twice: a `.scene-row-head` with the "Time of day" label + a right-aligned
 * `.scene-clock` readout, then a *second* "Time of day" row label on the
 * SliderField below it. This asserts the collapsed layout: the header keeps
 * just its "Time of day" label (no clock), and the slider row's own label is
 * the live formatted time — one line, one readout, shared by desktop and
 * mobile mounts alike.
 */
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { useStore } from '../../state/store'
import { TimeOfDaySlider } from './TimeOfDaySlider'

const CLOCK_RE = /^\d{1,2}:\d{2} (AM|PM)$/

beforeEach(() => {
  useStore.getState().__resetForTest?.()
})

describe('TimeOfDaySlider', () => {
  it('renders a scene-row-head header with just the section label, no clock', () => {
    const { container } = render(<TimeOfDaySlider />)
    const head = container.querySelector('.scene-row-head')
    expect(head).toBeInTheDocument()
    expect(head).toHaveTextContent('Time of day')
    expect(head?.querySelector('.scene-clock')).not.toBeInTheDocument()
    expect(head?.textContent?.trim()).toBe('Time of day')
  })

  it('renders the slider row label as the formatted time, not the words "Time of day"', () => {
    const { container } = render(<TimeOfDaySlider />)
    const lbl = container.querySelector('.fld .lbl')
    expect(lbl?.textContent).toMatch(CLOCK_RE)
    expect(lbl).not.toHaveTextContent('Time of day')
  })

  it('renders exactly one time-of-day slider input, with no duplicate readout', () => {
    render(<TimeOfDaySlider />)
    const slider = screen.getByRole('slider', { name: 'Time of day' })
    expect(slider).toBeInTheDocument()
    // The label slot holds the time — SliderField's inline .val readout stays suppressed.
    const container = slider.closest('.fld')
    expect(container?.querySelector('.val')).not.toBeInTheDocument()
  })

  it('shows a clock-formatted readout exactly once across the whole control', () => {
    const { container } = render(<TimeOfDaySlider />)
    const candidates = container.querySelectorAll('.fld .lbl, .scene-row-head, .scene-clock')
    const matches = Array.from(candidates).filter((el) =>
      CLOCK_RE.test(el.textContent?.trim() ?? ''),
    )
    expect(matches).toHaveLength(1)
  })
})
