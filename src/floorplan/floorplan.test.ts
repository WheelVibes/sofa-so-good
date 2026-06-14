import { describe, expect, it } from 'vitest'
import { INTERIOR_AREA_M2 } from '../apartment/constants'
import { buildDefaultPlan } from './defaultPlan'
import { planLevels } from './levels'
import { PLAN_TEMPLATES, templateCategoryTree } from './templates'
import {
  type PlanRoom,
  planRoomArea,
  planTotalArea,
  pointInPolygon,
  pointInRoom,
  polygonArea,
  rectUnionOutline,
  roomPolygon,
  wallLength,
} from './types'

describe('rectUnionOutline / roomPolygon L-shapes', () => {
  it('builds a correct L outline for an extension on ANY side (not just south)', () => {
    // Main 4×4 at origin; extension 2×2 jutting off the NORTH edge (offset z<0
    // region) — the old code only handled south extensions.
    const main: PlanRoom = {
      id: 'm',
      name: 'M',
      origin: [0, 0],
      width: 4,
      depth: 4,
      extension: { offset: [0, -2], width: 2, depth: 2 },
    }
    const poly = roomPolygon(main)
    // Closed simple polygon; area = 16 + 4 = 20 (the two rects don't overlap).
    expect(poly.length).toBeGreaterThanOrEqual(6)
    expect(polygonArea(poly)).toBeCloseTo(20, 5)
    // A point inside the north extension is inside the outline.
    expect(pointInPolygon(1, -1, poly)).toBe(true)
    // A point in the notch (outside both rects) is NOT inside.
    expect(pointInPolygon(3, -1, poly)).toBe(false)
  })

  it('rectUnionOutline merges overlapping rects without double-counting area', () => {
    // Two 3×3 rects overlapping in a 1×1 corner → union area = 9 + 9 - 1 = 17.
    const poly = rectUnionOutline([
      [0, 0, 3, 3],
      [2, 2, 5, 5],
    ])
    expect(polygonArea(poly)).toBeCloseTo(17, 5)
  })
})

describe('floor plan model', () => {
  it('builds a default plan from the fixed flat', () => {
    const plan = buildDefaultPlan()
    expect(plan.walls.length).toBeGreaterThan(10)
    expect(plan.rooms.length).toBeGreaterThan(5)
    expect(plan.openings.some((o) => o.kind === 'door')).toBe(true)
    expect(plan.openings.some((o) => o.kind === 'window')).toBe(true)
    expect(plan.ceilingHeight).toBeCloseTo(2.6, 6)
  })

  it('computes room and total areas (incl. L-shape extensions)', () => {
    expect(planRoomArea({ id: 'a', name: 'A', origin: [0, 0], width: 3, depth: 4 })).toBe(12)
    expect(
      planRoomArea({
        id: 'b',
        name: 'B',
        origin: [0, 0],
        width: 3,
        depth: 4,
        extension: { offset: [3, 0], width: 2, depth: 2 },
      }),
    ).toBe(16)
  })

  it("default plan's total area matches the fixed flat's interior area", () => {
    // buildDefaultPlan seeds every ROOM (incl. acLedge); INTERIOR_AREA_M2 sums
    // the non-external rooms. The plan total should be at least that.
    const total = planTotalArea(buildDefaultPlan())
    expect(total).toBeGreaterThanOrEqual(INTERIOR_AREA_M2 - 0.01)
  })

  it('measures wall length', () => {
    expect(wallLength({ id: 'w', start: [0, 0], end: [3, 4], thickness: 'internal' })).toBe(5)
  })

  it('computes polygon area via shoelace (incl. an L-shape notch)', () => {
    // A 4x4 square.
    expect(
      polygonArea([
        [0, 0],
        [4, 0],
        [4, 4],
        [0, 4],
      ]),
    ).toBe(16)
    // An L: 4x4 square minus a 2x2 corner notch = 12.
    expect(
      polygonArea([
        [0, 0],
        [4, 0],
        [4, 2],
        [2, 2],
        [2, 4],
        [0, 4],
      ]),
    ).toBe(12)
  })

  it('point-in-polygon respects the L notch', () => {
    const L: [number, number][] = [
      [0, 0],
      [4, 0],
      [4, 2],
      [2, 2],
      [2, 4],
      [0, 4],
    ]
    expect(pointInPolygon(1, 1, L)).toBe(true) // inside the main body
    expect(pointInPolygon(3, 3, L)).toBe(false) // inside the cut-out notch
  })

  it('planRoomArea + pointInRoom use the explicit polygon when present', () => {
    const room = {
      id: 'p',
      name: 'Poly',
      origin: [0, 0] as [number, number],
      width: 4,
      depth: 4,
      polygon: [
        [0, 0],
        [4, 0],
        [4, 2],
        [2, 2],
        [2, 4],
        [0, 4],
      ] as [number, number][],
    }
    expect(planRoomArea(room)).toBe(12) // not 16 (the bbox)
    expect(pointInRoom(room, 1, 1)).toBe(true)
    expect(pointInRoom(room, 3, 3)).toBe(false) // in the notch
    // roomPolygon returns the explicit outline verbatim.
    expect(roomPolygon(room)).toHaveLength(6)
  })
})

