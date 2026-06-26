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

  it('moveWallTo drags a wall and keeps connected walls joined at the corner', () => {
    useStore.getState().newFloorPlan('Connectivity test')
    // Two walls meeting at the corner (2,0): A = (0,0)->(2,0), B = (2,0)->(2,2).
    const a = useStore.getState().addWall({ start: [0, 0], end: [2, 0], thickness: 'internal' })
    const b = useStore.getState().addWall({ start: [2, 0], end: [2, 2], thickness: 'internal' })
    // Translate A by (0,1): its shared corner (2,0)->(2,1) should drag B's start.
    useStore.getState().moveWallTo(a, [0, 1], [2, 1])
    const A = useStore.getState().floorPlan.walls.find((w) => w.id === a)!
    const B = useStore.getState().floorPlan.walls.find((w) => w.id === b)!
    expect(A.start).toEqual([0, 1])
    expect(A.end).toEqual([2, 1])
    // B stays joined: its start followed the shared corner; its far end is fixed.
    expect(B.start).toEqual([2, 1])
    expect(B.end).toEqual([2, 2])
  })

  it('duplicates a wall as a new, unlocked, unnamed copy offset from the source', () => {
    useStore.getState().newFloorPlan('Dup wall test')
    const id = useStore.getState().addWall({ start: [0, 0], end: [2, 0], thickness: 'internal' })
    useStore.getState().updateWall(id, { name: 'Custom', locked: true })
    const newId = useStore.getState().duplicateWall(id)
    expect(newId).toBeTruthy()
    const copy = useStore.getState().floorPlan.walls.find((w) => w.id === newId)!
    expect(copy.start).toEqual([0.3, 0.3])
    expect(copy.end).toEqual([2.3, 0.3])
    expect(copy.name).toBeUndefined() // custom name not copied
    expect(copy.locked).toBeUndefined() // copy is editable
    expect(useStore.getState().planSelection).toEqual({ type: 'wall', id: newId })
  })

  it('duplicates an opening onto the same wall, nudged along it and clamped', () => {
    useStore.getState().newFloorPlan('Dup opening test')
    const wid = useStore.getState().addWall({ start: [0, 0], end: [4, 0], thickness: 'internal' })
    const oid = useStore
      .getState()
      .addOpening({ kind: 'door', wallId: wid, offset: 0.5, width: 0.9, sill: 0, head: 2.1 })
    const newId = useStore.getState().duplicateOpening(oid)
    const copy = useStore.getState().floorPlan.openings.find((o) => o.id === newId)!
    expect(copy.wallId).toBe(wid)
    expect(copy.offset).toBeCloseTo(1.4, 5) // 0.5 + width 0.9
    expect(copy.name).toBeUndefined()
    expect(useStore.getState().planSelection).toEqual({ type: 'opening', id: newId })
  })

  it('auto-names boundary walls on room allocation, never overriding a custom name', () => {
    useStore.getState().newFloorPlan('Naming test')
    for (const w of [...useStore.getState().floorPlan.walls]) useStore.getState().removeWall(w.id)
    // Four walls tracing a 4×3 rectangle.
    const top = useStore.getState().addWall({ start: [0, 0], end: [4, 0], thickness: 'internal' })
    const right = useStore.getState().addWall({ start: [4, 0], end: [4, 3], thickness: 'internal' })
    const bottom = useStore
      .getState()
      .addWall({ start: [4, 3], end: [0, 3], thickness: 'internal' })
    const left = useStore.getState().addWall({ start: [0, 3], end: [0, 0], thickness: 'internal' })
    // Give one wall a user-set custom name (nameAuto cleared) — it must survive.
    useStore.getState().updateWall(left, { name: 'My special wall', nameAuto: undefined })

    useStore.getState().addRoom({ name: 'Living', origin: [0, 0], width: 4, depth: 3 })
    const byId = (id: string) => useStore.getState().floorPlan.walls.find((w) => w.id === id)!
    expect(byId(top).name).toBe('Living wall 01')
    expect(byId(top).nameAuto).toBe(true)
    expect(byId(right).name).toBe('Living wall 02')
    expect(byId(bottom).name).toBe('Living wall 03')
    // The user-named wall is untouched.
    expect(byId(left).name).toBe('My special wall')
    expect(byId(left).nameAuto).toBeUndefined()

    // Re-allocating a room over the same walls re-names the auto ones but still
    // leaves the custom name alone.
    useStore.getState().addRoom({ name: 'Studio', origin: [0, 0], width: 4, depth: 3 })
    expect(byId(top).name).toBe('Studio wall 01')
    expect(byId(left).name).toBe('My special wall')
  })

  it('multi-selects walls, then bulk-locks and bulk-deletes them', () => {
    useStore.getState().newFloorPlan('Multi test')
    for (const w of [...useStore.getState().floorPlan.walls]) useStore.getState().removeWall(w.id)
    const a = useStore.getState().addWall({ start: [0, 0], end: [2, 0], thickness: 'internal' })
    const b = useStore.getState().addWall({ start: [2, 0], end: [2, 2], thickness: 'internal' })
    const c = useStore.getState().addWall({ start: [2, 2], end: [0, 2], thickness: 'internal' })
    // Primary select A, then add B and C to the multi-selection.
    useStore.getState().setPlanSelection({ type: 'wall', id: a })
    useStore.getState().toggleWallSelection(b)
    useStore.getState().toggleWallSelection(c)
    // C is the newest primary; A and B are the extras.
    expect(useStore.getState().planSelection).toEqual({ type: 'wall', id: c })
    expect(new Set(useStore.getState().selectedWallIds)).toEqual(new Set([a, b]))

    // Toggling C off promotes another wall to primary.
    useStore.getState().toggleWallSelection(c)
    expect(useStore.getState().planSelection?.type).toBe('wall')
    expect(useStore.getState().selectedWallIds.length).toBe(1)

    // Re-add C, then bulk-lock all three.
    useStore.getState().toggleWallSelection(c)
    useStore.getState().setWallsLocked([a, b, c], true)
    expect(useStore.getState().floorPlan.walls.filter((w) => w.locked).length).toBe(3)

    // removeWalls skips locked walls.
    useStore.getState().removeWalls([a, b, c])
    expect(useStore.getState().floorPlan.walls.length).toBe(3)

    // Unlock then bulk-delete: all gone, selection cleared.
    useStore.getState().setWallsLocked([a, b, c], false)
    useStore.getState().removeWalls([a, b, c])
    expect(useStore.getState().floorPlan.walls.length).toBe(0)
    expect(useStore.getState().planSelection).toBeNull()
    expect(useStore.getState().selectedWallIds).toEqual([])
  })

  it('setPlanMarqueeSelection populates item + wall selections atomically', () => {
    useStore.getState().newFloorPlan('Marquee test')
    for (const w of [...useStore.getState().floorPlan.walls]) useStore.getState().removeWall(w.id)
    const w1 = useStore.getState().addWall({ start: [0, 0], end: [2, 0], thickness: 'internal' })
    const w2 = useStore.getState().addWall({ start: [2, 0], end: [2, 2], thickness: 'internal' })

    // Furniture + walls together: walls → primary + extras; items → multi-set.
    useStore.getState().setPlanMarqueeSelection(['i1', 'i2'], [w1, w2])
    expect(useStore.getState().planSelection).toEqual({ type: 'wall', id: w1 })
    expect(useStore.getState().selectedWallIds).toEqual([w2])
    expect(useStore.getState().selectedItemIds).toEqual(['i1', 'i2'])
    expect(useStore.getState().selectedItemId).toBe('i2')

    // Furniture only: no plan element selected (the furniture inspector owns it).
    useStore.getState().setPlanMarqueeSelection(['i3'], [])
    expect(useStore.getState().planSelection).toBeNull()
    expect(useStore.getState().selectedWallIds).toEqual([])
    expect(useStore.getState().selectedItemIds).toEqual(['i3'])

    // Walls only: clears the item selection.
    useStore.getState().setPlanMarqueeSelection([], [w1])
    expect(useStore.getState().planSelection).toEqual({ type: 'wall', id: w1 })
    expect(useStore.getState().selectedItemIds).toEqual([])
    expect(useStore.getState().selectedItemId).toBeNull()
  })

  it('a plain selection clears the multi-selection extras', () => {
    useStore.getState().newFloorPlan('Multi clear test')
    const a = useStore.getState().addWall({ start: [0, 0], end: [2, 0], thickness: 'internal' })
    const b = useStore.getState().addWall({ start: [2, 0], end: [2, 2], thickness: 'internal' })
    useStore.getState().setPlanSelection({ type: 'wall', id: a })
    useStore.getState().toggleWallSelection(b)
    expect(useStore.getState().selectedWallIds.length).toBe(1)
    useStore.getState().setPlanSelection({ type: 'wall', id: a })
    expect(useStore.getState().selectedWallIds).toEqual([])
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

  it('duplicateLevel clones a storey: geometry (fresh ids), items + finishes', () => {
    // Build an upper storey with a room, a wall+window, a finish and an item.
    const lvl = useStore.getState().addLevel()
    const roomId = useStore
      .getState()
      .addRoom({ name: 'Studio', origin: [0, 0], width: 3, depth: 3 }, lvl)
    const wid = useStore
      .getState()
      .addWall({ start: [0, 0], end: [3, 0], thickness: 'internal' }, lvl)
    useStore
      .getState()
      .addOpening({ kind: 'window', wallId: wid, offset: 0.5, width: 1, sill: 0.9, head: 2.1 }, lvl)
    useStore.getState().setFloorFinish(roomId as never, 'floor-carpet-grey')
    useStore.getState().addItem({ defId: 'bed-double', position: [1, 1], rotation: 0, props: {} })
    const itemId = useStore.getState().items.at(-1)?.id as string
    useStore.setState((s) => ({
      items: s.items.map((it) => (it.id === itemId ? { ...it, levelId: lvl } : it)),
    }))

    const newId = useStore.getState().duplicateLevel(lvl)
    expect(newId).toBeTruthy()
    const s = useStore.getState()
    const dup = s.floorPlan.upperLevels?.find((l) => l.id === newId)
    expect(dup).toBeTruthy()
    // Fresh, non-colliding ids for the cloned geometry.
    expect(dup?.rooms[0].id).not.toBe(roomId)
    expect(dup?.walls[0].id).not.toBe(wid)
    // The cloned opening points at the cloned wall, not the source one.
    expect(dup?.openings[0].wallId).toBe(dup?.walls[0].id)
    // The room's floor finish carried over to the new room id.
    const newRoomId = dup?.rooms[0].id as string
    expect((s.finishes.floor as Record<string, string>)[newRoomId]).toBe('floor-carpet-grey')
    // The item was cloned onto the new level (fresh id, same def).
    const dupItems = s.items.filter((it) => it.levelId === newId)
    expect(dupItems).toHaveLength(1)
    expect(dupItems[0].id).not.toBe(itemId)
    expect(dupItems[0].defId).toBe('bed-double')
  })

  it('duplicateLevel returns null for an unknown source', () => {
    expect(useStore.getState().duplicateLevel('nope')).toBeNull()
  })

  it('adds, edits, drags and removes plan notes (PARITY-DIMTEXT)', () => {
    const id = useStore.getState().addNote({ x: 2, z: 3, text: 'TV wall' })
    expect(useStore.getState().floorPlan.notes?.find((n) => n.id === id)?.text).toBe('TV wall')
    useStore.getState().updateNote(id, { text: 'Feature wall', x: 4 })
    const note = useStore.getState().floorPlan.notes?.find((n) => n.id === id)
    expect(note).toMatchObject({ text: 'Feature wall', x: 4, z: 3 })
    // Selecting then removing clears the selection.
    useStore.getState().setPlanSelection({ type: 'note', id })
    useStore.getState().removeNote(id)
    expect(useStore.getState().floorPlan.notes?.some((n) => n.id === id)).toBe(false)
    expect(useStore.getState().planSelection).toBeNull()
  })

  it('adds and removes custom dimension lines (PARITY-DIMTEXT)', () => {
    const id = useStore.getState().addDimension({ a: [0, 0], b: [3, 0] })
    expect(useStore.getState().floorPlan.dimensions?.find((d) => d.id === id)?.b).toEqual([3, 0])
    useStore.getState().setPlanSelection({ type: 'dim', id })
    useStore.getState().removeDimension(id)
    expect(useStore.getState().floorPlan.dimensions?.some((d) => d.id === id)).toBe(false)
    expect(useStore.getState().planSelection).toBeNull()
  })

  it('adds, restyles and removes polyline annotations (PARITY-POLYLINE)', () => {
    const id = useStore.getState().addPolyline({
      points: [
        [0, 0],
        [2, 0],
        [2, 2],
      ],
    })
    const made = useStore.getState().floorPlan.polylines?.find((p) => p.id === id)
    expect(made?.points).toHaveLength(3)
    expect(made?.closed).toBeUndefined()
    // Restyle: close the loop + dash it.
    useStore.getState().updatePolyline(id, { closed: true, dashed: true })
    const styled = useStore.getState().floorPlan.polylines?.find((p) => p.id === id)
    expect(styled).toMatchObject({ closed: true, dashed: true })
    // Selecting then removing clears the selection.
    useStore.getState().setPlanSelection({ type: 'polyline', id })
    useStore.getState().removePolyline(id)
    expect(useStore.getState().floorPlan.polylines?.some((p) => p.id === id)).toBe(false)
    expect(useStore.getState().planSelection).toBeNull()
  })
})

