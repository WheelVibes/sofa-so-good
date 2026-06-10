import { describe, expect, it } from 'vitest'
import type { FloorPlan } from '../floorplan/types'
import type { FurnitureDef, FurnitureItem } from '../furniture/types'
import { buildDesignScore, furnishingCoverageScore } from './designScore'

// Deterministic 1 m × 1 m parametric box (footprint read from props, no GLB cache).
const BOX: FurnitureDef = {
  kind: 'parametric',
  id: 'box' as never,
  name: 'Box',
  category: 'others',
  primitive: 'Bed' as never,
  defaultFootprint: { w: 1, d: 1, h: 1 },
  paramSchema: [],
}
// A light-emitting fixture (defId must be a real LIGHT_EMITTERS key).
const LAMP: FurnitureDef = { ...BOX, id: 'floor-lamp' as never, category: 'lighting' }

const defs: Record<string, FurnitureDef> = { box: BOX, 'floor-lamp': LAMP }

let seq = 0
function mk(defId: string, x: number, z: number, w = 1, d = 1): FurnitureItem {
  return {
    id: `i-${defId}-${seq++}`,
    defId: defId as never,
    position: [x, z],
    rotation: 0,
    props: { width: w, depth: d },
  }
}

/** A custom 10×6 plan with two 5×5 interior rooms and a window on each. */
function makePlan(): FloorPlan {
  const ext: FloorPlan['walls'][number]['thickness'] = 'external'
  return {
    id: 'custom-score-test',
    name: 'Test',
    ceilingHeight: 2.6,
    extent: [10, 6],
    walls: [
      { id: 'n', start: [0.1, 0.1], end: [9.9, 0.1], thickness: ext },
      { id: 'e', start: [9.9, 0.1], end: [9.9, 5.9], thickness: ext },
      { id: 's', start: [9.9, 5.9], end: [0.1, 5.9], thickness: ext },
      { id: 'w', start: [0.1, 5.9], end: [0.1, 0.1], thickness: ext },
    ],
    openings: [
      { id: 'win-a', kind: 'window', wallId: 'n', offset: 1, width: 2.5, sill: 0.9, head: 2.1 },
      { id: 'win-b', kind: 'window', wallId: 'n', offset: 6, width: 2.5, sill: 0.9, head: 2.1 },
    ],
    rooms: [
      { id: 'living', name: 'Living', origin: [0.2, 0.2], width: 4.6, depth: 5.4 },
      { id: 'bedroom', name: 'Bedroom', origin: [5.2, 0.2], width: 4.6, depth: 5.4 },
    ],
  }
}

describe('furnishingCoverageScore', () => {
  it('gives full marks inside the ideal band', () => {
    expect(furnishingCoverageScore(0.3)).toBe(100)
    expect(furnishingCoverageScore(0.22)).toBe(100)
    expect(furnishingCoverageScore(0.45)).toBe(100)
  })
  it('ramps down for a sparse room', () => {
    expect(furnishingCoverageScore(0.05)).toBeLessThan(50)
    expect(furnishingCoverageScore(0.12)).toBeCloseTo(40, 0)
  })
  it('ramps down for a crowded room', () => {
    expect(furnishingCoverageScore(0.7)).toBeLessThan(50)
    expect(furnishingCoverageScore(0.62)).toBeCloseTo(45, 0)
  })
  it('is monotonic across the sparse→ideal→crowded sweep', () => {
    expect(furnishingCoverageScore(0.05)).toBeLessThan(furnishingCoverageScore(0.18))
    expect(furnishingCoverageScore(0.5)).toBeGreaterThan(furnishingCoverageScore(0.62))
  })
})

describe('buildDesignScore', () => {
  it('does not penalise furnishing for an empty design', () => {
    const score = buildDesignScore([], defs, makePlan())
    const furnishing = score.categories.find((c) => c.id === 'furnishing')!
    expect(furnishing.score).toBe(100)
    expect(furnishing.issues[0]!.severity).toBe('info')
    expect(score.itemCount).toBe(0)
    expect(score.roomCount).toBe(2)
  })

  it('flags overlapping furniture as a critical clearance issue and drops the score', () => {
    const a = mk('box', 2.5, 2.5)
    const b = mk('box', 2.6, 2.6) // overlaps a
    const score = buildDesignScore([a, b], defs, makePlan())
    const clearance = score.categories.find((c) => c.id === 'clearance')!
    expect(clearance.score).toBeLessThan(100)
    expect(
      clearance.issues.some((i) => i.severity === 'critical' && /overlap/i.test(i.message)),
    ).toBe(true)
    // The overlapping pair is exposed as offenders for click-to-select.
    expect(new Set(clearance.offenders)).toEqual(new Set([a.id, b.id]))
    // Room-level categories carry no item offenders.
    expect(score.categories.find((c) => c.id === 'daylight')!.offenders).toHaveLength(0)
  })

  it('credits a room with a light fixture and flags a dark one', () => {
    // Lamp in Living, a box (non-emitter) in Bedroom → 1 of 2 rooms lit.
    const lamp = mk('floor-lamp', 2.5, 2.5)
    const box = mk('box', 7.5, 2.5)
    const score = buildDesignScore([lamp, box], defs, makePlan())
    const lighting = score.categories.find((c) => c.id === 'lighting')!
    expect(lighting.score).toBe(50)
    expect(lighting.issues.some((i) => /without a light/i.test(i.message))).toBe(true)
  })

  it('produces a weighted overall in [0,100] with a matching grade', () => {
    const score = buildDesignScore([mk('box', 2.5, 2.5)], defs, makePlan())
    expect(score.overall).toBeGreaterThanOrEqual(0)
    expect(score.overall).toBeLessThanOrEqual(100)
    expect(['A', 'B', 'C', 'D', 'F']).toContain(score.grade)
    // Five categories, weights sum to 1.
    expect(score.categories).toHaveLength(5)
    expect(score.categories.reduce((a, c) => a + c.weight, 0)).toBeCloseTo(1, 5)
  })

  it('is robust to a partial plan with no walls / openings arrays', () => {
    const partial = {
      id: 'partial',
      name: 'Partial',
      ceilingHeight: 2.6,
      extent: [6, 6],
      rooms: [{ id: 'r', name: 'Living', origin: [0.2, 0.2], width: 5.6, depth: 5.6 }],
    } as unknown as FloorPlan
    const score = buildDesignScore([mk('box', 3, 3)], defs, partial)
    expect(score.overall).toBeGreaterThanOrEqual(0)
    expect(score.overall).toBeLessThanOrEqual(100)
    expect(score.categories).toHaveLength(5)
  })

  it('rewards a well-furnished, lit room over an empty shell on furnishing', () => {
    // Fill Living to ~30% of its 24.84 m² (≈7.5 m²) with boxes → ideal band.
    const items = [
      mk('box', 1.5, 1.5, 1.5, 1.5),
      mk('box', 3.5, 1.5, 1.5, 1.5),
      mk('box', 1.5, 3.5, 1.5, 1.5),
      mk('floor-lamp', 3.5, 3.5),
    ]
    const score = buildDesignScore(items, defs, makePlan())
    const furnishing = score.categories.find((c) => c.id === 'furnishing')!
    expect(furnishing.score).toBeGreaterThan(70)
  })
})
