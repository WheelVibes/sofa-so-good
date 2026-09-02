/**
 * Rug sizing in the layout critique — the single most-cited amateur error, and
 * the app could place a rug via `autoArrange` without ever checking it.
 * `suggestions.ts` only prompts when a rug is ABSENT: presence, not adequacy,
 * the same shape as the old lighting prompt a single pendant satisfied.
 */
import { describe, expect, it } from 'vitest'
import type { FloorPlan } from '../floorplan/types'
import type { FurnitureDef, FurnitureItem } from '../furniture/types'
import { buildLayoutCritique, CRITIQUE } from './layoutCritique'

const plan = (): FloorPlan =>
  ({
    id: 'p',
    name: 'p',
    extent: [8, 6],
    ceilingHeight: 2.6,
    walls: [],
    openings: [],
    rooms: [{ id: 'liv', name: 'Living', origin: [0, 0], width: 8, depth: 6, category: 'living' }],
  }) as unknown as FloorPlan

const def = (id: string, w: number, d: number): FurnitureDef =>
  ({
    id,
    name: id,
    category: id.includes('rug') ? 'textiles' : id.includes('bed') ? 'beds' : 'seating',
    kind: 'primitive',
    defaultFootprint: { w, d, h: 0.4 },
  }) as unknown as FurnitureDef

const item = (id: string, defId: string, x: number, z: number, rotation = 0): FurnitureItem =>
  ({ id, defId, position: [x, z], rotation, props: {} }) as unknown as FurnitureItem

/** A 2.0 x 0.9 m sofa centred at (4, 2), and rugs of varying size under it. */
const DEFS: Record<string, FurnitureDef> = {
  'sofa-3seat': def('sofa-3seat', 2, 0.9),
  'rug-big': def('rug-big', 3, 2.4),
  'rug-tight': def('rug-tight', 2.1, 1.2),
  'rug-small': def('rug-small', 1.2, 0.8),
  'dining-table': def('dining-table', 1.6, 0.9),
  'rug-dining-ok': def('rug-dining-ok', 3, 2.2),
  'rug-dining-short': def('rug-dining-short', 2, 1.2),
}

const rugFindings = (items: FurnitureItem[]) =>
  buildLayoutCritique(plan(), items, DEFS).findings.filter((f) => f.id === 'rug-size')

describe('rug size against a sofa', () => {
  it('passes a rug extending past both sides', () => {
    // 3.0 wide vs a 2.0 sofa → 0.5 m each side, over the 0.15 minimum.
    const f = rugFindings([item('s', 'sofa-3seat', 4, 2), item('r', 'rug-big', 4, 2)])
    expect(f[0]!.verdict).toBe('pass')
    expect(f[0]!.detail).toMatch(/past the sofa/)
  })

  it('warns on a rug only just wider than the sofa', () => {
    // 2.1 vs 2.0 → 0.05 m each side, under the published 0.15.
    const f = rugFindings([item('s', 'sofa-3seat', 4, 2), item('r', 'rug-tight', 4, 2)])
    expect(f[0]!.verdict).toBe('warn')
    expect(f[0]!.detail).toMatch(/0\.15/)
  })

  it('fails a rug that does not reach under the sofa at all', () => {
    // The classic error: a small rug floating in front of the seating.
    const f = rugFindings([item('s', 'sofa-3seat', 4, 2), item('r', 'rug-small', 4, 4.5)])
    expect(f[0]!.verdict).toBe('fail')
    expect(f[0]!.detail).toMatch(/separate island/)
  })
})

describe('rug size against a dining table', () => {
  it('uses the 24-inch rule, not the sofa rule', () => {
    // 3.0 vs a 1.6 table → 0.7 m each side, over the 0.61 published minimum.
    const f = rugFindings([item('t', 'dining-table', 4, 2), item('r', 'rug-dining-ok', 4, 2)])
    expect(f[0]!.verdict).toBe('pass')
    expect(CRITIQUE.rugDiningSideMin).toBeCloseTo(0.61, 2)
  })

  it('fails a rug chairs would roll off', () => {
    const f = rugFindings([item('t', 'dining-table', 4, 2), item('r', 'rug-dining-short', 4, 2)])
    expect(f[0]!.verdict).toBe('fail')
    expect(f[0]!.detail).toMatch(/a pulled-out chair stays on the rug/)
  })
})

