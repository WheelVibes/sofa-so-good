import { describe, expect, it } from 'vitest'
import type { FinishTotal } from '../floorplan/finishSchedule'
import type { MaterialDef } from '../materials/types'
import {
  BARE_PLASTER_RATE_M2_PER_L,
  buildPaintQuantities,
  SEALER_RATE_M2_PER_L,
  tinsFor,
} from './paintQuantities'

const PAINT = {
  id: 'wall-paint-white',
  name: 'White paint',
  paint: { spreadingRateM2PerL: 12, coats: 2 },
} as unknown as MaterialDef

const TILE = { id: 'wall-tile-white', name: 'White tile' } as unknown as MaterialDef

const byName: Record<string, MaterialDef | undefined> = {
  'White paint': PAINT,
  'White tile': TILE,
}

const total = (code: string, name: string, kind: FinishTotal['kind'], area: number): FinishTotal =>
  ({ code, name, kind, area }) as FinishTotal

describe('tinsFor', () => {
  it('buys the smallest set of tins that covers the requirement', () => {
    expect(tinsFor(5)).toEqual([{ size: 5, count: 1 }])
    expect(tinsFor(20)).toEqual([{ size: 20, count: 1 }])
    // 6 L is 5 + 1, not a 20 L drum.
    expect(tinsFor(6)).toEqual([
      { size: 5, count: 1 },
      { size: 1, count: 1 },
    ])
  })

  it('rounds a part tin UP — you cannot buy 0.4 of a tin', () => {
    expect(tinsFor(0.4)).toEqual([{ size: 1, count: 1 }])
    expect(tinsFor(5.2)).toEqual([
      { size: 5, count: 1 },
      { size: 1, count: 1 },
    ])
  })

  it('adds the remainder to an existing small-tin count rather than a second entry', () => {
    // 7.5 L → 5 + 2×1 (2.5 rounds up into the same 1 L line).
    expect(tinsFor(7.5)).toEqual([
      { size: 5, count: 1 },
      { size: 1, count: 3 },
    ])
  })

  it('returns nothing for a zero or negative quantity', () => {
    expect(tinsFor(0)).toEqual([])
    expect(tinsFor(-1)).toEqual([])
  })
})

describe('buildPaintQuantities — primed substrate', () => {
  it('converts area to litres at the product rate, with its coats', () => {
    // 60 m² × 2 coats ÷ 12 m²/L = 10 L.
    const q = buildPaintQuantities([total('WL-01', 'White paint', 'wall', 60)], byName)
    expect(q.rows).toHaveLength(1)
    expect(q.rows[0]!.topcoatL).toBeCloseTo(10, 6)
    expect(q.rows[0]!.sealerL).toBe(0)
    expect(q.rows[0]!.totalL).toBeCloseTo(10, 6)
    expect(q.rows[0]!.coats).toBe(2)
  })

  it('needs NO sealer on a primed surface', () => {
    const q = buildPaintQuantities([total('WL-01', 'White paint', 'wall', 60)], byName)
    expect(q.rows[0]!.sealerL).toBe(0)
    expect(q.note).toContain('previously painted or primed')
  })

  it('covers ceilings and accent walls, not just walls', () => {
    const q = buildPaintQuantities(
      [
        total('WL-01', 'White paint', 'wall', 60),
        total('CL-01', 'White paint', 'ceiling', 30),
        total('AW-01', 'White paint', 'accent', 12),
      ],
      byName,
    )
    expect(q.rows.map((r) => r.kind).sort()).toEqual(['accent', 'ceiling', 'wall'])
    // 102 m² total × 2 ÷ 12 = 17 L.
    expect(q.totalL).toBeCloseTo(17, 6)
  })

  it('ignores FLOOR totals outright — a floor finish is never paint here', () => {
    const q = buildPaintQuantities([total('FL-01', 'White tile', 'floor', 40)], byName)
    expect(q.rows).toEqual([])
    // And a floor is not "omitted paint" either; it was never a candidate.
    expect(q.omittedFinishes).toBe(0)
  })

  it('REPORTS a wall finish that is not paint rather than dropping it', () => {
    // A tiled wall has no `paint` coverage, so it has no litres — but a short
    // list must not read as the whole job.
    const q = buildPaintQuantities(
      [total('WL-01', 'White paint', 'wall', 60), total('WL-02', 'White tile', 'wall', 20)],
      byName,
    )
    expect(q.rows).toHaveLength(1)
    expect(q.omittedFinishes).toBe(1)
  })

  it('sorts the biggest quantity first, so the main order is at the top', () => {
    const q = buildPaintQuantities(
      [total('WL-01', 'White paint', 'wall', 10), total('CL-01', 'White paint', 'ceiling', 90)],
      byName,
    )
    expect(q.rows[0]!.code).toBe('CL-01')
  })
})

