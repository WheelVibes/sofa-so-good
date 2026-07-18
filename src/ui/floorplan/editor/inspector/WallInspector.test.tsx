// @vitest-environment happy-dom
import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { useStore } from '../../../../state/store'
import { WallInspector } from './WallInspector'

/** A single wall on a blank custom plan, selected for the inspector. */
function placeWall(): string {
  const s = useStore.getState()
  s.newFloorPlan('Test plan')
  s.setFloorPlan({
    ...useStore.getState().floorPlan,
    walls: [{ id: 'w1', start: [0, 0], end: [4, 0], thickness: 'internal' }],
    openings: [],
    rooms: [],
  })
  return 'w1'
}

describe('WallInspector — Structure select (TODO G7, wallStructure flag)', () => {
  beforeEach(() => useStore.getState().__resetForTest())

  it('defaults to Unknown / not verified when structure is absent', () => {
    act(() => useStore.getState().setUiMode('pro'))
    const id = placeWall()
    const wall = useStore.getState().floorPlan.walls.find((w) => w.id === id)!
    render(<WallInspector wall={wall} />)
    expect(screen.getByLabelText('Structure')).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByText('Unknown / not verified')).toBeTruthy()
  })

  it('round-trips a classification pick through updateWall via the keyboard (open → Down → Enter)', () => {
    act(() => useStore.getState().setUiMode('pro'))
    const id = placeWall()
    const wall = useStore.getState().floorPlan.walls.find((w) => w.id === id)!
    render(<WallInspector wall={wall} />)
    const trigger = screen.getByLabelText('Structure')
    act(() => {
      fireEvent.keyDown(trigger, { key: 'ArrowDown' }) // opens the menu
    })
    act(() => {
      fireEvent.keyDown(trigger, { key: 'ArrowDown' }) // moves to the next option (load-bearing)
    })
    act(() => {
      fireEvent.keyDown(trigger, { key: 'Enter' }) // commits
    })
    expect(useStore.getState().floorPlan.walls.find((w) => w.id === id)!.structure).toBe(
      'load-bearing',
    )
    // Re-render with the freshly-updated wall prop to confirm the trigger label follows it.
    const updated = useStore.getState().floorPlan.walls.find((w) => w.id === id)!
    render(<WallInspector wall={updated} />)
    expect(screen.getAllByText('Load-bearing').length).toBeGreaterThan(0)
  })

  it('shows the "verify with HDB/PE" hint', () => {
    act(() => useStore.getState().setUiMode('pro'))
    const id = placeWall()
    const wall = useStore.getState().floorPlan.walls.find((w) => w.id === id)!
    render(<WallInspector wall={wall} />)
    expect(screen.getByText(/Confirm against HDB\/BCA as-built records/)).toBeTruthy()
  })

  it('hides the Structure select in Simple mode (pro-tier flag)', () => {
    act(() => useStore.getState().setUiMode('simple'))
    const id = placeWall()
    const wall = useStore.getState().floorPlan.walls.find((w) => w.id === id)!
    render(<WallInspector wall={wall} />)
    expect(screen.queryByLabelText('Structure')).toBeNull()
  })

  it('shows the Structure select in Pro mode', () => {
    act(() => useStore.getState().setUiMode('pro'))
    const id = placeWall()
    const wall = useStore.getState().floorPlan.walls.find((w) => w.id === id)!
    render(<WallInspector wall={wall} />)
    expect(screen.queryByLabelText('Structure')).toBeTruthy()
  })
})
