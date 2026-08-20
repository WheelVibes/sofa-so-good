// @vitest-environment happy-dom
/**
 * UIUX-37: RingGauge — radial progress ring. Sweep length comes from
 * stroke-dashoffset (offset = C·(1−value), clamped to 0..1); the danger
 * variant only swaps the class (colour is the stylesheet's job).
 */
import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { RingGauge } from './RingGauge'

const fg = (el: HTMLElement) => el.querySelector('.ring-fg') as SVGCircleElement

describe('RingGauge (UIUX-37)', () => {
  it('renders an accessible ring with the sweep proportional to value', () => {
    const { container } = render(
      <RingGauge value={0.25} size={48} strokeWidth={5} ariaLabel="25% of budget spent" />,
    )
    const svg = container.querySelector('svg')
    expect(svg?.getAttribute('aria-label')).toBe('25% of budget spent')
    const circle = fg(container as HTMLElement)
    const c = 2 * Math.PI * ((48 - 5) / 2)
    expect(Number(circle.getAttribute('stroke-dasharray'))).toBeCloseTo(c, 5)
    expect(Number(circle.getAttribute('stroke-dashoffset'))).toBeCloseTo(c * 0.75, 5)
  })

  it('clamps value past 1 to a full ring and flags danger via the class', () => {
    const { container } = render(<RingGauge value={1.6} danger ariaLabel="Over budget" />)
    expect(Number(fg(container as HTMLElement).getAttribute('stroke-dashoffset'))).toBeCloseTo(0, 5)
    expect(container.querySelector('.ring-gauge')?.className).toContain('danger')
  })

  it('clamps negative values to an empty ring and renders the centre label', () => {
    const { container } = render(
      <RingGauge value={-0.4} ariaLabel="Nothing spent">
        0%
      </RingGauge>,
    )
    const circle = fg(container as HTMLElement)
    expect(Number(circle.getAttribute('stroke-dashoffset'))).toBeCloseTo(
      Number(circle.getAttribute('stroke-dasharray')),
      5,
    )
    expect(container.querySelector('.ring-label')?.textContent).toBe('0%')
  })
})
