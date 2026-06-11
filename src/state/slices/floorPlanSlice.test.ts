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

  it('makes loading a saved plan undoable', () => {
    const s = useStore.getState()
    s.newFloorPlan('Plan A')
    const idA = s.saveCurrentPlan('Plan A')
    s.newFloorPlan('Plan B') // current working plan
    useStore.getState().loadSavedPlan(idA)
    expect(useStore.getState().floorPlan.name).toBe('Plan A')
    useStore.getState().undo()
    expect(useStore.getState().floorPlan.name).toBe('Plan B')
  })

  it('re-saving under the same name updates rather than duplicates', () => {
    const s = useStore.getState()
    s.newFloorPlan('Dupe')
    s.saveCurrentPlan('Dupe')
    s.saveCurrentPlan('Dupe')
    expect(useStore.getState().savedPlans.filter((p) => p.name === 'Dupe').length).toBe(1)
  })
})

describe('multi-storey level editing (F13/ML4a)', () => {
  beforeEach(() => {
    useStore.getState().__resetForTest()
  })

  it('addLevel appends an empty storey above the ceiling and is undoable', () => {
    const id = useStore.getState().addLevel('Loft')
    const plan = useStore.getState().floorPlan
    const lvl = plan.upperLevels?.find((l) => l.id === id)
    expect(lvl?.name).toBe('Loft')
    expect(lvl?.elevation).toBeCloseTo(plan.ceilingHeight + 0.3, 5)
    useStore.getState().undo()
    expect(useStore.getState().floorPlan.upperLevels ?? []).toHaveLength(0)
  })

  it('geometry actions route to the targeted level', () => {
    const lvl = useStore.getState().addLevel()
    const wallId = useStore
      .getState()
      .addWall({ start: [0, 0], end: [3, 0], thickness: 'internal' }, lvl)
    const roomId = useStore
      .getState()
      .addRoom({ name: 'Up', origin: [0, 0], width: 3, depth: 3 }, lvl)
    const s = useStore.getState()
    const up = s.floorPlan.upperLevels?.[0]
    expect(up?.walls.map((w) => w.id)).toEqual([wallId])
    expect(up?.rooms.map((r) => r.id)).toEqual([roomId])
    // Ground arrays untouched by the routed adds.
    expect(s.floorPlan.walls.some((w) => w.id === wallId)).toBe(false)
    // Update + remove route too.
    s.updateWall(wallId, { thickness: 'external' }, lvl)
    expect(useStore.getState().floorPlan.upperLevels?.[0].walls[0].thickness).toBe('external')
    s.removeWall(wallId, lvl)
    expect(useStore.getState().floorPlan.upperLevels?.[0].walls).toHaveLength(0)
  })

  it('removeLevel drops the storey, its items and its finish keys', () => {
    const lvl = useStore.getState().addLevel()
    const roomId = useStore
      .getState()
      .addRoom({ name: 'Up', origin: [0, 0], width: 3, depth: 3 }, lvl)
    useStore.getState().addItem({ defId: 'bed-double', position: [1, 1], rotation: 0, props: {} })
    const upId = useStore.getState().items.at(-1)?.id as string
    useStore.setState((s) => ({
      items: s.items.map((it) => (it.id === upId ? { ...it, levelId: lvl } : it)),
    }))
    useStore.getState().setFloorFinish(roomId as never, 'floor-carpet-grey')
    useStore.getState().removeLevel(lvl)
    const s = useStore.getState()
    expect(s.floorPlan.upperLevels ?? []).toHaveLength(0)
    expect(s.items.some((it) => it.id === upId)).toBe(false)
    expect((s.finishes.floor as Record<string, string>)[roomId]).toBeUndefined()
    expect(s.floorPlan.rooms.some((r) => r.id === roomId)).toBe(false)
  })

  it('removeLevel is a no-op for ground/unknown ids', () => {
    const before = useStore.getState().floorPlan
    useStore.getState().removeLevel('ground')
    useStore.getState().removeLevel('nope')
    expect(useStore.getState().floorPlan).toBe(before)
  })
})
