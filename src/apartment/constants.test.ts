import { describe, expect, it } from 'vitest'
import { buildDefaultPlan } from '../floorplan/defaultPlan'
import { doorSwingGeometry } from '../floorplan/doorSwing'
import { pointInRoom } from '../floorplan/types'
import { isDemolitionRestricted } from '../floorplan/wallHackability'
import { DOORS, INTERIOR_AREA_M2, ROOMS, WALLS, WINDOWS } from './constants'

describe('apartment constants', () => {
  it('total internal area is within 0.5 m² of 87.8 (excluding AC ledge)', () => {
    // Strata interior excludes only the AC ledge (external annex south of the
    // baths). The plan states 90 m² internal measured on wall CENTRE-lines;
    // the rect sum landed within tolerance of that through v0.23.1.7. v0.23.1.8
    // thickened every remaining full-black-run wall (the household-shelter RC
    // ring + wall-int-b3-LD-col, wall-ext-bath1-W, wall-ext-SE-jog-W,
    // wall-ext-SE-step, wall-ext-W) from the flat's usual 100 mm internal /
    // 200 mm external gauge to the real 300 mm RC/gable-end gauge — a
    // legitimate further loss (~2.37 m², mostly the household shelter, now
    // correctly modeled at 300 mm RC on all four sides), landing the honest
    // rect sum at ≈87.8 m² (see apartment/constants.ts's INTERIOR_AREA_M2
    // comment for the accounting). v0.30.3.2 drops a further ≈2.4 m²: that
    // figure DOUBLE-COUNTED livingDining's declared overlap with bedroom3 + the
    // corridor (~2.6 m², since redeclared as three exact non-overlapping
    // parts), against ~0.3 m² of floor at the kitchen boundary that no room had
    // claimed at all. ≈85.4 m² is the first honest interior total.
    // Summed independently here (every declared part of every room) as the
    // test's own fixture, rather than re-importing the code under test.
    const sum = Object.values(ROOMS)
      .filter((r) => !r.external)
      .reduce(
        (acc, r) =>
          acc + r.width * r.depth + (r.extensions ?? []).reduce((a, e) => a + e.width * e.depth, 0),
        0,
      )
    expect(Math.abs(sum - 85.4)).toBeLessThan(0.5)
    // No room's parts overlap each other, so the part sum equals the union area
    // `INTERIOR_AREA_M2` reports (`roomGeometry.ts:roomFloorArea`, a shoelace
    // over each room's outline).
    expect(Math.abs(INTERIOR_AREA_M2 - sum)).toBeLessThan(0.01)
  })

  it('every door references an existing wall', () => {
    const wallIds = new Set(WALLS.map((w) => w.id))
    for (const d of DOORS) expect(wallIds.has(d.wallId)).toBe(true)
  })

  it('every window references an existing wall', () => {
    const wallIds = new Set(WALLS.map((w) => w.id))
    for (const w of WINDOWS) expect(wallIds.has(w.wallId)).toBe(true)
  })

  it('every door cutout exists on its wall', () => {
    for (const d of DOORS) {
      const wall = WALLS.find((w) => w.id === d.wallId)!
      const matching = wall.cutouts.find(
        (c) =>
          c.kind === 'door' &&
          Math.abs(c.offset - d.offset) < 0.001 &&
          Math.abs(c.width - d.width) < 0.001,
      )
      expect(matching, `door ${d.id} has no matching cutout on ${d.wallId}`).toBeDefined()
    }
  })

  it('every window cutout exists on its wall', () => {
    for (const w of WINDOWS) {
      const wall = WALLS.find((x) => x.id === w.wallId)!
      const matching = wall.cutouts.find(
        (c) =>
          c.kind === 'window' &&
          Math.abs(c.offset - w.offset) < 0.001 &&
          Math.abs(c.width - w.width) < 0.001,
      )
      expect(matching, `window ${w.id} has no matching cutout on ${w.wallId}`).toBeDefined()
    }
  })

  it('every cutout stays inside its wall span', () => {
    for (const w of WALLS) {
      const len = Math.hypot(w.end[0] - w.start[0], w.end[1] - w.start[1])
      for (const c of w.cutouts) {
        expect(c.offset, `${w.id} cutout starts before the wall`).toBeGreaterThanOrEqual(0)
        expect(c.offset + c.width, `${w.id} cutout overruns the wall`).toBeLessThanOrEqual(
          len + 0.001,
        )
      }
    }
  })

  describe('structural classification (assets/floor_plan/default.png legend)', () => {
    const byId = new Map(WALLS.map((w) => [w.id, w]))

    it('the household-shelter RC ring is load-bearing on all four sides', () => {
      for (const id of [
        'wall-int-hs-N',
        'wall-int-hs-S',
        'wall-int-bath2-hs',
        'wall-int-shelter-LD',
      ])
        expect(byId.get(id)?.structure, id).toBe('load-bearing')
    })

    it('solid-black external runs are load-bearing; parapets/railings stay unclassified', () => {
      for (const w of WALLS.filter((x) => x.thickness === 'external')) {
        if (w.topHeight != null) {
          // AC-ledge parapets + service-yard half wall — open-air, not room walls.
          expect(w.structure, w.id).toBeUndefined()
        } else if (w.id === 'wall-ext-W') {
          // The gable-end symbol wall (walls.jpg legend #3) — structural, but
          // tagged separately from the plain solid-black 'load-bearing' walls.
          expect(w.structure, w.id).toBe('gable-end')
        } else {
          expect(w.structure, w.id).toBe('load-bearing')
        }
      }
    })

    it('the gable-end west wall is structural (never hackable)', () => {
      const w = byId.get('wall-ext-W')!
      expect(w.structure).toBe('gable-end')
      expect(isDemolitionRestricted(w.structure)).toBe(true)
    })

    it('normal hollow-line internal partitions are brick-partition', () => {
      for (const id of [
        'wall-int-mb-b2',
        'wall-int-b2-b3',
        'wall-int-bedroom-S',
        'wall-int-mb-foyer-E',
        'wall-int-b3-LD',
        'wall-int-corridor-S',
        'wall-int-bath1-bath2',
        'wall-int-bath1-acLedge',
        'wall-int-mid-S',
        'wall-int-shelter-E',
      ])
        expect(byId.get(id)?.structure, id).toBe('brick-partition')
    })

    it('the B3/LD RC column stub is load-bearing and abuts the partition below it', () => {
      const col = byId.get('wall-int-b3-LD-col')!
      const rest = byId.get('wall-int-b3-LD')!
      expect(col.structure).toBe('load-bearing')
      expect(col.end).toEqual(rest.start)
    })

    it('the HS splits abut their neighbours with no gap', () => {
      expect(byId.get('wall-int-corridor-S')!.end).toEqual(byId.get('wall-int-hs-N')!.start)
      expect(byId.get('wall-int-mid-S')!.end).toEqual(byId.get('wall-int-hs-S')!.start)
    })
  })
})

