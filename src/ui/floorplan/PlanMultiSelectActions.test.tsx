// @vitest-environment happy-dom
import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { useStore } from '../../state/store'
import { PlanInspector } from './PlanInspector'
import { PlanMultiSelectActions } from './PlanMultiSelectActions'

/**
 * PARITY-PLAN-ALIGN — the 2D plan multi-select panel wires the existing pure
 * align/distribute/mirror ops (`layout/alignDistribute.ts` +
 * `layout/selectionActions.ts`) onto a marquee furniture selection. These tests
 * assert the WIRING: the right ops fire, each is one undo step, and the panel
 * surfaces in BOTH Simple and Pro (align/distribute/mirror are ungated core ops
 * in 3D, so the plan surface is kept mode-independent — rides only on the editor
 * being open, no feature flag).
 */

function s() {
  return useStore.getState()
}

/** Place `n` potted-plants spread along Z on a wall-less plan and marquee-select
 *  them (so collision checks only see item-item overlap). Returns their ids. */
function placeAndMarquee(n: number): string[] {
  const a = useStore.getState()
  a.newFloorPlan({ name: 'Align test', shell: true })
  a.setFloorPlan({ ...useStore.getState().floorPlan, walls: [], openings: [], rooms: [] })
  a.setItems([])
  const ids: string[] = []
  for (let i = 0; i < n; i++) {
    const id = a.addItem({
      defId: 'potted-plant' as never,
      // Stagger X so an Align X has work to do; space Z generously (no overlap).
      position: [i * 0.13, i * 1.2],
      rotation: 0,
      props: {},
    })
    ids.push(id)
  }
  // Furniture-only multi-selection (what a marquee/shift-click produces). The
  // panel keys off `selectedItemIds.length > 1` regardless of which gesture set
  // it, so driving the slice action directly exercises the same contract.
  a.setSelectedItemIds(ids)
  a.clearHistory()
  return ids
}

describe('PlanMultiSelectActions (PARITY-PLAN-ALIGN) — op wiring', () => {
  beforeEach(() => s().__resetForTest())

  it('Align X equalizes every selected piece X (one undo step)', () => {
    const ids = placeAndMarquee(3)
    render(<PlanMultiSelectActions />)
    act(() => fireEvent.click(screen.getByText('Align X')))
    const xs = ids.map((id) => s().items.find((i) => i.id === id)!.position[0])
    expect(Math.max(...xs) - Math.min(...xs)).toBeLessThan(1e-9)
    expect(s().past.length).toBe(1)
  })

  it('Distribute Z evens the edge-to-edge gaps along Z (one undo step)', () => {
    const ids = placeAndMarquee(3)
    // Bunch the middle piece off-centre so distribute has work to do.
    const mid = s().items.find((i) => i.id === ids[1])!
    act(() => s().moveItem(mid.id, [mid.position[0], 0.4]))
    s().clearHistory()
    render(<PlanMultiSelectActions />)
    act(() => fireEvent.click(screen.getByText('Across Z')))
    const zs = ids
      .map((id) => s().items.find((i) => i.id === id)!.position[1])
      .sort((a, b) => a - b)
    // Equal footprints + equal gaps → equal centre spacing.
    expect(zs[1] - zs[0]).toBeCloseTo(zs[2] - zs[1], 6)
    expect(s().past.length).toBe(1)
  })

  it('Mirror reflects X across the selection centre (one undo step)', () => {
    const ids = placeAndMarquee(2)
    const before = ids.map((id) => s().items.find((i) => i.id === id)!.position[0])
    const cx = before.reduce((a, b) => a + b, 0) / before.length
    render(<PlanMultiSelectActions />)
    act(() => fireEvent.click(screen.getByText('Mirror')))
    const after = ids.map((id) => s().items.find((i) => i.id === id)!.position[0])
    after.forEach((x, i) => {
      expect(x).toBeCloseTo(2 * cx - before[i], 6)
    })
    expect(s().past.length).toBe(1)
  })

  it('skips locked items (left in place) while moving the rest', () => {
    const ids = placeAndMarquee(3)
    act(() => s().toggleLock(ids[0]))
    const lockedX = s().items.find((i) => i.id === ids[0])!.position[0]
    render(<PlanMultiSelectActions />)
    act(() => fireEvent.click(screen.getByText('Align X')))
    // The locked piece keeps its X; align happened among the unlocked ones.
    expect(s().items.find((i) => i.id === ids[0])!.position[0]).toBe(lockedX)
  })

  it('one undo reverts the whole align in a single step', () => {
    const ids = placeAndMarquee(3)
    const before = s().items.map((i) => [...i.position] as [number, number])
    render(<PlanMultiSelectActions />)
    act(() => fireEvent.click(screen.getByText('Align X')))
    expect(s().past.length).toBe(1)
    act(() => s().undo())
    ids.forEach((id, i) => {
      expect(s().items.find((it) => it.id === id)!.position).toEqual(before[i])
    })
  })
})

describe('PlanInspector furniture multi-select branch — Simple + Pro', () => {
  beforeEach(() => s().__resetForTest())

  for (const mode of ['simple', 'pro'] as const) {
    it(`surfaces align/distribute/mirror for a 2+ furniture marquee in ${mode} mode`, () => {
      act(() => s().setUiMode(mode))
      placeAndMarquee(3)
      render(<PlanInspector />)
      expect(s().uiMode).toBe(mode)
      // Action panel stays expanded (not auto-minimized) — the buttons show in
      // both modes because align/distribute/mirror are ungated core ops.
      expect(screen.getByText('3 items selected')).toBeTruthy()
      expect(screen.getByText('Align X')).toBeTruthy()
      expect(screen.getByText('Across Z')).toBeTruthy()
      expect(screen.getByText('Mirror')).toBeTruthy()
    })
  }

  it('a single selected item shows the single-item sheet, not the bulk panel', () => {
    const ids = placeAndMarquee(2)
    act(() => s().selectItem(ids[0]))
    render(<PlanInspector />)
    const expandBtns = screen.queryAllByLabelText('Expand properties')
    if (expandBtns.length > 0) act(() => fireEvent.click(expandBtns[0]))
    expect(screen.getByLabelText('Custom item name')).toBeTruthy()
    expect(screen.queryByText('2 items selected')).toBeNull()
  })
})
