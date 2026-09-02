/**
 * Floor build-up, the two HDB thickness limits, and the FFL derived from them.
 *
 * Each test is verified to fail without its fix — the whole module is new, so
 * the discriminating question for each is "would a plausible wrong
 * implementation pass this?" rather than "does it pass".
 */
import { describe, expect, it } from 'vitest'
import type { FloorPlan } from '../floorplan/types'
import type { MaterialDef } from '../materials/types'
import { buildFloorBuildUpReport, HDB_MAX_BUILD_UP_MM, HDB_MAX_OVERLAY_MM } from './floorBuildUp'

const mat = (id: string, finishMm: number, beddingMm: number): MaterialDef =>
  ({
    id,
    name: id,
    category: 'floor',
    kind: 'procedural',
    pattern: 'tile',
    swatch: '#ccc',
    uvScale: [1, 1],
    buildUp: { finishMm, beddingMm },
  }) as unknown as MaterialDef

const MATS: Record<string, MaterialDef | undefined> = {
  // The two ordinary HDB finishes, and the pairing that makes an 8 mm step.
  tile: mat('tile', 10, 5),
  lvt: mat('lvt', 6, 1),
  // No `buildUp` — the honest-omission path.
  carpet: { id: 'carpet', name: 'carpet', category: 'floor' } as unknown as MaterialDef,
  // Over the 50 mm limit on its own.
  thick: mat('thick', 40, 15),
}

/**
 * Two rooms with a door between them, on a single wall. Geometry deliberately
 * places the rooms APART either side of the wall so a level-gating bug cannot
 * hide behind an overlap.
 */
function twoRooms(catA?: string, catB?: string): FloorPlan {
  return {
    id: 'p',
    name: 'p',
    extent: [8, 6],
    ceilingHeight: 2.6,
    walls: [{ id: 'w', start: [0, 3], end: [8, 3], thickness: 'internal' }],
    openings: [{ id: 'd', wallId: 'w', kind: 'door', offset: 4, width: 0.9 }],
    rooms: [
      { id: 'a', name: 'Room A', origin: [0, 0], width: 8, depth: 3, category: catA },
      { id: 'b', name: 'Room B', origin: [0, 3], width: 8, depth: 3, category: catB },
    ],
  } as unknown as FloorPlan
}

const run = (plan: FloorPlan, floors: Record<string, string | undefined>) =>
  buildFloorBuildUpReport(plan, floors, MATS)

describe('which HDB limit applies', () => {
  it('uses the 50 mm finish-plus-screed limit on a bare or stripped-out flat', () => {
    for (const intake of ['bto-bare', 'resale-stripout'] as const) {
      const r = run({ ...twoRooms(), intakeState: intake } as FloorPlan, { a: 'tile', b: 'lvt' })
      expect(r.limitMm, intake).toBe(HDB_MAX_BUILD_UP_MM)
      expect(r.overlay, intake).toBe(false)
    }
  })

  it('uses the 13 mm overlay limit where an existing finish stays', () => {
    for (const intake of ['bto-ocs', 'resale-asis'] as const) {
      const r = run({ ...twoRooms(), intakeState: intake } as FloorPlan, { a: 'tile', b: 'lvt' })
      expect(r.limitMm, intake).toBe(HDB_MAX_OVERLAY_MM)
      expect(r.overlay, intake).toBe(true)
    }
  })

  it('defaults to the 50 mm limit when the intake state is unknown', () => {
    // The forgiving default is deliberate: assuming an overlay would flag
    // ordinary bedded tile on every untagged plan.
    const r = run(twoRooms(), { a: 'tile', b: 'lvt' })
    expect(r.intakeState).toBeNull()
    expect(r.limitMm).toBe(HDB_MAX_BUILD_UP_MM)
  })

  it('flags bedded tile as OVER the overlay limit but fine on bare screed', () => {
    // 10 + 5 = 15 mm, over 13 mm. The measurement that makes the two limits
    // worth distinguishing: the SAME finish passes or fails on intake alone.
    const overlaid = run({ ...twoRooms(), intakeState: 'resale-asis' } as FloorPlan, {
      a: 'tile',
      b: 'tile',
    })
    expect(overlaid.overLimit.map((x) => x.roomName)).toEqual(['Room A', 'Room B'])
    const bare = run({ ...twoRooms(), intakeState: 'bto-bare' } as FloorPlan, {
      a: 'tile',
      b: 'tile',
    })
    expect(bare.overLimit).toHaveLength(0)
  })

  it('flags a 55 mm build-up even on bare screed', () => {
    const r = run({ ...twoRooms(), intakeState: 'bto-bare' } as FloorPlan, { a: 'thick', b: 'lvt' })
    expect(r.overLimit.map((x) => x.roomName)).toEqual(['Room A'])
    expect(r.overLimit[0]!.totalMm).toBe(55)
  })
})

describe('derived FFL', () => {
  it('is measured from the THINNEST room, not from zero', () => {
    // Both rooms are above the slab, but the STEP is what a threshold detail is
    // dimensioned from. Reporting 15 and 7 as absolute would imply a slab level
    // the model does not have.
    const r = run(twoRooms(), { a: 'tile', b: 'lvt' })
    const byName = new Map(r.rows.map((x) => [x.roomName, x]))
    expect(byName.get('Room B')!.derivedFflMm).toBe(0)
    expect(byName.get('Room A')!.derivedFflMm).toBe(8)
  })

  it('is zero everywhere when every room shares one finish', () => {
    const r = run(twoRooms(), { a: 'tile', b: 'tile' })
    expect(r.rows.map((x) => x.derivedFflMm)).toEqual([0, 0])
    expect(r.steps).toHaveLength(0)
  })
})

