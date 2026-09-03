import { describe, expect, it } from 'vitest'
import type { FloorPlan } from '../floorplan/types'
import { BUILTIN_CATALOG } from '../furniture/builtinCatalog'
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

describe('multi-storey scoring (F13/ML5b)', () => {
  it('counts upper-storey rooms and attributes items/emitters per level', () => {
    const plan: FloorPlan = {
      id: 'ml',
      name: 'ML',
      ceilingHeight: 2.6,
      extent: [8, 6],
      walls: [],
      openings: [],
      rooms: [{ id: 'g-liv', name: 'Living', origin: [0, 0], width: 5, depth: 5 }],
      upperLevels: [
        {
          id: 'lvl-2',
          name: 'Upper',
          elevation: 2.9,
          walls: [],
          openings: [],
          rooms: [{ id: 'up-bed', name: 'Bedroom', origin: [0, 0], width: 5, depth: 5 }],
        },
      ],
    }
    // One lamp on the ground floor at an XZ inside BOTH rooms' rectangles.
    const items: FurnitureItem[] = [
      { id: 'lamp', defId: 'floor-lamp', position: [2, 2], rotation: 0, props: {} },
    ]
    const score = buildDesignScore(items, BUILTIN_CATALOG, plan)
    const lighting = score.categories.find((c) => c.id === 'lighting')
    // The ground room is lit; the upper bedroom (same XZ, other storey) is not.
    expect(lighting?.issues.some((i) => i.message.includes('Bedroom'))).toBe(true)
  })
})

/**
 * Circulation had NO tests before v0.31.8.3, which is part of why both of its
 * penalty terms could saturate unnoticed. Measured over a 62-layout corpus, 53
 * of 62 hit the advisory cap and scored exactly `58 - 20 x impassable` — a
 * 100-point category behaving as a 4-valued function of one integer.
 *
 * The first two tests here are the ones that matter, because the OLD formula
 * could not pass them: it charged a flat 20 per pinch and a flat 3 per advisory
 * gap, so pinch DEPTH and gap MAGNITUDE were both invisible to it. Verified by
 * reverting the constants — both fail on the old arithmetic.
 */
describe('circulation scoring', () => {
  const circulationOf = (items: FurnitureItem[]) =>
    buildDesignScore(items, defs, makePlan()).categories.find((c) => c.id === 'circulation')!

  /** Two 1x1 obstacles in the living room with exactly `gap` metres between
   *  their facing edges (centres `1 + gap` apart). */
  const pairWithGap = (gap: number) => [mk('box', 1.5, 2.5), mk('box', 1.5 + 1 + gap, 2.5)]

  it('reports NOTHING for a gap at or below 0.40 m — the finder is blind there', () => {
    // Measured, and it is the reason `CIRCULATION.gradedFloor` is 0.40 rather
    // than an anthropometric figure: `findNarrowGaps` skips any item-item gap
    // `<= CLEARANCE.sofaToCoffee` as intentional close spacing, so two large
    // pieces jammed 0.05 m apart produce no circulation finding at all.
    // This test exists to pin that blindness as a KNOWN, MEASURED limitation
    // rather than leaving it to be rediscovered — see the TODO.md entry. If the
    // finder is ever fixed, this test SHOULD fail.
    for (const gap of [0.05, 0.25, 0.32, 0.4]) {
      expect(
        circulationOf(pairWithGap(gap)).issues.some((i) => /pinch-point/.test(i.message)),
      ).toBe(false)
    }
    // And just above the floor it does report — so the assertion above is about
    // the cutoff, not about the fixture failing to build a gap at all.
    expect(circulationOf(pairWithGap(0.45)).issues.some((i) => /pinch-point/.test(i.message))).toBe(
      true,
    )
  })

  it('grades a reportable pinch by DEPTH — 0.47 m scores better than 0.42 m', () => {
    // The OLD formula charged a flat 20 per pinch, so these two were EQUAL.
    expect(circulationOf(pairWithGap(0.47)).score).toBeGreaterThan(
      circulationOf(pairWithGap(0.42)).score,
    )
  })

  it('charges an advisory gap by SHORTFALL — a near-ideal gap is nearly free', () => {
    // Same gap COUNT in both (one advisory gap, neither a pinch), so the old
    // flat-3-per-gap charge scored them identically.
    expect(circulationOf(pairWithGap(0.88)).score).toBeGreaterThan(
      circulationOf(pairWithGap(0.62)).score,
    )
  })

  it('is monotonic in gap width across the reportable range', () => {
    const widths = [0.42, 0.45, 0.47, 0.55, 0.7, 0.88]
    const scores = widths.map((w) => circulationOf(pairWithGap(w)).score)
    for (let i = 1; i < scores.length; i += 1) {
      expect(scores[i]!).toBeGreaterThanOrEqual(scores[i - 1]!)
    }
    // And it actually moves — a monotonic constant would pass the loop above.
    expect(scores.at(-1)! - scores[0]!).toBeGreaterThan(10)
  })

  it('describes a pinch as passable sideways, not as impassable', () => {
    // The old message called every gap under 0.5 m "impassable", which is
    // simply untrue: ADA's 915 mm is the width for two adults to pass WITHOUT
    // turning sideways, and a person still gets through 0.45 m.
    const msg = circulationOf(pairWithGap(0.45))
      .issues.map((i) => i.message)
      .join(' ')
    expect(msg).toMatch(/passable only sideways/)
    expect(msg).not.toMatch(/impassable/)
  })

  it('never floor-clamps to zero from pinches alone', () => {
    // Six obstacles in a row, every gap 0.45 m — all reportable pinches.
    const items = Array.from({ length: 6 }, (_, i) => mk('box', 1.2 + i * 1.45, 2.5))
    const score = circulationOf(items).score
    expect(score).toBeGreaterThan(0)
  })

  it('gives a clear room full marks, so the scale still reaches 100', () => {
    expect(circulationOf([mk('box', 2.5, 2.5)]).score).toBe(100)
  })
})