describe('buildPaintQuantities — bare/new plaster (a BTO handover)', () => {
  it('drops the coverage AND adds a sealer coat', () => {
    const q = buildPaintQuantities([total('WL-01', 'White paint', 'wall', 60)], byName, 'bare')
    const r = q.rows[0]!
    expect(r.spreadingRateM2PerL).toBe(BARE_PLASTER_RATE_M2_PER_L)
    // 60 × 2 ÷ 6 = 20 L topcoat; 60 ÷ 10 = 6 L sealer.
    expect(r.topcoatL).toBeCloseTo(20, 6)
    expect(r.sealerL).toBeCloseTo(60 / SEALER_RATE_M2_PER_L, 6)
    expect(r.totalL).toBeCloseTo(26, 6)
  })

  it('is materially more paint than the primed case — the reason to ask', () => {
    const area = [total('WL-01', 'White paint', 'wall', 60)]
    const primed = buildPaintQuantities(area, byName).totalL
    const bare = buildPaintQuantities(area, byName, 'bare').totalL
    // 10 L vs 26 L: ordering the primed quantity for a BTO leaves the job
    // less than half painted, which is exactly why the substrate is stated.
    expect(bare).toBeGreaterThan(primed * 2)
  })

  it('never uses a rate BETTER than the product claims', () => {
    // A hypothetical low-coverage product must not be improved by the bare
    // substrate — `bare` is a floor on quality, not a substitute rate.
    const poor = {
      id: 'p',
      name: 'Poor paint',
      paint: { spreadingRateM2PerL: 4, coats: 2 },
    } as unknown as MaterialDef
    const q = buildPaintQuantities(
      [total('WL-01', 'Poor paint', 'wall', 12)],
      { 'Poor paint': poor },
      'bare',
    )
    expect(q.rows[0]!.spreadingRateM2PerL).toBe(4)
  })

  it('states the bare assumption in the note', () => {
    const q = buildPaintQuantities([total('WL-01', 'White paint', 'wall', 60)], byName, 'bare')
    expect(q.note).toContain('BARE/NEW plaster')
    expect(q.note).toContain('sealer coat')
  })
})

describe('buildPaintQuantities — honesty', () => {
  it('always says litres exclude wastage and to confirm the data sheet', () => {
    for (const s of ['primed', 'bare'] as const) {
      const q = buildPaintQuantities([total('WL-01', 'White paint', 'wall', 60)], byName, s)
      expect(q.note).toContain('EXCLUDE wastage')
      expect(q.note).toContain('product data sheet')
    }
  })

  it('handles an empty schedule without inventing a quantity', () => {
    const q = buildPaintQuantities([], byName)
    expect(q.rows).toEqual([])
    expect(q.totalL).toBe(0)
  })

  it('skips a zero-area total rather than emitting a 0 L line', () => {
    const q = buildPaintQuantities([total('WL-01', 'White paint', 'wall', 0)], byName)
    expect(q.rows).toEqual([])
    expect(q.omittedFinishes).toBe(0)
  })
})

describe('buildPaintQuantities — the unpainted DEFAULT still needs paint', () => {
  it('counts the finish-schedule sentinels, which are painted by definition', async () => {
    const { NEUTRAL_WALL, DEFAULT_CEILING } = await import('../floorplan/finishSchedule')
    // A room that never had a finish picked shows as these sentinel NAMES, not
    // as catalog products — so a bare material lookup misses them. Excluding
    // them would zero the quantity for the most common case there is: a new
    // flat where nothing has been chosen. Empty material map on purpose.
    const q = buildPaintQuantities(
      [total('WL-01', NEUTRAL_WALL, 'wall', 120), total('CL-01', DEFAULT_CEILING, 'ceiling', 90)],
      {},
    )
    expect(q.rows).toHaveLength(2)
    // (120 + 90) × 2 ÷ 12 = 35 L.
    expect(q.totalL).toBeCloseTo(35, 6)
    expect(q.omittedFinishes).toBe(0)
  })

  it('still reports a genuinely non-paint finish as omitted', () => {
    // The sentinel allowance must not turn into "everything is paint".
    const q = buildPaintQuantities([total('WL-02', 'White tile', 'wall', 20)], byName)
    expect(q.rows).toEqual([])
    expect(q.omittedFinishes).toBe(1)
  })
})
