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
    overrides: Partial<{ mountHeightMm: number; label: string; levelId: string }> = {},
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

  it("a selection from ANOTHER storey goes blank — the inspector can't edit an off-screen point (bug-hunt 2026-07-18 #1)", () => {
    // Point lives on an upper storey; the inspector is viewing ground (no
    // levelId prop). The canvas layer is level-filtered, so a stale
    // cross-level selection must not resolve to an editable panel here.
    selectElectricalPoint({ levelId: 'upper-1' })
    render(<PlanInspector />)
    expect(screen.queryByText('Electrical point')).toBeNull()
    expect(screen.queryByLabelText('Mount height (mm AFFL)')).toBeNull()
    // Same id inspected ON its own storey still resolves.
    render(<PlanInspector levelId="upper-1" />)
    expect(screen.getByText('Electrical point')).toBeTruthy()
  })
})

/** TODO G7 — bulk structural classification on the multi-wall selection panel. */
describe('PlanInspector — multi-wall selection: bulk Structure', () => {
  beforeEach(() => {
    useStore.getState().__resetForTest()
    useStore.getState().setUiMode('pro')
    useStore.getState().reresolveFeatureFlags()
  })

  function selectTwoWalls() {
    const s = useStore.getState()
    s.newFloorPlan('G7 bulk demo')
    s.setFloorPlan({
      ...useStore.getState().floorPlan,
      walls: [
        { id: 'w1', start: [0, 0], end: [4, 0], thickness: 'internal' },
        { id: 'w2', start: [4, 0], end: [4, 3], thickness: 'internal' },
      ],
      openings: [],
      rooms: [],
    })
    s.setPlanMarqueeSelection([], ['w1', 'w2'])
  }

  it('shows the bulk Structure select for 2+ selected walls (Pro mode)', () => {
    selectTwoWalls()
    render(<PlanInspector />)
    expect(screen.getByText('2 walls selected')).toBeTruthy()
    expect(screen.getByLabelText('Structure (all selected walls)')).toBeTruthy()
  })

  it('bulk-applies a classification to every selected wall via setWallsStructure', () => {
    selectTwoWalls()
    render(<PlanInspector />)
    const trigger = screen.getByLabelText('Structure (all selected walls)')
    fireEvent.keyDown(trigger, { key: 'ArrowDown' }) // open
    fireEvent.keyDown(trigger, { key: 'ArrowDown' }) // move to load-bearing (index 1)
    fireEvent.keyDown(trigger, { key: 'Enter' }) // commit
    const walls = useStore.getState().floorPlan.walls
    expect(walls.find((w) => w.id === 'w1')?.structure).toBe('load-bearing')
    expect(walls.find((w) => w.id === 'w2')?.structure).toBe('load-bearing')
  })

  it('hides the bulk Structure select in Simple mode (pro-tier flag)', () => {
    useStore.getState().setUiMode('simple')
    useStore.getState().reresolveFeatureFlags()
    selectTwoWalls()
    render(<PlanInspector />)
    expect(screen.getByText('2 walls selected')).toBeTruthy()
    expect(screen.queryByLabelText('Structure (all selected walls)')).toBeNull()
  })
})