describe('doorway steps', () => {
  it('reports the 8 mm step bedded tile makes against LVT', () => {
    const r = run(twoRooms(), { a: 'tile', b: 'lvt' })
    expect(r.steps).toHaveLength(1)
    expect(r.steps[0]!.stepMm).toBe(8)
    expect(r.steps[0]!.higherRoomName).toBe('Room A')
  })

  it('does NOT report a step below the documentation threshold', () => {
    // 10+5 against 11+4 is the same total — no step, and no marker.
    const r = buildFloorBuildUpReport(
      twoRooms(),
      { a: 'tile', b: 'same' },
      {
        ...MATS,
        same: mat('same', 11, 4),
      },
    )
    expect(r.steps).toHaveLength(0)
  })

  it('does not pair a door with a room on ANOTHER storey (F13)', () => {
    // `roomsAcrossOpening` matches on proximity in XZ, so an upstairs door
    // stacked over a downstairs room would pair with it. The upper level here
    // is deliberately at the SAME footprint with a DIFFERENT finish, so a
    // cross-storey pairing would invent a step that does not exist.
    const plan = {
      ...twoRooms(),
      upperLevels: [
        {
          id: 'up',
          name: 'Upper',
          elevation: 3,
          walls: [{ id: 'uw', start: [0, 3], end: [8, 3], thickness: 'internal' }],
          openings: [{ id: 'ud', wallId: 'uw', kind: 'door', offset: 4, width: 0.9 }],
          rooms: [
            { id: 'ua', name: 'Upper A', origin: [0, 0], width: 8, depth: 3 },
            { id: 'ub', name: 'Upper B', origin: [0, 3], width: 8, depth: 3 },
          ],
        },
      ],
    } as unknown as FloorPlan
    // Ground: both tile (no step). Upper: tile vs LVT (one 8 mm step).
    const r = run(plan, { a: 'tile', b: 'tile', ua: 'tile', ub: 'lvt' })
    expect(r.rows).toHaveLength(4)
    expect(r.steps).toHaveLength(1)
    expect([r.steps[0]!.roomAName, r.steps[0]!.roomBName].sort()).toEqual(['Upper A', 'Upper B'])
  })
})

describe('honest omission', () => {
  it('names the rooms it could not assess rather than assuming a thickness', () => {
    const r = run(twoRooms(), { a: 'tile', b: 'carpet' })
    expect(r.unassessedRooms).toEqual(['Room B'])
    expect(r.rows.map((x) => x.roomName)).toEqual(['Room A'])
    // And no step is invented across a doorway it can only see one side of.
    expect(r.steps).toHaveLength(0)
  })

  it('treats a room with no finish set as unassessed, not as zero', () => {
    const r = run(twoRooms(), { a: 'tile' })
    expect(r.unassessedRooms).toEqual(['Room B'])
  })
})

describe('declared vs derived', () => {
  it('reports a room whose hand-entered FFL contradicts its finishes', () => {
    // The user tagged Room A at ±0 while specifying a finish 8 mm thicker than
    // its neighbour. One of the two is wrong before anyone mixes screed.
    const plan = twoRooms()
    plan.rooms[0]!.floorLevelMm = 0
    const r = run(plan, { a: 'tile', b: 'lvt' })
    expect(r.declaredMismatches).toEqual([{ roomName: 'Room A', declaredMm: 0, derivedMm: 8 }])
  })

  it('stays silent when the declaration AGREES with the finishes', () => {
    const plan = twoRooms()
    plan.rooms[0]!.floorLevelMm = 8
    expect(run(plan, { a: 'tile', b: 'lvt' }).declaredMismatches).toHaveLength(0)
  })

  it('does NOT treat an untagged room as a declaration of zero', () => {
    // Otherwise every room in a plan nobody has tagged reports a mismatch —
    // the noise that makes a check ignorable. No room here sets floorLevelMm.
    const r = run(twoRooms(), { a: 'tile', b: 'lvt' })
    expect(r.rows.every((x) => x.declaredFflMm === null)).toBe(true)
    expect(r.declaredMismatches).toHaveLength(0)
  })
})

describe('wet room falling outward', () => {
  it('flags a bathroom whose derived floor sits ABOVE the bedroom', () => {
    // 15 mm bedded porcelain in the bath against 7 mm LVT in the bedroom: the
    // most ordinary HDB pairing there is, and the fall is out of the bathroom.
    const r = run(twoRooms('bath', 'bedroom'), { a: 'tile', b: 'lvt' })
    expect(r.wetRoomsFallingOutward).toHaveLength(1)
    expect(r.wetRoomsFallingOutward[0]).toMatchObject({
      wetRoomName: 'Room A',
      dryRoomName: 'Room B',
      aboveByMm: 8,
    })
  })

  it('stays silent when the bathroom is LOWER', () => {
    // The arms must disagree: same rooms, finishes swapped. A check that read
    // the absolute step would flag this too.
    const r = run(twoRooms('bath', 'bedroom'), { a: 'lvt', b: 'tile' })
    expect(r.wetRoomsFallingOutward).toHaveLength(0)
    // ...while the step itself is still reported, because a threshold detail is
    // needed either way.
    expect(r.steps).toHaveLength(1)
  })

  it('stays silent when both sides are wet', () => {
    // A bath-to-powder door has no dry side to flood.
    const r = run(twoRooms('bath', 'powder'), { a: 'tile', b: 'lvt' })
    expect(r.wetRoomsFallingOutward).toHaveLength(0)
  })

  it('stays silent when neither side is wet', () => {
    const r = run(twoRooms('bedroom', 'living'), { a: 'tile', b: 'lvt' })
    expect(r.wetRoomsFallingOutward).toHaveLength(0)
  })
})
