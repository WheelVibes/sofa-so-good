import { beforeEach, describe, expect, it } from 'vitest'
import { useStore } from '../store'

/**
 * Persistent ruler-guide store actions (PARITY-PLAN-GUIDES). Guides are a
 * plan-wide array the 2D editor snaps points to; each mutation forks the default
 * plan and pushes one undo step.
 */
describe('plan guides slice', () => {
  beforeEach(() => useStore.getState().__resetForTest())

  it('adds vertical + horizontal guides', () => {
    useStore.getState().addPlanGuide({ axis: 'x', pos: 2 })
    useStore.getState().addPlanGuide({ axis: 'z', pos: 3.5 })
    const guides = useStore.getState().floorPlan.guides ?? []
    expect(guides).toEqual([
      { axis: 'x', pos: 2 },
      { axis: 'z', pos: 3.5 },
    ])
  })

  it('de-dupes a near-identical guide on the same axis', () => {
    useStore.getState().addPlanGuide({ axis: 'x', pos: 2 })
    useStore.getState().addPlanGuide({ axis: 'x', pos: 2.00001 })
    expect((useStore.getState().floorPlan.guides ?? []).length).toBe(1)
  })

  it('removes a guide by index', () => {
    useStore.getState().addPlanGuide({ axis: 'x', pos: 1 })
    useStore.getState().addPlanGuide({ axis: 'z', pos: 2 })
    useStore.getState().removePlanGuide(0)
    expect(useStore.getState().floorPlan.guides).toEqual([{ axis: 'z', pos: 2 }])
  })

  it('clears all guides', () => {
    useStore.getState().addPlanGuide({ axis: 'x', pos: 1 })
    useStore.getState().addPlanGuide({ axis: 'z', pos: 2 })
    useStore.getState().clearPlanGuides()
    expect(useStore.getState().floorPlan.guides).toEqual([])
  })

  it('each guide mutation is one undo step', () => {
    const before = useStore.getState().past.length
    useStore.getState().addPlanGuide({ axis: 'x', pos: 1 })
    expect(useStore.getState().past.length).toBe(before + 1)
    useStore.getState().undo()
    expect(useStore.getState().floorPlan.guides ?? []).toEqual([])
  })
})
