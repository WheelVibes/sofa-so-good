import { describe, expect, it } from 'vitest'
import { buildDefaultPlan } from '../floorplan/defaultPlan'
import { placementWalls } from './placementWalls'

const base = { floorPlan: buildDefaultPlan(), doors: {} as Record<string, { open: boolean }> }

describe('placementWalls', () => {
  it('returns the room perimeter inside the per-room editor', () => {
    const walls = placementWalls({
      ...base,
      roomEditor: { active: true, roomId: 'mainBedroom' },
    })
    expect(walls).toBeDefined()
    expect(walls!.length).toBeGreaterThanOrEqual(3)
  })

  it('returns undefined on the default flat outside the editor (caller builds flat walls)', () => {
    expect(placementWalls({ ...base, roomEditor: { active: false, roomId: null } })).toBeUndefined()
  })

  it('falls back outside the editor for an active editor with a stale room id', () => {
    // No such room → roomEditorPlacementWalls returns undefined → fall through to
    // the plan branch (default flat → undefined).
    expect(
      placementWalls({ ...base, roomEditor: { active: true, roomId: 'ghost-room' } }),
    ).toBeUndefined()
  })
})
