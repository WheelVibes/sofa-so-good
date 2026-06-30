import { beforeEach, describe, expect, it } from 'vitest'
import { useStore } from '../store'

/**
 * nudgeGapApart store action (GAP-SUGGEST) — splits the minimal widen needed to
 * reach the required clearance across both items, moving them apart along their
 * centre-to-centre axis. One undo step. Pure direction/distance math is covered
 * by gapFix.test.ts.
 */
describe('nudgeGapApart', () => {
  beforeEach(() => useStore.getState().__resetForTest())

  function place(x: number, z: number) {
    return useStore.getState().addItem({
      defId: 'sofa-3seat',
      position: [x, z],
      rotation: 0,
    } as never)
  }

  it('moves both items apart by half the widen each', () => {
    const a = place(0, 0)
    const b = place(1, 0)
    useStore.getState().nudgeGapApart(a, b, 0.5, 0.9) // widen 0.4 → 0.2 each
    const items = useStore.getState().items
    const ia = items.find((i) => i.id === a)!
    const ib = items.find((i) => i.id === b)!
    expect(ia.position[0]).toBeCloseTo(-0.2, 5)
    expect(ib.position[0]).toBeCloseTo(1.2, 5)
    // Centre distance grew by exactly the widen (0.4).
    expect(ib.position[0] - ia.position[0]).toBeCloseTo(1.4, 5)
  })

  it('is a no-op when the gap already meets the requirement', () => {
    const a = place(0, 0)
    const b = place(2, 0)
    const past = useStore.getState().past.length
    useStore.getState().nudgeGapApart(a, b, 1.2, 0.9)
    expect(useStore.getState().items.find((i) => i.id === a)!.position[0]).toBe(0)
    expect(useStore.getState().past.length).toBe(past) // no history pushed
  })

  it('pushes one undo step', () => {
    const a = place(0, 0)
    const b = place(1, 0)
    const past = useStore.getState().past.length
    useStore.getState().nudgeGapApart(a, b, 0.5, 0.9)
    expect(useStore.getState().past.length).toBe(past + 1)
    useStore.getState().undo()
    expect(useStore.getState().items.find((i) => i.id === a)!.position[0]).toBe(0)
  })
})
