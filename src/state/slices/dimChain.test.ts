import { beforeEach, describe, expect, it } from 'vitest'
import { useStore } from '../store'

/**
 * Chained-dimension store action (PARITY-DIM-CHAIN). Generates a row of
 * dimension strings along the active level's bottom + left baselines from the
 * wall-vertex positions; one undo step; ground dims carry no levelId.
 */
describe('addChainDimensions', () => {
  beforeEach(() => useStore.getState().__resetForTest())

  it('adds dimensions for the default plan (it has walls)', () => {
    const before = (useStore.getState().floorPlan.dimensions ?? []).length
    const n = useStore.getState().addChainDimensions('ground')
    expect(n).toBeGreaterThan(0)
    expect((useStore.getState().floorPlan.dimensions ?? []).length).toBe(before + n)
  })

  it('tags ground dimensions with no levelId', () => {
    useStore.getState().addChainDimensions('ground')
    const dims = useStore.getState().floorPlan.dimensions ?? []
    expect(dims.length).toBeGreaterThan(0)
    expect(dims.every((d) => d.levelId === undefined)).toBe(true)
  })

  it('is one undo step', () => {
    const past = useStore.getState().past.length
    const n = useStore.getState().addChainDimensions('ground')
    expect(n).toBeGreaterThan(0)
    expect(useStore.getState().past.length).toBe(past + 1)
    useStore.getState().undo()
    expect((useStore.getState().floorPlan.dimensions ?? []).length).toBe(0)
  })
})