describe('rug size — honesty', () => {
  it('takes the TIGHTEST side, so one generous axis cannot excuse a short one', () => {
    // 2.1 x 1.2 rug on a 2.0 x 0.9 sofa: 0.05 across, 0.15 front-to-back.
    const f = rugFindings([item('s', 'sofa-3seat', 4, 2), item('r', 'rug-tight', 4, 2)])
    expect(f[0]!.verdict).toBe('warn')
  })

  it('REFUSES to measure a rotated pair rather than guessing', () => {
    // A rotated rug's bounding box is LARGER than the rug, so overhang measured
    // from it overstates coverage and would pass a rug that is too small — an
    // error in the dangerous direction.
    // RADIANS — `FurnitureItem.rotation` feeds straight into `Math.cos`.
    // An earlier version of this test passed 30 and 90 as if they were degrees,
    // and both assertions happened to hold anyway: 30 % 90 = 30 > 8 read as
    // "oblique", 90 % 90 = 0 read as "square". Correct verdicts, arrived at from
    // a unit error on both sides — which is how the vacuous `% 90` gate in the
    // product code survived a green suite.
    const f = rugFindings([item('s', 'sofa-3seat', 4, 2), item('r', 'rug-big', 4, 2, Math.PI / 6)])
    expect(
      f.some((x) => x.verdict === 'skipped' && /not square to its anchor/.test(x.detail)),
    ).toBe(true)
  })

  it('accepts a 90-degree difference as square', () => {
    // Perpendicular is still axis-aligned; only oblique angles are refused.
    const f = rugFindings([item('s', 'sofa-3seat', 4, 2), item('r', 'rug-big', 4, 2, Math.PI / 2)])
    expect(f.some((x) => x.verdict !== 'skipped')).toBe(true)
  })

  it('skips when there is no rug, and says which', () => {
    const f = rugFindings([item('s', 'sofa-3seat', 4, 2)])
    expect(f[0]!.verdict).toBe('skipped')
    expect(f[0]!.detail).toMatch(/No rug placed/)
  })

  it('skips when there is a rug but nothing to anchor', () => {
    const f = rugFindings([item('r', 'rug-big', 4, 2)])
    expect(f[0]!.verdict).toBe('skipped')
    expect(f[0]!.detail).toMatch(/No sofa, bed or dining table/)
  })
})

describe('rug size against a bed — the head side is excluded', () => {
  const BED_DEFS: Record<string, FurnitureDef> = {
    // 1.5 x 2.0 m queen, head toward -Z at rotation 0.
    'bed-queen': def('bed-queen', 1.5, 2),
    // Conventional bedroom rug: under the lower two-thirds, 0.5 m clear of each
    // side and the foot, stopping WELL short of the headboard.
    'rug-bedroom': def('rug-bedroom', 2.5, 2),
  }
  const bedFindings = (items: FurnitureItem[]) =>
    buildLayoutCritique(plan(), items, BED_DEFS).findings.filter((f) => f.id === 'rug-size')

  it('PASSES the conventional two-thirds placement', () => {
    // Bed spans z 1..3 (centre 2), rug spans z 2..4 — so it covers the lower
    // two-thirds and the foot by 1.0 m, and does not reach the head at z=1.
    // Measured on all four sides this is -1.00 m and fails; that is exactly the
    // false alarm the head exclusion removes.
    const f = bedFindings([item('b', 'bed-queen', 4, 2), item('r', 'rug-bedroom', 4, 3)])
    expect(f[0]!.verdict).toBe('pass')
    expect(f[0]!.detail).toMatch(/sides or foot/)
  })

  it('still FAILS a rug too narrow at the bed sides', () => {
    // Same placement, but only 2.5 -> 1.6 m wide: 0.05 m each side, under 0.46.
    const f = buildLayoutCritique(
      plan(),
      [item('b', 'bed-queen', 4, 2), item('r', 'rug-narrow', 4, 3)],
      { ...BED_DEFS, 'rug-narrow': def('rug-narrow', 1.6, 2) },
    ).findings.filter((x) => x.id === 'rug-size')
    expect(f[0]!.verdict).toBe('fail')
    expect(f[0]!.detail).toMatch(/0\.46/)
  })

  it('excludes the head side by DIRECTION, following the bed rotation', () => {
    // Bed turned a quarter turn: the head now points +X, because the app maps
    // local (0, -1) to (sin, -cos). The rug is shifted the same way, so the one
    // UNCOVERED side is the head and no other. If the exclusion were hardcoded
    // to -z, or picked whichever side measured worst, this would not
    // discriminate — and it caught a sign error in `headDir` that excluded the
    // foot instead.
    // Bed x 3..5 (the 2 m length now runs along x), rug x 2..4: the uncovered
    // bed edge is +x, which is the head, and both z sides clear by 0.50 m.
    const f = bedFindings([
      item('b', 'bed-queen', 4, 2, Math.PI / 2),
      item('r', 'rug-bedroom', 3, 2, Math.PI / 2),
    ])
    expect(f[0]!.verdict).toBe('pass')
  })

  it('FAILS the mirror image of that, where the FOOT is uncovered', () => {
    // Same quarter-turned bed, rug shifted the other way so the uncovered edge
    // is -x, the foot. This is the pair that makes the rotated case
    // falsifiable: without it, an exclusion that dropped whichever side
    // measured worst would satisfy the passing test above.
    const f = bedFindings([
      item('b', 'bed-queen', 4, 2, Math.PI / 2),
      item('r', 'rug-bedroom', 5, 2, Math.PI / 2),
    ])
    expect(f[0]!.verdict).toBe('fail')
    expect(f[0]!.detail).toMatch(/overhangs the rug by 1\.00 m/)
  })

  it('FAILS when the same shortfall is at the FOOT rather than the head', () => {
    // The mirror image of the passing case: the rug is shifted toward the head,
    // so the foot is the uncovered side. A rule that just dropped the worst
    // side would pass this too — this is the test that makes the exclusion
    // falsifiable.
    const f = bedFindings([item('b', 'bed-queen', 4, 2), item('r', 'rug-bedroom', 4, 1)])
    expect(f[0]!.verdict).toBe('fail')
  })
})

