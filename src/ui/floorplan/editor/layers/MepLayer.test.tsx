// @vitest-environment happy-dom
import { render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PlanElectricalPoint, PlanPlumbingPoint } from '../../../../floorplan/types'
import { useStore } from '../../../../state/store'
import { MepLayer } from './MepLayer'

describe('MepLayer', () => {
  beforeEach(() => useStore.getState().__resetForTest())

  const elecPoint: PlanElectricalPoint = { id: 'ep-1', x: 1, z: 2, kind: 'socket' }
  const plumbPoint: PlanPlumbingPoint = { id: 'pp-1', x: 3, z: 4, kind: 'water-point' }

  const baseProps = {
    toPx: (m: number) => m * 100,
    tool: 'select' as const,
    beginElementDrag: () => true,
    pointerWorld: () => [0, 0] as [number, number],
    setMovingMep: vi.fn(),
  }

  it('renders one group per electrical + plumbing point', () => {
    const { container } = render(
      <svg>
        <MepLayer electrical={[elecPoint]} plumbing={[plumbPoint]} sel={null} {...baseProps} />
      </svg>,
    )
    expect(container.querySelectorAll('g').length).toBe(2)
    expect(container.querySelectorAll('circle').length).toBe(2)
  })

  it('renders nothing for empty arrays', () => {
    const { container } = render(
      <svg>
        <MepLayer electrical={[]} plumbing={[]} sel={null} {...baseProps} />
      </svg>,
    )
    expect(container.querySelectorAll('g').length).toBe(0)
  })

  it('the selected point renders with the accent stroke + thicker outline', () => {
    const { container } = render(
      <svg>
        <MepLayer
          electrical={[elecPoint]}
          plumbing={[plumbPoint]}
          sel={{ type: 'mep', family: 'electrical', id: 'ep-1' }}
          {...baseProps}
        />
      </svg>,
    )
    const circles = [...container.querySelectorAll('circle')]
    const selectedCircle = circles.find((c) => c.getAttribute('stroke') === 'var(--accent)')
    expect(selectedCircle).toBeTruthy()
    expect(selectedCircle?.getAttribute('stroke-width')).toBe('2')
  })

  it('an unselected plumbing point uses the accent-2 token, not the electrical accent', () => {
    const { container } = render(
      <svg>
        <MepLayer
          electrical={[]}
          plumbing={[plumbPoint]}
          sel={{ type: 'mep', family: 'electrical', id: 'some-other-id' }}
          {...baseProps}
        />
      </svg>,
    )
    const circle = container.querySelector('circle')
    expect(circle?.getAttribute('stroke')).toBe('var(--accent-2)')
  })

  it('pointer-down with the select tool selects the point', () => {
    const { container } = render(
      <svg>
        <MepLayer electrical={[elecPoint]} plumbing={[]} sel={null} {...baseProps} />
      </svg>,
    )
    const g = container.querySelector('g')!
    g.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))
    const sel = useStore.getState().planSelection
    expect(sel).toEqual({ type: 'mep', family: 'electrical', id: 'ep-1' })
  })

  it('pointer-down with a non-select tool does not select', () => {
    const { container } = render(
      <svg>
        <MepLayer electrical={[elecPoint]} plumbing={[]} sel={null} {...baseProps} tool="mep" />
      </svg>,
    )
    const g = container.querySelector('g')!
    g.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))
    expect(useStore.getState().planSelection).toBeNull()
  })
})
