import { beforeEach, describe, expect, it } from 'vitest'
import { useStore } from '../store'

describe('floor-plan edits are undoable', () => {
  beforeEach(() => useStore.getState().__resetForTest())

  it('undo removes a freshly-drawn wall', () => {
    const s = useStore.getState()
    const before = s.floorPlan.walls.length
    s.addWall({ start: [0, 0], end: [3, 0], thickness: 'internal' })
    expect(useStore.getState().floorPlan.walls.length).toBe(before + 1)
    useStore.getState().undo()
    expect(useStore.getState().floorPlan.walls.length).toBe(before)
    useStore.getState().redo()
    expect(useStore.getState().floorPlan.walls.length).toBe(before + 1)
  })

  it('undo restores a removed room', () => {
    const s = useStore.getState()
    const id = s.floorPlan.rooms[0]?.id
    if (!id) return
    const before = useStore.getState().floorPlan.rooms.length
    useStore.getState().removeRoom(id)
    expect(useStore.getState().floorPlan.rooms.length).toBe(before - 1)
    useStore.getState().undo()
    expect(useStore.getState().floorPlan.rooms.length).toBe(before)
  })

  it('undo restores the prior plan after New apartment (BUG-013)', () => {
    const before = useStore.getState().floorPlan
    const nameBefore = before.name
    const roomsBefore = before.rooms.length
    useStore.getState().newFloorPlan('Blank')
    expect(useStore.getState().floorPlan.name).toBe('Blank') // plan replaced
    useStore.getState().undo()
    // Prior plan fully restored — the "New apartment" action is undoable.
    expect(useStore.getState().floorPlan.name).toBe(nameBefore)
    expect(useStore.getState().floorPlan.rooms.length).toBe(roomsBefore)
  })
})
