import { describe, expect, it } from 'vitest'
import { ROOMS } from '../apartment/constants'
import { buildDefaultPlan } from '../floorplan/defaultPlan'
import { BUILTIN_CATALOG } from '../furniture/builtinCatalog'
import type { FurnitureItem } from '../furniture/types'
import { canPlace } from './placement'
import { roomEditorPlacementWalls } from './roomEditorWalls'

// A bedroom of the default flat — a fully-walled room to bound against.
const ROOM_ID = 'mainBedroom'

describe('roomEditorPlacementWalls', () => {
  it('returns the room perimeter as solid collision walls', () => {
    const walls = roomEditorPlacementWalls(buildDefaultPlan(), ROOM_ID)
    expect(walls).toBeDefined()
    expect(walls!.length).toBeGreaterThanOrEqual(3)
    for (const w of walls!) {
      expect(w.thickness).toBeGreaterThan(0)
      expect(Number.isFinite(w.ax + w.az + w.bx + w.bz)).toBe(true)
    }
  })

  it('returns undefined for an unknown room id (caller falls back)', () => {
    expect(roomEditorPlacementWalls(buildDefaultPlan(), 'no-such-room')).toBeUndefined()
  })

  it('blocks furniture that straddles a room wall', () => {
    const walls = roomEditorPlacementWalls(buildDefaultPlan(), ROOM_ID)!
    const room = ROOMS[ROOM_ID]
    const def = BUILTIN_CATALOG['nightstand']
    // Centre of the room: should be placeable.
    const cx = room.origin[0] + room.width / 2
    const cz = room.origin[1] + room.depth / 2
    const inside: FurnitureItem = {
      id: 't1',
      defId: def.id,
      position: [cx, cz],
      rotation: 0,
      props: {},
    }
    expect(canPlace(inside, def, { others: [], defs: BUILTIN_CATALOG, doors: {}, walls })).toBe(
      true,
    )
    // Sitting on a perimeter wall's midpoint: overlaps the wall → rejected.
    const w0 = walls[0]
    const onWall: FurnitureItem = {
      ...inside,
      position: [(w0.ax + w0.bx) / 2, (w0.az + w0.bz) / 2],
    }
    expect(canPlace(onWall, def, { others: [], defs: BUILTIN_CATALOG, doors: {}, walls })).toBe(
      false,
    )
  })
})