describe('bathroom doors open inward', () => {
  // A bath/WC leaf that folds/swings out into the corridor blocks the walkway —
  // and reads as a slab hanging in the circulation space in walk mode. The leaf's
  // physical side is `swing` × the hinge jamb, so this is checked on the resolved
  // normal, not the raw `swing` field.
  const plan = buildDefaultPlan()
  const wallOf = (id: string) => plan.walls.find((w) => w.id === id)

  for (const [doorId, roomId] of [
    ['door-bath1', 'bath1'],
    ['door-bath2', 'bath2'],
  ] as const) {
    it(`${doorId} opens into ${roomId}`, () => {
      const spec = DOORS.find((d) => d.id === doorId)
      if (!spec) throw new Error(`missing ${doorId}`)
      const wall = wallOf(spec.wallId)
      if (!wall) throw new Error(`missing wall ${spec.wallId}`)
      const opening = plan.openings.find((o) => o.id === doorId)
      if (!opening) throw new Error(`missing opening ${doorId}`)
      const g = doorSwingGeometry(wall, opening)
      if (!g) throw new Error('no swing geometry')
      // The open leaf's tip must land inside the bathroom it serves.
      const room = plan.rooms.find((r) => r.id === roomId)
      if (!room) throw new Error(`missing room ${roomId}`)
      expect(pointInRoom(room, g.leafTip[0], g.leafTip[1])).toBe(true)
    })
  }
})