describe('bedside runner — judged on length, not overhang', () => {
  const RDEFS: Record<string, FurnitureDef> = {
    'bed-queen': def('bed-queen', 1.5, 2),
    // 0.7 x 1.8 m runner: 90 % of the bed's length, well over the published
    // three-quarters, and nowhere near the 0.46 m side clearance an under-bed
    // rug needs. Under the overhang rule this is a fail; it is correct design.
    'rug-runner': def('rug-runner', 0.7, 1.8),
    'rug-stubby': def('rug-stubby', 0.7, 1.0),
  }
  const f = (items: FurnitureItem[]) =>
    buildLayoutCritique(plan(), items, RDEFS).findings.filter((x) => x.id === 'rug-size')

  it('PASSES a runner alongside the bed', () => {
    // Bed x 3.25..4.75; runner x 4.85..5.55, a 0.10 m gap on the +x side.
    const r = f([item('b', 'bed-queen', 4, 2), item('r', 'rug-runner', 5.2, 2)])
    expect(r[0]!.verdict).toBe('pass')
    expect(r[0]!.detail).toMatch(/bedside runner: 1\.80 m long against a 2\.00 m bed/)
  })

  it('WARNS on a runner too short to land on', () => {
    // Same position, 1.0 m long against a 2.00 m bed — under the 1.50 m
    // three-quarter mark, so it fails its OWN rule rather than the wrong one.
    const r = f([item('b', 'bed-queen', 4, 2), item('r', 'rug-stubby', 5.2, 2)])
    expect(r[0]!.verdict).toBe('warn')
    expect(r[0]!.detail).toMatch(/wants ≥ 1\.50 m/)
  })

  it('does NOT treat a rug across the room as a runner', () => {
    // Beyond the 0.6 m adjacency gap, so it falls through to the overhang rule
    // and is reported as a separate island. Without this the runner branch
    // would launder any small rug anywhere in the bedroom into a pass.
    const r = f([item('b', 'bed-queen', 4, 2), item('r', 'rug-runner', 7, 5)])
    expect(r[0]!.verdict).toBe('fail')
    expect(r[0]!.detail).toMatch(/separate island/)
  })

  it('does NOT treat a rug mostly UNDER the bed as a runner', () => {
    // A large rug centred on the bed buries most of itself, so the overhang
    // rule applies and it passes on clearance — the runner branch must not
    // intercept it and judge it on length instead.
    const r = buildLayoutCritique(
      plan(),
      [item('b', 'bed-queen', 4, 2), item('r', 'rug-wide', 4, 3)],
      { ...RDEFS, 'rug-wide': def('rug-wide', 2.5, 2) },
    ).findings.filter((x) => x.id === 'rug-size')
    expect(r[0]!.verdict).toBe('pass')
    expect(r[0]!.detail).toMatch(/sides or foot/)
    expect(r[0]!.detail).not.toMatch(/runner/)
  })

  it('applies to BEDS only — a small rug beside a sofa is not a runner', () => {
    const r = buildLayoutCritique(
      plan(),
      [item('s', 'sofa-3seat', 4, 2), item('r', 'rug-runner', 5.2, 2)],
      { ...RDEFS, 'sofa-3seat': def('sofa-3seat', 2, 0.9) },
    ).findings.filter((x) => x.id === 'rug-size')
    expect(r[0]!.detail).not.toMatch(/runner/)
  })
})
