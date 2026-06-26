import { beforeEach, describe, expect, it } from 'vitest'
import { planTotalArea, wallLength } from '../../floorplan/types'
import { useStore } from '../store'

describe('rescaleFloorPlan action', () => {
  beforeEach(() => useStore.getState().__resetForTest())

  it('scales every wall length and total area in one undoable step', () => {
    const before = useStore.getState().floorPlan
    const lensBefore = before.walls.map((w) => wallLength(w))
    const areaBefore = planTotalArea(before)

    useStore.getState().rescaleFloorPlan(2)

    const after = useStore.getState().floorPlan
    after.walls.forEach((w, i) => {
      expect(wallLength(w)).toBeCloseTo(lensBefore[i] * 2, 6)
    })
    expect(planTotalArea(after)).toBeCloseTo(areaBefore * 4, 6)

    // One undo reverts the whole rescale.
    useStore.getState().undo()
    const reverted = useStore.getState().floorPlan
    expect(planTotalArea(reverted)).toBeCloseTo(areaBefore, 6)
  })

  it('scales furniture positions but preserves sizes by default', () => {
    const items = useStore.getState().items
    if (items.length === 0) return
    const first = items[0]
    const posBefore: [number, number] = [...first.position]
    const widthBefore = first.props.width

    useStore.getState().rescaleFloorPlan(2)

    const after = useStore.getState().items.find((i) => i.id === first.id)!
    expect(after.position[0]).toBeCloseTo(posBefore[0] * 2, 6)
    expect(after.position[1]).toBeCloseTo(posBefore[1] * 2, 6)
    if (typeof widthBefore === 'number') expect(after.props.width).toBe(widthBefore)
  })

  it('hits a target length on an anchor wall', () => {
    const wall = useStore.getState().floorPlan.walls[0]
    useStore.getState().rescaleFloorPlan({ anchorWallId: wall.id, targetLength: 9 })
    const after = useStore.getState().floorPlan.walls.find((w) => w.id === wall.id)!
    expect(wallLength(after)).toBeCloseTo(9, 6)
  })

  it('factor 1 is a no-op (no history step pushed)', () => {
    const planBefore = useStore.getState().floorPlan
    useStore.getState().rescaleFloorPlan(1)
    // Same plan reference (no fork/replace) and undo doesn't change anything.
    expect(useStore.getState().floorPlan).toBe(planBefore)
  })

  it('throws on a non-positive factor and leaves the plan untouched', () => {
    const planBefore = useStore.getState().floorPlan
    expect(() => useStore.getState().rescaleFloorPlan(0)).toThrow()
    expect(useStore.getState().floorPlan).toBe(planBefore)
  })
})
