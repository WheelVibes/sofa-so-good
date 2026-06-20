import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { BUILTIN_CATALOG } from '../../furniture/builtinCatalog'
import type { ParametricDef } from '../../furniture/types'
import { useStore } from '../../state/store'
import { PlanFurnitureInspector } from './PlanFurnitureInspector'
import { PlanInspector } from './PlanInspector'

// A parametric def whose width axis is an editable number field — used to verify
// the resize control routes to updateItemProps. Resolved from the live catalog
// so the test never hard-codes a def id that might be retired.
function resizableDef(): ParametricDef {
  for (const def of Object.values(BUILTIN_CATALOG)) {
    if (def.kind !== 'parametric') continue
    const wKey = def.footprintParams?.w ?? 'width'
    const field = def.paramSchema.find((f) => f.key === wKey)
    if (field && field.kind === 'number') return def
  }
  throw new Error('no resizable parametric def found in catalog')
}

/** Place a single item on a wall-less custom plan (no walls/rooms → collision
 *  checks only consider item-item overlap, so moves/rotations always pass). */
function placeOne(defId: string, props: Record<string, number | string> = {}): string {
  const s = useStore.getState()
  s.newFloorPlan('Test plan')
  // Strip the seeded boundary walls/openings so a transform can't bump a wall.
  s.setFloorPlan({ ...useStore.getState().floorPlan, walls: [], openings: [], rooms: [] })
  s.setItems([])
  const id = s.addItem({ defId: defId as never, position: [0, 0], rotation: 0, props })
  s.selectItem(id)
  return id
}

describe('PlanFurnitureInspector (PARITY-PLAN-FURN-INSPECT)', () => {
  beforeEach(() => useStore.getState().__resetForTest())

  it('renders the selected item name + footprint', () => {
    const def = resizableDef()
    const id = placeOne(def.id)
    render(<PlanFurnitureInspector item={useStore.getState().items.find((i) => i.id === id)!} />)
    expect(screen.getByLabelText('Custom item name')).toBeTruthy()
    expect(screen.getByText('Size (W×D×H)')).toBeTruthy()
  })

  it('renaming dispatches renameItem', () => {
    const def = resizableDef()
    const id = placeOne(def.id)
    render(<PlanFurnitureInspector item={useStore.getState().items.find((i) => i.id === id)!} />)
    act(() => {
      fireEvent.change(screen.getByLabelText('Custom item name'), {
        target: { value: 'My piece' },
      })
    })
    expect(useStore.getState().items.find((i) => i.id === id)!.label).toBe('My piece')
  })

  it('editing X position dispatches a collision-checked moveItem (one undo step)', () => {
    const def = resizableDef()
    const id = placeOne(def.id)
    const before = useStore.getState().past.length
    render(<PlanFurnitureInspector item={useStore.getState().items.find((i) => i.id === id)!} />)
    act(() => {
      fireEvent.change(screen.getByLabelText('X (m)'), { target: { value: '1.5' } })
    })
    expect(useStore.getState().items.find((i) => i.id === id)!.position[0]).toBeCloseTo(1.5)
    // History grew by exactly one step (move pushed once).
    expect(useStore.getState().past.length).toBe(before + 1)
  })

  it('editing the angle dispatches rotateItem', () => {
    const def = resizableDef()
    const id = placeOne(def.id)
    render(<PlanFurnitureInspector item={useStore.getState().items.find((i) => i.id === id)!} />)
    act(() => {
      fireEvent.change(screen.getByLabelText('Angle (°)'), { target: { value: '90' } })
    })
    expect(useStore.getState().items.find((i) => i.id === id)!.rotation).toBeCloseTo(Math.PI / 2)
  })

  it('resizing width dispatches updateItemProps on a parametric def', () => {
    const def = resizableDef()
    const wKey = def.footprintParams?.w ?? 'width'
    const id = placeOne(def.id)
    render(<PlanFurnitureInspector item={useStore.getState().items.find((i) => i.id === id)!} />)
    act(() => {
      fireEvent.change(screen.getByLabelText('Width (m)'), { target: { value: '0.5' } })
    })
    expect(useStore.getState().items.find((i) => i.id === id)!.props[wKey]).toBeCloseTo(0.5)
  })

  it('a locked item blocks move/rotate', () => {
    const def = resizableDef()
    const id = placeOne(def.id)
    act(() => useStore.getState().toggleLock(id))
    render(<PlanFurnitureInspector item={useStore.getState().items.find((i) => i.id === id)!} />)
    act(() => {
      fireEvent.change(screen.getByLabelText('X (m)'), { target: { value: '3' } })
    })
    expect(useStore.getState().items.find((i) => i.id === id)!.position[0]).toBe(0)
  })

  it('renders nothing when the def is missing (stale id, graceful)', () => {
    const id = placeOne(resizableDef().id)
    const item = useStore.getState().items.find((i) => i.id === id)!
    const { container } = render(
      <PlanFurnitureInspector item={{ ...item, defId: 'does-not-exist' as never }} />,
    )
    expect(container.firstChild).toBeNull()
  })
})

describe('PlanInspector furniture branch — Simple + Pro (mode-independent)', () => {
  beforeEach(() => useStore.getState().__resetForTest())

  for (const mode of ['simple', 'pro'] as const) {
    it(`shows the furniture inspector when an item is selected in ${mode} mode`, () => {
      act(() => useStore.getState().setUiMode(mode))
      const def = resizableDef()
      placeOne(def.id)
      render(<PlanInspector />)
      expect(useStore.getState().uiMode).toBe(mode)
      // The panel auto-minimizes on selection; expand it to reveal the body.
      act(() => fireEvent.click(screen.getAllByLabelText('Expand properties')[0]))
      // The furniture branch renders its name field + footprint readout in both
      // modes — plan editing is a core loop, not a pro-only surface.
      expect(screen.getByLabelText('Custom item name')).toBeTruthy()
      expect(screen.getByText('Size (W×D×H)')).toBeTruthy()
    })
  }

  it('selecting a plan element clears a prior item selection (no double panel)', () => {
    const def = resizableDef()
    placeOne(def.id)
    expect(useStore.getState().selectedItemId).not.toBeNull()
    act(() => useStore.getState().setPlanSelection({ type: 'room', id: 'r1' }))
    expect(useStore.getState().selectedItemId).toBeNull()
  })

  it('selecting an item clears a prior plan-element selection', () => {
    const def = resizableDef()
    const id = placeOne(def.id)
    act(() => useStore.getState().setPlanSelection({ type: 'room', id: 'r1' }))
    act(() => useStore.getState().selectItem(id))
    expect(useStore.getState().planSelection).toBeNull()
    expect(useStore.getState().selectedItemId).toBe(id)
  })
})
