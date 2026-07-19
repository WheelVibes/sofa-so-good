import { beforeEach, describe, expect, it } from 'vitest'
import { useStore } from '../store'

/**
 * BSJ-2 — `planAircon` places a wall FCU (`aircon-unit`) in each served room +
 * the outdoor condenser(s) (`aircon-condenser`) on the AC ledge, replacing any
 * existing aircon items, in ONE undo step (suggest-then-apply, mirroring
 * `suggestMepPoints`). Runs on the built-in default 4-room flat (which has a
 * Living/Dining + 3 bedrooms + an AC Ledge room).
 */
describe('resetSlice — planAircon', () => {
  beforeEach(() => {
    useStore.getState().__resetForTest()
  })

  it('places FCUs per served room + condensers on the ledge, in one undo step', () => {
    const a = useStore.getState()
    // Seed one existing aircon-unit (to be replaced) + a non-aircon item (kept).
    a.setItems([
      { id: 'old-fcu', defId: 'aircon-unit', position: [1, 1], rotation: 0, props: {} },
      { id: 'sofa', defId: 'sofa-3seat', position: [3, 3], rotation: 0, props: {} },
    ])
    const pastBefore = useStore.getState().past.length
    const { fcus, condensers } = useStore.getState().planAircon()

    // The default flat: Living/Dining + Main Bedroom + Bedroom 2 + Bedroom 3 → 4 FCUs;
    // common (1) + private (3) → 2 condensers.
    expect(fcus).toBe(4)
    expect(condensers).toBe(2)
    // One undo step.
    expect(useStore.getState().past.length).toBe(pastBefore + 1)

    const items = useStore.getState().items
    expect(items.filter((i) => i.defId === 'aircon-unit')).toHaveLength(4)
    expect(items.filter((i) => i.defId === 'aircon-condenser')).toHaveLength(2)
    // The stale FCU is gone; the non-aircon item survives.
    expect(items.some((i) => i.id === 'old-fcu')).toBe(false)
    expect(items.some((i) => i.id === 'sofa')).toBe(true)

    // Undo restores the pre-plan items exactly.
    useStore.getState().undo()
    const undone = useStore.getState().items
    expect(undone).toHaveLength(2)
    expect(undone.some((i) => i.id === 'old-fcu')).toBe(true)
  })

  it('is idempotent — re-running updates rather than duplicating', () => {
    useStore.getState().planAircon()
    const first = useStore
      .getState()
      .items.filter((i) => i.defId === 'aircon-unit' || i.defId === 'aircon-condenser').length
    useStore.getState().planAircon()
    const second = useStore
      .getState()
      .items.filter((i) => i.defId === 'aircon-unit' || i.defId === 'aircon-condenser').length
    expect(second).toBe(first)
  })
})