describe('plan templates', () => {
  it('each template is well-formed (unique ids across all storeys, positive areas)', () => {
    for (const tpl of PLAN_TEMPLATES) {
      expect(tpl.walls.length).toBeGreaterThanOrEqual(4)
      expect(tpl.rooms.length).toBeGreaterThan(0)
      expect(planTotalArea(tpl)).toBeGreaterThan(5)
      // Wall / opening / room ids must be unique across EVERY storey (room ids
      // are plan-unique by design — finishes/score/reports key on them).
      const levels = planLevels(tpl)
      const allWalls = levels.flatMap((l) => l.walls)
      const allOpenings = levels.flatMap((l) => l.openings)
      const allRooms = levels.flatMap((l) => l.rooms)
      expect(new Set(allWalls.map((w) => w.id)).size).toBe(allWalls.length)
      expect(new Set(allOpenings.map((o) => o.id)).size).toBe(allOpenings.length)
      expect(new Set(allRooms.map((r) => r.id)).size).toBe(allRooms.length)
    }
  })

  // Generalised across EVERY template (studio/loft starters + all HDB types +
  // the condo / landed set) and EVERY storey of each template: no overlapping
  // rooms, every room in-bounds of the footprint.
  it('every template storey has no overlapping rooms and stays within the footprint', () => {
    // Keep the count honest as templates are added.
    expect(PLAN_TEMPLATES.length).toBeGreaterThanOrEqual(19)
    for (const tpl of PLAN_TEMPLATES) {
      const [W, D] = tpl.extent
      for (const level of planLevels(tpl)) {
        const rects = level.rooms.map((r) => ({
          id: r.id,
          x0: r.origin[0],
          z0: r.origin[1],
          x1: r.origin[0] + r.width,
          z1: r.origin[1] + r.depth,
        }))
        for (const r of rects) {
          expect(r.x0, `${tpl.id}/${level.id}: ${r.id} x0`).toBeGreaterThanOrEqual(-1e-6)
          expect(r.z0, `${tpl.id}/${level.id}: ${r.id} z0`).toBeGreaterThanOrEqual(-1e-6)
          expect(r.x1, `${tpl.id}/${level.id}: ${r.id} x1`).toBeLessThanOrEqual(W + 1e-6)
          expect(r.z1, `${tpl.id}/${level.id}: ${r.id} z1`).toBeLessThanOrEqual(D + 1e-6)
        }
        // No two rooms overlap (shared edges fine — strict interior overlap only).
        for (let i = 0; i < rects.length; i++) {
          for (let j = i + 1; j < rects.length; j++) {
            const a = rects[i]!
            const b = rects[j]!
            const overlap =
              a.x0 < b.x1 - 1e-6 && b.x0 < a.x1 - 1e-6 && a.z0 < b.z1 - 1e-6 && b.z0 < a.z1 - 1e-6
            expect(overlap, `${tpl.id}/${level.id}: ${a.id} overlaps ${b.id}`).toBe(false)
          }
        }
      }
    }
  })

  it('every template (and the default plan) carries a full category', () => {
    for (const tpl of PLAN_TEMPLATES) {
      expect(tpl.category, `${tpl.id} missing category`).toBeDefined()
      expect(['HDB', 'Condominium']).toContain(tpl.category?.housingType)
      expect(tpl.category?.projectName?.length, `${tpl.id} project`).toBeGreaterThan(0)
      expect(tpl.category?.apartmentType?.length, `${tpl.id} apt`).toBeGreaterThan(0)
    }
    // The default plan is HDB › Serangoon North Vista › 4-Room.
    expect(buildDefaultPlan().category).toEqual({
      housingType: 'HDB',
      projectName: 'Serangoon North Vista',
      apartmentType: '4-Room',
    })
  })

  it('templateCategoryTree groups by housing type → project → apartment, preserving order', () => {
    const tree = templateCategoryTree(PLAN_TEMPLATES)
    expect([...tree.keys()]).toEqual(['HDB', 'Condominium'])
    // The default 4-Room lives under HDB › Serangoon North Vista.
    const serangoon = tree.get('HDB')?.get('Serangoon North Vista') ?? []
    expect(serangoon.map((t) => t.category?.apartmentType)).toEqual(['4-Room', '5-Room'])
    // Apartment types within a project are unique (so the 3rd dropdown is clean).
    for (const projects of tree.values()) {
      for (const list of projects.values()) {
        const types = list.map((t) => t.category?.apartmentType)
        expect(new Set(types).size).toBe(types.length)
      }
    }
  })

  it('counts the HDB flat-type templates (incl. the two-storey maisonette)', () => {
    const hdb = PLAN_TEMPLATES.filter((t) => t.id.startsWith('tpl-hdb-'))
    expect(hdb.length).toBe(8)
  })

  it('every opening (on every storey) references an existing wall of its own level and fits', () => {
    for (const tpl of PLAN_TEMPLATES) {
      for (const level of planLevels(tpl)) {
        const wallsById = new Map(level.walls.map((w) => [w.id, w]))
        for (const o of level.openings) {
          const wall = wallsById.get(o.wallId)
          expect(
            wall,
            `${tpl.id}/${level.id}: ${o.id} references missing wall ${o.wallId}`,
          ).toBeDefined()
          if (!wall) continue
          const len = wallLength(wall)
          expect(o.offset, `${tpl.id}: ${o.id} offset`).toBeGreaterThanOrEqual(-1e-6)
          expect(o.width, `${tpl.id}: ${o.id} width`).toBeGreaterThan(0)
          expect(o.offset + o.width, `${tpl.id}: ${o.id} overruns ${o.wallId}`).toBeLessThanOrEqual(
            len + 1e-6,
          )
        }
      }
    }
  })

  it('covers the expected flat-type ids (HDB + condo + landed)', () => {
    const ids = new Set(PLAN_TEMPLATES.map((t) => t.id))
    for (const id of [
      'tpl-hdb-2room',
      'tpl-hdb-3room',
      'tpl-hdb-4room',
      'tpl-hdb-5room',
      'tpl-hdb-exec',
      'tpl-hdb-3gen',
      'tpl-hdb-jumbo',
      'tpl-hdb-maisonette',
      'tpl-condo-1bed',
      'tpl-condo-1study',
      'tpl-condo-2bed',
      'tpl-condo-3bed',
      'tpl-condo-penthouse',
      'tpl-terrace-ground',
      'tpl-condo-studio',
      'tpl-condo-4bed',
    ]) {
      expect(ids.has(id), `missing template ${id}`).toBe(true)
    }
  })

  // ML6a: the two-storey templates carry REAL upper storeys — bedrooms + baths
  // above, an elevation of ground ceiling + slab, and a stair landing stacked
  // over the ground stair space so a staircase connects the floors.
  it('maisonette / terrace / loft templates have real upper storeys with stacked stair space', () => {
    const cases: Array<{ id: string; groundStair: string; upperLanding: string }> = [
      { id: 'tpl-hdb-maisonette', groundStair: 'em-stair', upperLanding: 'emu-landing' },
      { id: 'tpl-terrace-ground', groundStair: 'ct-stair', upperLanding: 'ctu-landing' },
      { id: 'tpl-loft', groundStair: 'lf-stair', upperLanding: 'lfu-landing' },
    ]
    for (const c of cases) {
      const tpl = PLAN_TEMPLATES.find((t) => t.id === c.id)
      expect(tpl, c.id).toBeDefined()
      if (!tpl) continue
      expect(tpl.upperLevels?.length, `${c.id} upperLevels`).toBe(1)
      const up = tpl.upperLevels?.[0]
      if (!up) continue
      // Upper floor sits above the ground volume: ceiling + ~0.3 m slab.
      expect(up.elevation).toBeCloseTo(tpl.ceilingHeight + 0.3, 6)
      // Bedrooms + bath upstairs (maisonette/terrace) or a sleeping deck (loft).
      expect(
        up.rooms.some((r) => /bed|sleep/i.test(r.name)),
        `${c.id} bedrooms up`,
      ).toBe(true)
      expect(up.walls.length).toBeGreaterThanOrEqual(4)
      expect(up.openings.length).toBeGreaterThan(0)
      // The upper landing is stacked over the ground stair space (XZ overlap),
      // so a staircase item in the hall arrives on the landing.
      const stair = tpl.rooms.find((r) => r.id === c.groundStair)
      const landing = up.rooms.find((r) => r.id === c.upperLanding)
      expect(stair, `${c.id} ground stair room`).toBeDefined()
      expect(landing, `${c.id} upper landing room`).toBeDefined()
      if (!stair || !landing) continue
      const overlap =
        stair.origin[0] < landing.origin[0] + landing.width - 1e-6 &&
        landing.origin[0] < stair.origin[0] + stair.width - 1e-6 &&
        stair.origin[1] < landing.origin[1] + landing.depth - 1e-6 &&
        landing.origin[1] < stair.origin[1] + stair.depth - 1e-6
      expect(overlap, `${c.id}: landing not stacked over stair`).toBe(true)
    }
  })
})
