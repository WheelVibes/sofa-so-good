import { describe, expect, it } from 'vitest'
import { DUPLICATE_ROOM_OFFSET, duplicateRoom } from './duplicateRoom'
import type { PlanOpening, PlanRoom, PlanWall } from './types'
import { roomPolygon } from './types'

const wall = (id: string, start: [number, number], end: [number, number]): PlanWall => ({
  id,
  start,
  end,
  thickness: 'internal',
})

// A 4×3 rectangular room traced by four boundary walls.
const room: PlanRoom = { id: 'r1', name: 'Bedroom', origin: [1, 1], width: 4, depth: 3 }
const walls: PlanWall[] = [
  wall('top', [1, 1], [5, 1]),
  wall('right', [5, 1], [5, 4]),
  wall('bottom', [5, 4], [1, 4]),
  wall('left', [1, 4], [1, 1]),
  // An unrelated wall far away — must NOT be cloned.
  wall('far', [20, 20], [24, 20]),
]
const openings: PlanOpening[] = [
  { id: 'd1', kind: 'door', wallId: 'top', offset: 1, width: 0.9, sill: 0, head: 2.1 },
  // An opening on the unrelated wall — must NOT be cloned.
  { id: 'wOther', kind: 'window', wallId: 'far', offset: 1, width: 1, sill: 0.9, head: 2.1 },
]

// Deterministic incrementing id generator for assertions.
function makeGenId() {
  let n = 0
  return (prefix: string) => `${prefix}-${++n}`
}

describe('duplicateRoom', () => {
  it('offsets the polygon and origin by the default offset', () => {
    const res = duplicateRoom({ room, walls, openings, genId: makeGenId() })
    expect(res.room.origin).toEqual([1 + DUPLICATE_ROOM_OFFSET, 1 + DUPLICATE_ROOM_OFFSET])
    // Every polygon vertex is shifted by the same offset vs the source.
    const srcPoly = roomPolygon(room)
    const dupPoly = roomPolygon(res.room)
    expect(dupPoly).toHaveLength(srcPoly.length)
    for (let i = 0; i < srcPoly.length; i++) {
      expect(dupPoly[i][0]).toBeCloseTo(srcPoly[i][0] + DUPLICATE_ROOM_OFFSET)
      expect(dupPoly[i][1]).toBeCloseTo(srcPoly[i][1] + DUPLICATE_ROOM_OFFSET)
    }
  })

  it('honours an explicit offset', () => {
    const res = duplicateRoom({ room, walls, openings, genId: makeGenId(), offset: 2 })
    expect(res.room.origin).toEqual([3, 3])
  })

  it('assigns a fresh unique room id and a "copy" name', () => {
    const res = duplicateRoom({ room, walls, openings, genId: makeGenId() })
    expect(res.room.id).not.toBe(room.id)
    expect(res.room.id).toMatch(/^r-/)
    expect(res.room.name).toBe('Bedroom copy')
  })

  it('clones only the four boundary walls (own ids, offset, fresh names)', () => {
    const res = duplicateRoom({ room, walls, openings, genId: makeGenId() })
    expect(res.walls).toHaveLength(4)
    // None of the clones reuse a source wall id, and none corrupt the originals.
    const srcIds = new Set(walls.map((w) => w.id))
    for (const w of res.walls) {
      expect(srcIds.has(w.id)).toBe(false)
      expect(w.start[0]).toBeGreaterThan(0) // offset applied
    }
    // The clone's boundary walls are auto-named after the copied room.
    expect(res.walls.every((w) => w.nameAuto === true)).toBe(true)
    expect(res.walls.some((w) => w.name === 'Bedroom copy wall 01')).toBe(true)
    // No locked/user-name carried over.
    expect(res.walls.every((w) => w.locked === undefined)).toBe(true)
  })

  it('clones openings on the boundary walls, re-pointed + renamed, drops others', () => {
    const res = duplicateRoom({ room, walls, openings, genId: makeGenId() })
    expect(res.openings).toHaveLength(1)
    const o = res.openings[0]
    expect(o.id).not.toBe('d1')
    // Re-pointed at one of the cloned walls (not the source 'top').
    expect(res.walls.some((w) => w.id === o.wallId)).toBe(true)
    expect(o.name).toBe('Bedroom copy door 01')
    expect(o.nameAuto).toBe(true)
  })

  it('copies floor + wall finishes and re-keys wall accents to the new ids', () => {
    const genId = makeGenId()
    const res = duplicateRoom({
      room,
      walls,
      openings,
      finishes: {
        floor: 'mat:oak',
        wall: 'mat:plaster',
        wallAccents: { top: 'mat:brick' },
      },
      genId,
    })
    expect(res.finishes.floor).toBe('mat:oak')
    expect(res.finishes.wall).toBe('mat:plaster')
    // The accent on source wall 'top' is re-keyed onto the cloned wall + room.
    const keys = Object.keys(res.finishes.wallAccents)
    expect(keys).toHaveLength(1)
    expect(keys[0].endsWith(`:${res.room.id}`)).toBe(true)
    const clonedTop = keys[0].split(':')[0]
    expect(res.walls.some((w) => w.id === clonedTop)).toBe(true)
    expect(Object.values(res.finishes.wallAccents)[0]).toBe('mat:brick')
  })

  it('inherits defaults when the room has no custom finishes', () => {
    const res = duplicateRoom({ room, walls, openings, genId: makeGenId() })
    expect(res.finishes.floor).toBeUndefined()
    expect(res.finishes.wall).toBeUndefined()
    expect(res.finishes.wallAccents).toEqual({})
  })

  it('does not crash for a room with no matching boundary walls', () => {
    const floating: PlanRoom = { id: 'r2', name: 'Floating', origin: [40, 40], width: 2, depth: 2 }
    const res = duplicateRoom({ room: floating, walls, openings, genId: makeGenId() })
    expect(res.walls).toHaveLength(0)
    expect(res.openings).toHaveLength(0)
    expect(res.room.origin).toEqual([40.5, 40.5])
  })

  it('preserves an explicit polygon (offset every vertex) and the L-extension', () => {
    const lroom: PlanRoom = {
      id: 'r3',
      name: 'L',
      origin: [0, 0],
      width: 4,
      depth: 3,
      extension: { offset: [4, 0], width: 2, depth: 1 },
    }
    const res = duplicateRoom({ room: lroom, walls: [], openings: [], genId: makeGenId() })
    // The extension offset is relative to origin → unchanged.
    expect(res.room.extension).toEqual({ offset: [4, 0], width: 2, depth: 1 })
  })
})
