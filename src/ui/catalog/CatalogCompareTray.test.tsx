// @vitest-environment happy-dom
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { FurnitureDef } from '../../furniture/types'
import { useStore } from '../../state/store'
import { CatalogCompareTray } from './CatalogCompareTray'

function def(over: Partial<FurnitureDef>): FurnitureDef {
  return {
    id: 'sofa-a',
    name: 'Sofa A',
    category: 'seating',
    kind: 'gltf',
    source: 'builtin',
    url: '/models/sofa-a.glb',
    license: 'CC0',
    defaultFootprint: { w: 1.8, d: 0.9, h: 0.8 },
    ...over,
  } as FurnitureDef
}

const SOFA_A = def({ id: 'sofa-a', name: 'Sofa A', defaultFootprint: { w: 1.8, d: 0.9, h: 0.8 } })
const SOFA_B = def({ id: 'sofa-b', name: 'Sofa B', defaultFootprint: { w: 2.1, d: 1.0, h: 0.85 } })

describe('CatalogCompareTray', () => {
  beforeEach(() => useStore.getState().__resetForTest())

  it('renders nothing when closed', () => {
    render(
      <CatalogCompareTray
        open={false}
        onClose={() => {}}
        onPlaced={() => {}}
        defs={[SOFA_A, SOFA_B]}
        roomRects={null}
        priceOn={false}
        units="metric"
      />,
    )
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('renders one column per def with name + dims, and a Place button each', () => {
    render(
      <CatalogCompareTray
        open
        onClose={() => {}}
        onPlaced={() => {}}
        defs={[SOFA_A, SOFA_B]}
        roomRects={null}
        priceOn={false}
        units="metric"
      />,
    )
    expect(screen.getByText('Sofa A')).toBeInTheDocument()
    expect(screen.getByText('Sofa B')).toBeInTheDocument()
    expect(screen.getByText('1.80 × 0.90 m')).toBeInTheDocument()
    expect(screen.getByText('2.10 × 1.00 m')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Place' })).toHaveLength(2)
  })

  it('omits the price row when priceOn is false, shows it when true', () => {
    const { unmount } = render(
      <CatalogCompareTray
        open
        onClose={() => {}}
        onPlaced={() => {}}
        defs={[SOFA_A]}
        roomRects={null}
        priceOn={false}
        units="metric"
      />,
    )
    expect(screen.queryByText('Est. price')).toBeNull()
    unmount()
    render(
      <CatalogCompareTray
        open
        onClose={() => {}}
        onPlaced={() => {}}
        defs={[SOFA_A]}
        roomRects={null}
        priceOn
        units="metric"
      />,
    )
    expect(screen.getByText('Est. price')).toBeInTheDocument()
  })

  it('shows a dash fit verdict with no room active, a real verdict once one is', () => {
    const { unmount } = render(
      <CatalogCompareTray
        open
        onClose={() => {}}
        onPlaced={() => {}}
        defs={[SOFA_A]}
        roomRects={null}
        priceOn={false}
        units="metric"
      />,
    )
    expect(document.querySelector('.cmp-fit-unknown')?.textContent).toBe('—')
    unmount()
    render(
      <CatalogCompareTray
        open
        onClose={() => {}}
        onPlaced={() => {}}
        defs={[SOFA_A]}
        roomRects={[{ w: 4, d: 4 }]}
        priceOn={false}
        units="metric"
      />,
    )
    expect(document.querySelector('.cmp-fit-fits')?.textContent).toBe('Fits')
  })

  it('arms placement for the column def and calls onPlaced when Place is clicked', () => {
    const onPlaced = vi.fn()
    render(
      <CatalogCompareTray
        open
        onClose={() => {}}
        onPlaced={onPlaced}
        defs={[SOFA_A, SOFA_B]}
        roomRects={null}
        priceOn={false}
        units="metric"
      />,
    )
    fireEvent.click(screen.getAllByRole('button', { name: 'Place' })[1])
    expect(useStore.getState().activeDefId).toBe('sofa-b')
    expect(onPlaced).toHaveBeenCalledTimes(1)
  })
})
