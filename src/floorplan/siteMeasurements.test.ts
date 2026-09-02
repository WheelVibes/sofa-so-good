import { describe, expect, it } from 'vitest'
import {
  buildMeasurementReconciliation,
  defaultToleranceMm,
  RECONCILE_SCOPE_NOTE,
  type SiteMeasurement,
} from './siteMeasurements'
import type { FloorPlan } from './types'

/** A 4 m north wall, one 900 mm door, one 3 x 2.4 m room. */
function plan(): FloorPlan {
  return {
    name: 'p',
    extent: [4, 3],
    ceilingHeight: 2.6,
    walls: [
      { id: 'w-n', start: [0, 0], end: [4, 0], thickness: 'external', name: 'North wall' },
      { id: 'w-short', start: [0, 0], end: [1, 0], thickness: 'internal' },
    ],
    openings: [{ id: 'd1', wallId: 'w-n', kind: 'door', offset: 1, width: 0.9 }],
    rooms: [{ id: 'r1', name: 'Living', origin: [0, 0], width: 3, depth: 2.4 }],
  } as unknown as FloorPlan
}

const m = (over: Partial<SiteMeasurement>): SiteMeasurement => ({
  id: 'm1',
  kind: 'wall',
  targetId: 'w-n',
  measuredMm: 4000,
  ...over,
})

describe('defaultToleranceMm — widens with length', () => {
  it('follows the published convention bands', () => {
    expect(defaultToleranceMm(900)).toBe(6)
    expect(defaultToleranceMm(1200)).toBe(6)
    expect(defaultToleranceMm(1500)).toBe(9)
    expect(defaultToleranceMm(1800)).toBe(12)
    expect(defaultToleranceMm(4000)).toBe(12)
  })

  it('is sign-agnostic', () => {
    expect(defaultToleranceMm(-4000)).toBe(12)
  })
})

describe('buildMeasurementReconciliation', () => {
  it('reports zero deviation for a measurement matching the model', () => {
    const r = buildMeasurementReconciliation(plan(), [m({})])
    expect(r.rows[0]!.modelMm).toBe(4000)
    expect(r.rows[0]!.deviationMm).toBe(0)
    expect(r.rows[0]!.verdict).toBe('within')
    expect(r.exceedsCount).toBe(0)
  })

  it('signs the deviation so bigger-than-drawn is positive', () => {
    const bigger = buildMeasurementReconciliation(plan(), [m({ measuredMm: 4020 })])
    expect(bigger.rows[0]!.deviationMm).toBe(20)
    const smaller = buildMeasurementReconciliation(plan(), [m({ measuredMm: 3980 })])
    expect(smaller.rows[0]!.deviationMm).toBe(-20)
  })

  it('flags a deviation beyond tolerance', () => {
    // 4 m wall → 12 mm tolerance; 20 mm out exceeds it.
    const r = buildMeasurementReconciliation(plan(), [m({ measuredMm: 4020 })])
    expect(r.rows[0]!.toleranceMm).toBe(12)
    expect(r.rows[0]!.verdict).toBe('exceeds')
    expect(r.exceedsCount).toBe(1)
    expect(r.worstDeviationMm).toBe(20)
  })

  it('accepts a deviation exactly ON tolerance', () => {
    const r = buildMeasurementReconciliation(plan(), [m({ measuredMm: 4012 })])
    expect(r.rows[0]!.verdict).toBe('within')
  })

  it('honours a per-measurement tolerance override', () => {
    const tight = buildMeasurementReconciliation(plan(), [m({ measuredMm: 4008, toleranceMm: 3 })])
    expect(tight.rows[0]!.verdict).toBe('exceeds')
    const loose = buildMeasurementReconciliation(plan(), [m({ measuredMm: 4008, toleranceMm: 50 })])
    expect(loose.rows[0]!.verdict).toBe('within')
  })

  it('uses the SHORT-wall tolerance band for a short wall', () => {
    const r = buildMeasurementReconciliation(plan(), [m({ targetId: 'w-short', measuredMm: 1008 })])
    // 1 m wall → 6 mm band, so 8 mm out exceeds.
    expect(r.rows[0]!.toleranceMm).toBe(6)
    expect(r.rows[0]!.verdict).toBe('exceeds')
  })

  it('reconciles an opening width', () => {
    const r = buildMeasurementReconciliation(plan(), [
      m({ kind: 'opening', targetId: 'd1', measuredMm: 905 }),
    ])
    expect(r.rows[0]!.modelMm).toBe(900)
    expect(r.rows[0]!.deviationMm).toBe(5)
    expect(r.rows[0]!.targetLabel).toMatch(/Door/)
  })

  it('reconciles a room width and depth separately', () => {
    const w = buildMeasurementReconciliation(plan(), [
      m({ kind: 'room-width', targetId: 'r1', measuredMm: 3000 }),
    ])
    expect(w.rows[0]!.modelMm).toBe(3000)
    expect(w.rows[0]!.targetLabel).toContain('width')
    const d = buildMeasurementReconciliation(plan(), [
      m({ kind: 'room-depth', targetId: 'r1', measuredMm: 2400 }),
    ])
    expect(d.rows[0]!.modelMm).toBe(2400)
    expect(d.rows[0]!.targetLabel).toContain('depth')
  })

  it('uses a wall NAME as the label when it has one', () => {
    expect(buildMeasurementReconciliation(plan(), [m({})]).rows[0]!.targetLabel).toBe('North wall')
  })

  it('reports a deleted target as unresolved rather than dropping it', () => {
    // Silently discarding a measurement someone took on site would be the worst
    // failure mode this feature could have.
    const r = buildMeasurementReconciliation(plan(), [m({ targetId: 'gone' })])
    expect(r.rows).toHaveLength(1)
    expect(r.rows[0]!.verdict).toBe('unresolved')
    expect(r.rows[0]!.modelMm).toBeNull()
    expect(r.rows[0]!.deviationMm).toBeNull()
    expect(r.unresolvedCount).toBe(1)
    // An unresolved row must not inflate the worst deviation.
    expect(r.worstDeviationMm).toBe(0)
  })

  it('carries a note through verbatim', () => {
    const r = buildMeasurementReconciliation(plan(), [m({ note: 'WL, tape, 2 Sep' })])
    expect(r.rows[0]!.note).toBe('WL, tape, 2 Sep')
  })

  it('always carries the scope note', () => {
    expect(buildMeasurementReconciliation(plan(), []).scopeNote).toBe(RECONCILE_SCOPE_NOTE)
  })

  it('cites no standard clause number in the scope note', () => {
    // Same rule as `export/specification.ts`: a fabricated citation reads as
    // authoritative, which is worse than none.
    expect(RECONCILE_SCOPE_NOTE).not.toMatch(/\b(SS|BS|EN|ISO|CONQUAS)\s?\d/)
  })

  it('is empty and harmless with no measurements recorded', () => {
    const r = buildMeasurementReconciliation(plan())
    expect(r.rows).toEqual([])
    expect(r.exceedsCount).toBe(0)
    expect(r.worstDeviationMm).toBe(0)
  })

  it('reports the WORST deviation across several measurements', () => {
    const r = buildMeasurementReconciliation(plan(), [
      m({ id: 'a', measuredMm: 4005 }),
      m({ id: 'b', measuredMm: 3970 }),
      m({ id: 'c', measuredMm: 4002 }),
    ])
    expect(r.worstDeviationMm).toBe(30)
    expect(r.exceedsCount).toBe(1)
  })
})
