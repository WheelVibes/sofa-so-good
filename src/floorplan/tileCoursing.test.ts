import { describe, expect, it } from 'vitest'
import type { MaterialDef } from '../materials/types'
import { planTileCoursing, roomTileCoursing, SLIVER_LIMIT_FRACTION } from './tileCoursing'
import type { FloorPlan, PlanRoom } from './types'

function room(over: Partial<PlanRoom> = {}): PlanRoom {
  return { id: 'r1', name: 'Kitchen', origin: [0, 0], width: 3, depth: 2.4, ...over } as PlanRoom
}

/** A 600×600 specified porcelain. */
function tile(moduleMm?: [number, number]): MaterialDef {
  return {
    id: 'floor-tile-beige',
    name: 'Beige glazed porcelain (600×600)',
    category: 'floor',
    kind: 'procedural',
    pattern: 'stoneTile',
    swatch: '#cfb38e',
    uvScale: [1.2, 1.2],
    ...(moduleMm ? { moduleMm } : {}),
  } as unknown as MaterialDef
}

describe('roomTileCoursing', () => {
  it('returns null for a finish with NO specified module', () => {
    // The whole point of `moduleMm`: absence means unknown, never a guess. A
    // module inferred from uvScale would be a texture-authoring artifact.
    expect(roomTileCoursing(room(), tile())).toBeNull()
  })

  it('returns null when there is no finish at all', () => {
    expect(roomTileCoursing(room(), undefined)).toBeNull()
  })

  it('reports whole tiles and no cut when the room divides exactly', () => {
    // 3.0 m / 600 = 5 exactly; 2.4 m / 600 = 4 exactly.
    const c = roomTileCoursing(room(), tile([600, 600]))!
    expect(c.fullTiles).toEqual([5, 4])
    expect(c.cutMm).toEqual([0, 0])
    expect(c.originMm).toEqual([0, 0])
    expect(c.sliver).toBe(false)
    expect(c.tileCount).toBe(20)
  })

  it('centres the field so both perimeter cuts are equal', () => {
    // 3.3 m across / 600 → 5 whole + 300 leftover → 150 each end.
    const c = roomTileCoursing(room({ width: 3.3 }), tile([600, 600]))!
    expect(c.fullTiles[0]).toBe(5)
    expect(c.cutMm[0]).toBeCloseTo(150, 6)
  })

  it('borrows a whole tile rather than leaving a sliver', () => {
    // 3.02 m → 5 whole + 20 leftover → a naive centred split is a 10 mm sliver.
    // Borrowing one tile gives 4 whole and (20 + 600)/2 = 310 mm cuts, which is
    // the re-set a tiler would actually do.
    const c = roomTileCoursing(room({ width: 3.02 }), tile([600, 600]))!
    expect(c.fullTiles[0]).toBe(4)
    expect(c.cutMm[0]).toBeCloseTo(310, 6)
    expect(c.sliver).toBe(false)
  })

  it('does NOT flag a wide cut in a room narrower than one module', () => {
    // 400 mm room, 600 module → two 200 mm cuts. No whole tile exists to
    // borrow, but 200 mm is a perfectly good cut, so this is not a sliver.
    const c = roomTileCoursing(room({ width: 0.4, depth: 0.4 }), tile([600, 600]))!
    expect(c.fullTiles).toEqual([0, 0])
    expect(c.cutMm[0]).toBeCloseTo(200, 6)
    expect(c.sliver).toBe(false)
  })

  it('flags a sliver it genuinely cannot avoid', () => {
    // 100 mm room, 600 module → 50 mm cuts and no whole tile to borrow from,
    // so the sliver is unavoidable and must be reported rather than hidden.
    const c = roomTileCoursing(room({ width: 0.1, depth: 0.1 }), tile([600, 600]))!
    expect(c.fullTiles).toEqual([0, 0])
    expect(c.cutMm[0]).toBeCloseTo(50, 6)
    expect(c.sliver).toBe(true)
  })

  it('handles a non-square module per axis', () => {
    // 300 wide × 600 high: 3.0 m / 300 = 10 across, 2.4 m / 600 = 4 down.
    const c = roomTileCoursing(room(), tile([300, 600]))!
    expect(c.fullTiles).toEqual([10, 4])
    expect(c.moduleMm).toEqual([300, 600])
  })

  it('uses the polygon extent for a non-rectangular room', () => {
    const poly = roomTileCoursing(
      room({
        polygon: [
          [0, 0],
          [3, 0],
          [3, 1.2],
          [1.8, 1.2],
          [1.8, 2.4],
          [0, 2.4],
        ],
      } as Partial<PlanRoom>),
      tile([600, 600]),
    )!
    // Bounding extent is still 3.0 × 2.4, so the field is set out across that.
    expect(poly.extentMm).toEqual([3000, 2400])
  })

  it('returns null for a degenerate room', () => {
    expect(roomTileCoursing(room({ width: 0, depth: 0 }), tile([600, 600]))).toBeNull()
  })

  it('never reports a cut wider than its module', () => {
    for (let w = 0.6; w < 4; w += 0.07) {
      const c = roomTileCoursing(room({ width: w }), tile([600, 600]))
      if (!c) continue
      expect(c.cutMm[0]).toBeLessThan(600)
      expect(c.cutMm[0]).toBeGreaterThanOrEqual(0)
    }
  })

  it('only flags sliver below the documented fraction', () => {
    const c = roomTileCoursing(room({ width: 3.3 }), tile([600, 600]))!
    expect(c.cutMm[0]).toBeGreaterThanOrEqual(600 * SLIVER_LIMIT_FRACTION)
    expect(c.sliver).toBe(false)
  })
})

describe('planTileCoursing', () => {
  const plan = {
    name: 'p',
    rooms: [room(), room({ id: 'r2', name: 'Living', width: 4, depth: 3 })],
  } as unknown as FloorPlan

  it('reports a row per room with a specified module', () => {
    const { rows, omittedRooms } = planTileCoursing(
      plan,
      { r1: 'floor-tile-beige', r2: 'floor-tile-beige' },
      { 'floor-tile-beige': tile([600, 600]) },
    )
    expect(rows.map((r) => r.roomId)).toEqual(['r1', 'r2'])
    expect(omittedRooms).toBe(0)
  })

  it('counts rooms it had to omit rather than implying completeness', () => {
    const { rows, omittedRooms } = planTileCoursing(
      plan,
      { r1: 'floor-tile-beige' },
      { 'floor-tile-beige': tile([600, 600]) },
    )
    expect(rows).toHaveLength(1)
    expect(omittedRooms).toBe(1)
  })

  it('omits a room whose finish has no specified module', () => {
    const { rows, omittedRooms } = planTileCoursing(
      plan,
      { r1: 'floor-vinyl-oak', r2: 'floor-vinyl-oak' },
      { 'floor-vinyl-oak': tile() },
    )
    expect(rows).toEqual([])
    expect(omittedRooms).toBe(2)
  })
})
