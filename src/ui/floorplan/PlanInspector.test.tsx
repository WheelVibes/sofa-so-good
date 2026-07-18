// @vitest-environment happy-dom
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { useStore } from '../../state/store'
import { PlanInspector } from './PlanInspector'

/** MEP layer, G1 PR3 — the inspector's `'mep'` selection case: within-family
 *  kind select, mount-height field (+ presets for electrical), label input,
 *  delete. */
describe('PlanInspector — mep case', () => {
  beforeEach(() => {
    useStore.getState().__resetForTest()
    // `mepEditor` is pro-tier — Pro mode so the inspector case actually renders.
    useStore.getState().setUiMode('pro')
    useStore.getState().reresolveFeatureFlags()
  })

  function selectElectricalPoint(
    overrides: Partial<{ mountHeightMm: number; label: string }> = {},
  ) {
    const id = useStore.getState().addElectricalPoint({ x: 1, z: 2, kind: 'socket', ...overrides })
    useStore.getState().setPlanSelection({ type: 'mep', family: 'electrical', id })
    return id
  }

  function selectPlumbingPoint() {
    const id = useStore.getState().addPlumbingPoint({ x: 3, z: 4, kind: 'water-point' })
    useStore.getState().setPlanSelection({ type: 'mep', family: 'plumbing', id })
    return id
  }

  it('renders the Electrical point heading + kind select + mount-height field for an electrical selection', () => {
    selectElectricalPoint()
    render(<PlanInspector />)
    expect(screen.getByText('Electrical point')).toBeTruthy()
    expect(screen.getByLabelText('Mount height (mm AFFL)')).toBeTruthy()
  })

  it('shows the placeholder default mount height when unset', () => {
    selectElectricalPoint()
    render(<PlanInspector />)
    const input = screen.getByLabelText('Mount height (mm AFFL)') as HTMLInputElement
    expect(input.placeholder).toBe('300') // socket default (mepPoints.ts)
    expect(input.value).toBe('')
  })

  it('shows electrical preset chips and clicking one round-trips the mount height', () => {
    const id = selectElectricalPoint()
    render(<PlanInspector />)
    fireEvent.click(screen.getByRole('button', { name: '1200' }))
    const p = useStore.getState().floorPlan.electricalPoints?.find((x) => x.id === id)
    expect(p?.mountHeightMm).toBe(1200)
  })

  it('renders the Plumbing point heading with no preset chips', () => {
    selectPlumbingPoint()
    render(<PlanInspector />)
    expect(screen.getByText('Plumbing point')).toBeTruthy()
    expect(screen.queryByRole('group', { name: 'Standard heights' })).toBeNull()
  })

  it('editing the label input round-trips through the store', () => {
    const id = selectElectricalPoint()
    render(<PlanInspector />)
    fireEvent.change(screen.getByLabelText('Point label'), { target: { value: 'fridge' } })
    const p = useStore.getState().floorPlan.electricalPoints?.find((x) => x.id === id)
    expect(p?.label).toBe('fridge')
  })

  it('Delete removes the point and clears the selection', () => {
    const id = selectElectricalPoint()
    render(<PlanInspector />)
    fireEvent.click(screen.getByRole('button', { name: 'Delete electrical point' }))
    expect(useStore.getState().floorPlan.electricalPoints?.find((x) => x.id === id)).toBeUndefined()
    expect(useStore.getState().planSelection).toBeNull()
  })

  it('renders no MEP case in Simple mode (mepEditor is pro-tier, forced off)', () => {
    useStore.getState().setUiMode('simple')
    useStore.getState().reresolveFeatureFlags()
    selectElectricalPoint()
    render(<PlanInspector />)
    expect(screen.queryByText('Electrical point')).toBeNull()
    expect(screen.queryByLabelText('Mount height (mm AFFL)')).toBeNull()
  })
})
