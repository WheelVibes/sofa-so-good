import { beforeEach, describe, expect, it } from 'vitest'
import { useStore } from '../store'

describe('floorPlanSlice', () => {
  beforeEach(() => useStore.getState().__resetForTest())

  it('seeds the default plan and computes a non-trivial layout', () => {
    const plan = useStore.getState().floorPlan
    expect(plan.id).toBe('default-hdb-4room')
    expect(plan.rooms.length).toBeGreaterThan(5)
  })

  it('adds, updates and removes walls/rooms/openings', () => {
    const s = useStore.getState()
    const wid = s.addWall({ start: [0, 0], end: [2, 0], thickness: 'internal' })
    expect(useStore.getState().floorPlan.walls.some((w) => w.id === wid)).toBe(true)
    s.updateWall(wid, { thickness: 'external' })
    expect(useStore.getState().floorPlan.walls.find((w) => w.id === wid)!.thickness).toBe(
      'external',
    )
    const oid = s.addOpening({
      kind: 'door',
      wallId: wid,
      offset: 0.2,
      width: 0.8,
      sill: 0,
      head: 2.1,
    })
    expect(useStore.getState().floorPlan.openings.some((o) => o.id === oid)).toBe(true)
    // Removing the wall drops its openings.
    s.removeWall(wid)
    const after = useStore.getState().floorPlan
    expect(after.walls.some((w) => w.id === wid)).toBe(false)
    expect(after.openings.some((o) => o.id === oid)).toBe(false)
  })

  it('splits a wall into two segments at the midpoint, re-homing openings', () => {
    const s = useStore.getState()
    s.newFloorPlan('Split test')
    const wid = useStore.getState().addWall({ start: [0, 0], end: [4, 0], thickness: 'internal' })
    // One opening on the first half, one on the second half.
    const oA = useStore
      .getState()
      .addOpening({ kind: 'door', wallId: wid, offset: 0.5, width: 0.8, sill: 0, head: 2.1 })
    const oB = useStore
      .getState()
      .addOpening({ kind: 'window', wallId: wid, offset: 2.5, width: 0.8, sill: 0.9, head: 2.1 })
    useStore.getState().splitWall(wid, 0.5) // split at x=2
    const p = useStore.getState().floorPlan
    expect(p.walls.some((w) => w.id === wid)).toBe(false) // original gone
    // Two new walls meeting at the midpoint [2,0].
    const halves = p.walls.filter((w) => w.start[1] === 0 && w.end[1] === 0)
    const a = halves.find((w) => w.start[0] === 0 && w.end[0] === 2)
    const b = halves.find((w) => w.start[0] === 2 && w.end[0] === 4)
    expect(a).toBeDefined()
    expect(b).toBeDefined()
    // Opening A (offset 0.5) stays on the first half; B (offset 2.5) moves to
    // the second half with offset rebased to 0.5.
    const openA = p.openings.find((o) => o.id === oA)!
    const openB = p.openings.find((o) => o.id === oB)!
    expect(openA.wallId).toBe(a!.id)
    expect(openB.wallId).toBe(b!.id)
    expect(openB.offset).toBeCloseTo(0.5, 5)
  })

  it('moveWallVertex drags shared corner endpoints together', () => {
    const s = useStore.getState()
    s.newFloorPlan('Corner test')
    // Two walls meeting at [2,0].
    const w1 = useStore.getState().addWall({ start: [0, 0], end: [2, 0], thickness: 'internal' })
    const w2 = useStore.getState().addWall({ start: [2, 0], end: [2, 2], thickness: 'internal' })
    useStore.getState().moveWallVertex(w1, 'end', [3, 1])
    const p = useStore.getState().floorPlan
    const a = p.walls.find((w) => w.id === w1)!
    const b = p.walls.find((w) => w.id === w2)!
    expect(a.end).toEqual([3, 1])
    // The adjoining wall's shared start moved with it (corner stays joined).
    expect(b.start).toEqual([3, 1])
    // The far end of w2 is untouched.
    expect(b.end).toEqual([2, 2])
  })

  it('saves the active plan to the library and loads it back', () => {
    const s = useStore.getState()
    s.newFloorPlan('Test Apartment')
    s.updateFloorPlanMeta({ name: 'Test Apartment' })
    const savedId = s.saveCurrentPlan('Test Apartment')
    expect(useStore.getState().savedPlans.some((p) => p.id === savedId)).toBe(true)
    // Switch away, then load the saved one back.
    useStore.getState().resetFloorPlan()
    expect(useStore.getState().floorPlan.id).toBe('default-hdb-4room')
    useStore.getState().loadSavedPlan(savedId)
    expect(useStore.getState().floorPlan.name).toBe('Test Apartment')
  })

  it('makes Reset to HDB undoable (restores the custom plan)', () => {
    const s = useStore.getState()
    s.newFloorPlan('My Custom Flat')
    expect(useStore.getState().floorPlan.name).toBe('My Custom Flat')
    s.resetFloorPlan()
    expect(useStore.getState().floorPlan.id).toBe('default-hdb-4room')
    useStore.getState().undo()
    expect(useStore.getState().floorPlan.name).toBe('My Custom Flat')
  })

  it('re-saving under the same name updates rather than duplicates', () => {
    const s = useStore.getState()
    s.newFloorPlan('Dupe')
    s.saveCurrentPlan('Dupe')
    s.saveCurrentPlan('Dupe')
    expect(useStore.getState().savedPlans.filter((p) => p.name === 'Dupe').length).toBe(1)
  })
})
