import { beforeEach, describe, expect, it } from 'vitest'
import { SCREED } from '../../furniture/intakeStates'
import { useStore } from '../store'

/**
 * BSJ-4 — bare-BTO & resale starting states seeded via `resetSlice`. Driven on
 * the built-in default 4-room flat (Living/Dining + 3 bedrooms + 2 baths +
 * kitchen + service yard + household shelter), each in ONE undo step.
 */
describe('resetSlice — applyBareBto', () => {
  beforeEach(() => {
    useStore.getState().__resetForTest()
  })

  it('screeds dry rooms, retains wet floors, strips furniture, removes internal leaves', () => {
    // Seed some furniture that must be stripped.
    useStore.getState().setItems([
      { id: 'sofa', defId: 'sofa-3seat', position: [3, 3], rotation: 0, props: {} },
      { id: 'wc', defId: 'toilet', position: [1, 1], rotation: 0, props: {} },
    ])
    const pastBefore = useStore.getState().past.length
    useStore.getState().applyBareBto()
    const s = useStore.getState()

    // No furniture / fittings at all (bare shell).
    expect(s.items).toHaveLength(0)

    // Dry rooms → screed; wet/kitchen keep their HDB-tiled floor.
    expect(s.finishes.floor.mainBedroom).toBe(SCREED)
    expect(s.finishes.floor.livingDining).toBe(SCREED)
    expect(s.finishes.floor.bath1).not.toBe(SCREED)
    expect(s.finishes.floor.kitchen).not.toBe(SCREED)

    // Internal door leaves absent (open passage); entrance + shelter kept.
    expect(s.doors['door-mainBedroom']?.leaf).toBe('none')
    expect(s.doors['door-mainBedroom']?.open).toBe(true)
    expect(s.doors['door-bath1']?.leaf).toBe('none')
    expect(s.doors['door-main']?.leaf).toBeUndefined()
    expect(s.doors['door-householdShelter']?.leaf).toBeUndefined()

    // Bare sanitary provisions: WC + basin per bathroom (2 baths → 4 points).
    const pts = s.floorPlan.plumbingPoints ?? []
    expect(pts.filter((p) => p.kind === 'soil-pipe')).toHaveLength(2)
    expect(pts.filter((p) => p.kind === 'water-point')).toHaveLength(2)

    // Baseline captured as the seeded shell (a new BTO has nothing to hack).
    expect(s.baselinePlan).toBe(s.floorPlan)

    // One undo step; undo restores the seeded furniture.
    expect(s.past.length).toBe(pastBefore + 1)
    useStore.getState().undo()
    expect(useStore.getState().items.some((i) => i.id === 'sofa')).toBe(true)
  })
})

describe('resetSlice — applyResaleAsIs', () => {
  beforeEach(() => {
    useStore.getState().__resetForTest()
  })

  it('captures the baseline and restores any removed door leaves', () => {
    // Simulate a prior bare seeding (a leaf removed).
    useStore.getState().applyBareBto()
    expect(useStore.getState().doors['door-mainBedroom']?.leaf).toBe('none')

    const pastBefore = useStore.getState().past.length
    useStore.getState().applyResaleAsIs()
    const s = useStore.getState()

    // Leaves restored across the board.
    expect(s.doors['door-mainBedroom']?.leaf).toBeUndefined()
    // Baseline is the current (previous owner's) plan.
    expect(s.baselinePlan).toBe(s.floorPlan)
    expect(s.past.length).toBe(pastBefore + 1)
  })
})

describe('resetSlice — applyResaleStripout', () => {
  beforeEach(() => {
    useStore.getState().__resetForTest()
  })

  it('keeps wet/kitchen fittings, strips furniture + wardrobes, screeds dry rooms', () => {
    useStore.getState().setItems([
      { id: 'wc', defId: 'toilet', position: [1, 1], rotation: 0, props: {} },
      { id: 'basin', defId: 'bathroom-sink', position: [1.5, 1], rotation: 0, props: {} },
      { id: 'hob', defId: 'hob', position: [6, 6], rotation: 0, props: {} },
      { id: 'sofa', defId: 'sofa-3seat', position: [3, 3], rotation: 0, props: {} },
      { id: 'wardrobe', defId: 'wardrobe-3door', position: [2, 2], rotation: 0, props: {} },
    ])
    useStore.getState().applyResaleStripout()
    const s = useStore.getState()

    const ids = s.items.map((i) => i.id).sort()
    expect(ids).toEqual(['basin', 'hob', 'wc'])

    // Dry rooms screeded; wet floors retained.
    expect(s.finishes.floor.mainBedroom).toBe(SCREED)
    expect(s.finishes.floor.bath1).not.toBe(SCREED)

    // Internal leaves removed (bare shell); baseline captured.
    expect(s.doors['door-mainBedroom']?.leaf).toBe('none')
    expect(s.baselinePlan).toBe(s.floorPlan)
  })
})
