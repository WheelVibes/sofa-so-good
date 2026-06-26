import { beforeEach, describe, expect, it } from 'vitest'
import { FEATURE_FLAGS } from '../../features/featureFlags'
import { resolveFlags } from '../../features/flags/resolve'
import type { FloorPlan } from '../../floorplan/types'
import { useStore } from '../store'

/** Build a small off-grid plan to load into the store. */
function offGridPlan(): FloorPlan {
  return {
    id: 'p1',
    name: 'off-grid',
    ceilingHeight: 2.6,
    extent: [5.43, 4.41],
    walls: [
      { id: 'w1', start: [0.07, 0.13], end: [5.36, 0.13], thickness: 'external' },
      { id: 'w2', start: [5.36, 0.13], end: [5.36, 4.28], thickness: 'external' },
    ],
    openings: [
      { id: 'o1', kind: 'door', wallId: 'w1', offset: 1.23, width: 0.91, sill: 0, head: 2 },
    ],
    rooms: [{ id: 'r1', name: 'Living', origin: [0.17, 0.23], width: 3.11, depth: 2.97 }],
  }
}

const onGrid = (v: number, g: number) => Math.abs(v / g - Math.round(v / g)) < 1e-9

describe('snapFloorPlanToGrid action', () => {
  beforeEach(() => useStore.getState().__resetForTest())

  it('snaps every wall endpoint to the grid in one undoable step', () => {
    useStore.getState().setFloorPlan(offGridPlan())
    const before = useStore.getState().floorPlan

    useStore.getState().snapFloorPlanToGrid(0.05)

    const after = useStore.getState().floorPlan
    for (const w of after.walls) {
      for (const v of [w.start[0], w.start[1], w.end[0], w.end[1]]) {
        expect(onGrid(v, 0.05)).toBe(true)
      }
    }
    // It actually changed something (the input was off-grid).
    expect(after).not.toEqual(before)

    // One undo reverts the whole snap.
    useStore.getState().undo()
    expect(useStore.getState().floorPlan.walls[0].start).toEqual(before.walls[0].start)
  })

  it('defaults the grid to the editor gridSize when omitted', () => {
    useStore.getState().setGridSize(0.25)
    useStore.getState().setFloorPlan(offGridPlan())
    useStore.getState().snapFloorPlanToGrid()
    for (const w of useStore.getState().floorPlan.walls) {
      expect(onGrid(w.start[0], 0.25)).toBe(true)
      expect(onGrid(w.end[0], 0.25)).toBe(true)
    }
  })

  it('throws on a non-positive grid and leaves the plan untouched', () => {
    useStore.getState().setFloorPlan(offGridPlan())
    const before = useStore.getState().floorPlan
    expect(() => useStore.getState().snapFloorPlanToGrid(0)).toThrow()
    expect(useStore.getState().floorPlan).toBe(before)
  })

  it('preserves furniture positions by default and snaps them when opted in', () => {
    const items = useStore.getState().items
    if (items.length === 0) return
    const first = items[0]
    const posBefore: [number, number] = [...first.position]

    useStore.getState().snapFloorPlanToGrid(0.05)
    const kept = useStore.getState().items.find((i) => i.id === first.id)!
    expect(kept.position).toEqual(posBefore)

    useStore.getState().__resetForTest()
    useStore.getState().snapFloorPlanToGrid(0.05, { snapFurniture: true })
    const snapped = useStore.getState().items.find((i) => i.id === first.id)
    if (snapped) {
      expect(onGrid(snapped.position[0], 0.05)).toBe(true)
      expect(onGrid(snapped.position[1], 0.05)).toBe(true)
    }
  })
})

describe('planGridSnap flag gating', () => {
  it('is a pro-tier flag, default on', () => {
    expect(FEATURE_FLAGS.planGridSnap.tier).toBe('pro')
    expect(FEATURE_FLAGS.planGridSnap.default).toBe(true)
  })

  it('is hidden in Simple mode and present in Pro mode', () => {
    expect(resolveFlags(false, {}, false, 'simple').planGridSnap).toBe(false)
    expect(resolveFlags(false, {}, false, 'pro').planGridSnap).toBe(true)
  })
})
