import { describe, expect, it } from 'vitest'
import { WALLS } from '../apartment/constants'
import { buildDefaultPlan } from './defaultPlan'
import { pointInRoom, roomPolygon } from './types'

describe('buildDefaultPlan', () => {
  it('copies each wall spec structural classification onto the plan wall', () => {
    const plan = buildDefaultPlan()
    const byId = new Map(plan.walls.map((w) => [w.id, w]))
    for (const spec of WALLS) {
      expect(byId.get(spec.id)?.structure, spec.id).toBe(spec.structure)
    }
  })

  it('seeds the household-shelter ring as load-bearing (never hackable)', () => {
    const plan = buildDefaultPlan()
    const hs = plan.walls.filter((w) =>
      ['wall-int-hs-N', 'wall-int-hs-S', 'wall-int-bath2-hs', 'wall-int-shelter-LD'].includes(w.id),
    )
    expect(hs).toHaveLength(4)
    for (const w of hs) expect(w.structure, w.id).toBe('load-bearing')
  })

  it('keeps the household-shelter blast door inside its (split) host wall', () => {
    const plan = buildDefaultPlan()
    const door = plan.openings.find((o) => o.id === 'door-householdShelter')!
    const wall = plan.walls.find((w) => w.id === door.wallId)!
    const len = Math.hypot(wall.end[0] - wall.start[0], wall.end[1] - wall.start[1])
    expect(door.offset).toBeGreaterThanOrEqual(0)
    expect(door.offset + door.width).toBeLessThanOrEqual(len)
  })

  // REGRESSION (room-overlap bug): the source `ROOMS` rects deliberately
  // overlap — livingDining's main rect reaches west into bedroom3 and the
  // corridor, which only the floor renderer's carve resolved. Everything else
  // reading the plan (the hover highlight, the room editor, area labels, the
  // minimap) drew the raw rect, so hovering Living/Dining lit up a slab
  // covering the corridor too. `buildDefaultPlan` now hands out the carved
  // polygon instead.
  it('gives every room a footprint that overlaps no other room', () => {
    const plan = buildDefaultPlan()
    // Sample on a 0.05 m-offset grid: all room coordinates are multiples of
    // 0.05, so no sample can land ambiguously on a shared edge.
    const step = 0.1
    let sampled = 0
    for (let x = 0.025; x < 13; x += step) {
      for (let z = 0.025; z < 9.5; z += step) {
        const hits = plan.rooms.filter((r) => pointInRoom(r, x, z))
        if (hits.length > 0) sampled++
        expect(hits.map((r) => r.id).join('+'), `(${x.toFixed(3)}, ${z.toFixed(3)})`).toBe(
          hits[0]?.id ?? '',
        )
      }
    }
    expect(sampled).toBeGreaterThan(1000)
  })

  it('describes living/dining as its true outline, clear of bedroom 3 and the corridor', () => {
    const plan = buildDefaultPlan()
    const ld = plan.rooms.find((r) => r.id === 'livingDining')!
    const b3 = plan.rooms.find((r) => r.id === 'bedroom3')!
    const corridor = plan.rooms.find((r) => r.id === 'corridor')!
    // A rect + one L-extension can't express it, so it carries a polygon.
    expect(roomPolygon(ld).length).toBeGreaterThan(6)
    // Points that used to fall inside livingDining's raw rect.
    expect(pointInRoom(b3, 8.7, 2.5)).toBe(true)
    expect(pointInRoom(ld, 8.7, 2.5)).toBe(false)
    expect(pointInRoom(corridor, 8.7, 4.3)).toBe(true)
    expect(pointInRoom(ld, 8.7, 4.3)).toBe(false)
    // ...while the open strip east of the household shelter is still its own.
    expect(pointInRoom(ld, 8.7, 6.0)).toBe(true)
  })
})