describe('per-storey editing — level routing for the 2D editor (F13/ML4b)', () => {
  beforeEach(() => {
    useStore.getState().__resetForTest()
  })

  it('updateRoom finds and patches a room on an upper level', () => {
    const lvl = useStore.getState().addLevel()
    const roomId = useStore
      .getState()
      .addRoom({ name: 'Loft room', origin: [0, 0], width: 3, depth: 3 }, lvl)
    const groundBefore = useStore.getState().floorPlan.rooms
    useStore.getState().updateRoom(roomId, { name: 'Renamed', width: 4 })
    const s = useStore.getState()
    const up = s.floorPlan.upperLevels?.[0].rooms.find((r) => r.id === roomId)
    expect(up?.name).toBe('Renamed')
    expect(up?.width).toBe(4)
    // Ground rooms untouched (same array reference — no realloc on upper edits).
    expect(s.floorPlan.rooms).toBe(groundBefore)
  })

  it('setRoomCeiling patches and clears a ceiling on an upper-level room', () => {
    const lvl = useStore.getState().addLevel()
    const roomId = useStore
      .getState()
      .addRoom({ name: 'Up', origin: [0, 0], width: 3, depth: 3 }, lvl)
    useStore.getState().setRoomCeiling(roomId, { style: 'tray', drop: 0.2 })
    const room = () => useStore.getState().floorPlan.upperLevels?.[0].rooms[0]
    expect(room()?.ceiling).toEqual({ style: 'tray', drop: 0.2 })
    useStore.getState().setRoomCeiling(roomId, null)
    expect(room()?.ceiling).toBeUndefined()
  })

  it('splitWall with a levelId splits the upper wall and re-homes its openings', () => {
    const lvl = useStore.getState().addLevel()
    const wid = useStore
      .getState()
      .addWall({ start: [0, 0], end: [4, 0], thickness: 'internal' }, lvl)
    const oid = useStore
      .getState()
      .addOpening(
        { kind: 'window', wallId: wid, offset: 2.5, width: 0.8, sill: 0.9, head: 2.1 },
        lvl,
      )
    const groundWalls = useStore.getState().floorPlan.walls
    useStore.getState().splitWall(wid, 0.5, lvl)
    const s = useStore.getState()
    const up = s.floorPlan.upperLevels?.[0]
    expect(up?.walls.some((w) => w.id === wid)).toBe(false) // original gone
    const a = up?.walls.find((w) => w.start[0] === 0 && w.end[0] === 2)
    const b = up?.walls.find((w) => w.start[0] === 2 && w.end[0] === 4)
    expect(a).toBeDefined()
    expect(b).toBeDefined()
    // The opening past the split moved to the second half, offset rebased.
    const open = up?.openings.find((o) => o.id === oid)
    expect(open?.wallId).toBe(b?.id)
    expect(open?.offset).toBeCloseTo(0.5, 5)
    // Selection moved to the first half; ground walls untouched.
    expect(s.planSelection).toEqual({ type: 'wall', id: a?.id })
    expect(s.floorPlan.walls).toBe(groundWalls)
  })

  it('moveWallVertex with a levelId drags shared corners on that level only', () => {
    const lvl = useStore.getState().addLevel()
    const w1 = useStore
      .getState()
      .addWall({ start: [0, 0], end: [2, 0], thickness: 'internal' }, lvl)
    const w2 = useStore
      .getState()
      .addWall({ start: [2, 0], end: [2, 2], thickness: 'internal' }, lvl)
    // A ground wall sharing the same corner coordinates must NOT move.
    const gw = useStore.getState().addWall({ start: [2, 0], end: [5, 0], thickness: 'internal' })
    useStore.getState().moveWallVertex(w1, 'end', [3, 1], lvl)
    const s = useStore.getState()
    const up = s.floorPlan.upperLevels?.[0]
    expect(up?.walls.find((w) => w.id === w1)?.end).toEqual([3, 1])
    expect(up?.walls.find((w) => w.id === w2)?.start).toEqual([3, 1])
    expect(s.floorPlan.walls.find((w) => w.id === gw)?.start).toEqual([2, 0])
  })
})
