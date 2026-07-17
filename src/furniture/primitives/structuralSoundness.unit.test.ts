import { describe, expect, it } from 'vitest'
import {
  type AABB,
  analyzeStructure,
  boxesConnected,
  type CoplanarBox,
  componentCentroid,
  componentGap,
  connectedComponents,
  detectCoplanarFaces,
  unionBox,
} from './structuralSoundness'

const box = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): AABB => ({
  min: [x0, y0, z0],
  max: [x1, y1, z1],
})

describe('boxesConnected', () => {
  const a = box(0, 0, 0, 1, 1, 1)
  it('true for overlapping boxes', () => {
    expect(boxesConnected(a, box(0.5, 0.5, 0.5, 1.5, 1.5, 1.5), 0.008)).toBe(true)
  })
  it('true for face-touching boxes (zero gap)', () => {
    expect(boxesConnected(a, box(1, 0, 0, 2, 1, 1), 0.008)).toBe(true)
  })
  it('bridges a gap up to 2·eps (both boxes inflate)', () => {
    // 15 mm gap, eps 8 mm → 16 mm of combined inflation closes it.
    expect(boxesConnected(a, box(1.015, 0, 0, 2, 1, 1), 0.008)).toBe(true)
  })
  it('false for a gap beyond 2·eps', () => {
    // 20 mm gap, eps 8 mm → 16 mm inflation leaves it open.
    expect(boxesConnected(a, box(1.02, 0, 0, 2, 1, 1), 0.008)).toBe(false)
  })
  it('requires overlap on ALL three axes', () => {
    // Touching in X but far apart in Z.
    expect(boxesConnected(a, box(1, 0, 5, 2, 1, 6), 0.008)).toBe(false)
  })
})

describe('connectedComponents', () => {
  it('returns [] for no boxes', () => {
    expect(connectedComponents([], 0.008)).toEqual([])
  })
  it('one component when all boxes touch', () => {
    const boxes = [box(0, 0, 0, 1, 1, 1), box(1, 0, 0, 2, 1, 1), box(2, 0, 0, 3, 1, 1)]
    const comps = connectedComponents(boxes, 0.008)
    expect(comps).toHaveLength(1)
    expect(comps[0]).toHaveLength(3)
  })
  it('two components when a box floats away', () => {
    const boxes = [box(0, 0, 0, 1, 1, 1), box(1, 0, 0, 2, 1, 1), box(5, 5, 5, 6, 6, 6)]
    const comps = connectedComponents(boxes, 0.008)
    expect(comps).toHaveLength(2)
    // Largest first.
    expect(comps[0]).toEqual([0, 1])
    expect(comps[1]).toEqual([2])
  })
  it('transitively links a chain (A–B–C) even though A and C do not touch', () => {
    const boxes = [box(0, 0, 0, 1, 1, 1), box(1, 0, 0, 2, 1, 1), box(2, 0, 0, 3, 1, 1)]
    expect(connectedComponents(boxes, 0.008)).toHaveLength(1)
  })
  it('sorts components largest-first then by first index', () => {
    const boxes = [box(10, 0, 0, 11, 1, 1), box(0, 0, 0, 1, 1, 1), box(1, 0, 0, 2, 1, 1)]
    const comps = connectedComponents(boxes, 0.008)
    expect(comps[0]).toEqual([1, 2])
    expect(comps[1]).toEqual([0])
  })
})

describe('unionBox', () => {
  it('is null for no boxes', () => {
    expect(unionBox([])).toBeNull()
  })
  it('spans the extremes of all boxes', () => {
    const u = unionBox([box(0, 0, 0, 1, 1, 1), box(-2, 3, 0, 0, 4, 5)])
    expect(u).toEqual(box(-2, 0, 0, 1, 4, 5))
  })
})

describe('componentCentroid', () => {
  it('averages box centres', () => {
    const boxes = [box(0, 0, 0, 2, 2, 2), box(2, 2, 2, 4, 4, 4)]
    expect(componentCentroid(boxes, [0, 1])).toEqual([2, 2, 2])
  })
})

describe('componentGap', () => {
  it('is the nearest cross-pair separation', () => {
    const boxes = [box(0, 0, 0, 1, 1, 1), box(1.05, 0, 0, 2, 1, 1)]
    expect(componentGap(boxes, [0], [1])).toBeCloseTo(0.05, 6)
  })
  it('is zero for overlapping components', () => {
    const boxes = [box(0, 0, 0, 1, 1, 1), box(0.5, 0, 0, 1.5, 1, 1)]
    expect(componentGap(boxes, [0], [1])).toBe(0)
  })
})

describe('analyzeStructure', () => {
  it('reports a single grounded component', () => {
    const boxes = [box(-0.5, 0, -0.5, 0.5, 1, 0.5), box(-0.5, 1, -0.5, 0.5, 1.2, 0.5)]
    const r = analyzeStructure(boxes, 0.008)
    expect(r.componentCount).toBe(1)
    expect(r.minY).toBe(0)
    expect(r.maxY).toBeCloseTo(1.2, 6)
    expect(r.largestGap).toBe(0)
  })
  it('reports the gap between the two largest components', () => {
    const boxes = [box(0, 0, 0, 1, 1, 1), box(0, 1, 0, 1, 2, 1), box(0, 3, 0, 1, 4, 1)]
    const r = analyzeStructure(boxes, 0.008)
    expect(r.componentCount).toBe(2)
    // comp0 = [0,1] (y 0..2), comp1 = [2] (y 3..4) → 1 m gap.
    expect(r.largestGap).toBeCloseTo(1, 6)
  })
  it('handles empty input', () => {
    const r = analyzeStructure([], 0.008)
    expect(r.componentCount).toBe(0)
    expect(r.union).toBeNull()
    expect(Number.isNaN(r.minY)).toBe(true)
  })
})

describe('detectCoplanarFaces', () => {
  const cbox = (
    x0: number,
    y0: number,
    z0: number,
    x1: number,
    y1: number,
    z1: number,
    extra: Partial<CoplanarBox> = {},
  ): CoplanarBox => ({ min: [x0, y0, z0], max: [x1, y1, z1], ...extra })

  it('flags two same-normal (+Z) faces on the same plane with overlapping area', () => {
    // Both boxes' +Z (max) face at z=1, projections overlap fully in X/Y.
    const boxes = [cbox(0, 0, 0, 0.5, 0.5, 1), cbox(0, 0, 0.5, 0.5, 0.5, 1)]
    const hits = detectCoplanarFaces(boxes)
    const zHit = hits.find((h) => h.axis === 2 && h.dir === 1)
    expect(zHit).toBeDefined()
    expect(zHit?.plane).toBeCloseTo(1, 6)
    expect(zHit?.area).toBeCloseTo(0.25, 6)
  })

  it('flags the aircon case — a small face flush INSIDE a big box front plane', () => {
    // Body front at z=0.1; buried louvre front also at z=0.1 (coplanar, same +Z).
    const body = cbox(-0.42, 0, -0.1, 0.42, 0.3, 0.1, { material: 'body' })
    const louvre = cbox(-0.38, 0, 0.06, 0.38, 0.04, 0.1, { material: 'louvre' })
    const hits = detectCoplanarFaces([body, louvre])
    expect(hits.some((h) => h.axis === 2 && h.dir === 1)).toBe(true)
  })

  it('does NOT flag an abutting face-to-face joint (leg top meets seat bottom)', () => {
    // Leg y 0..0.4 (max face y=0.4); seat y 0.4..0.5 (min face y=0.4). Same plane
    // but OPPOSING normals (+Y vs −Y) — a legitimate contact, not a z-fight.
    const leg = cbox(0, 0, 0, 0.1, 0.4, 0.1)
    const seat = cbox(-0.3, 0.4, -0.3, 0.3, 0.5, 0.3)
    const hits = detectCoplanarFaces([leg, seat])
    expect(hits).toHaveLength(0)
  })

  it('does NOT flag a corner/edge kiss (coplanar but ~zero shared area)', () => {
    // Two boxes with coplanar +Y tops (y=1) but touching only along an edge in X.
    const a = cbox(0, 0, 0, 1, 1, 1)
    const b = cbox(1, 0, 0, 2, 1, 1)
    expect(detectCoplanarFaces([a, b])).toHaveLength(0)
  })

  it('does NOT flag faces on DIFFERENT planes (a healthy proud offset)', () => {
    // Second box front is 4 mm proud of the first — beyond the 0.3 mm eps.
    const a = cbox(0, 0, 0, 1, 1, 1)
    const b = cbox(0.1, 0.1, 0, 0.9, 0.9, 1.004)
    const hits = detectCoplanarFaces([a, b])
    expect(hits.some((h) => h.axis === 2 && h.dir === 1)).toBe(false)
  })

  it('does NOT flag a face strictly INSIDE the other box volume', () => {
    // Small box fully inside big box, no face on any surface plane.
    const big = cbox(0, 0, 0, 1, 1, 1)
    const small = cbox(0.3, 0.3, 0.3, 0.7, 0.7, 0.7)
    expect(detectCoplanarFaces([big, small])).toHaveLength(0)
  })

  it('does NOT flag a same-material coplanar pair (invisible flicker)', () => {
    // Identical to the first test but both carry the same material signature.
    const boxes = [
      cbox(0, 0, 0, 0.5, 0.5, 1, { material: 'oak' }),
      cbox(0, 0, 0.5, 0.5, 0.5, 1, { material: 'oak' }),
    ]
    expect(detectCoplanarFaces(boxes)).toHaveLength(0)
  })

  it('DOES flag a different-material coplanar pair', () => {
    const boxes = [
      cbox(0, 0, 0, 0.5, 0.5, 1, { material: 'oak' }),
      cbox(0, 0, 0.5, 0.5, 0.5, 1, { material: 'steel' }),
    ]
    expect(detectCoplanarFaces(boxes).length).toBeGreaterThan(0)
  })

  it('skips rotated (non-axis-aligned) boxes entirely', () => {
    const boxes = [cbox(0, 0, 0, 0.5, 0.5, 1, { axisAligned: false }), cbox(0, 0, 0.5, 0.5, 0.5, 1)]
    expect(detectCoplanarFaces(boxes)).toHaveLength(0)
  })

  it('skips round-geometry boxes (synthetic AABB faces — two bottles side by side)', () => {
    // Two cylinders' AABBs share top/bottom planes and overlap in XZ, but their
    // curved sides only kiss the AABB — not a real coplanar surface.
    const boxes = [
      cbox(0, 0, 0, 0.1, 0.3, 0.1, { boxFaces: false }),
      cbox(0.05, 0, 0.05, 0.15, 0.3, 0.15, { boxFaces: false }),
    ]
    expect(detectCoplanarFaces(boxes)).toHaveLength(0)
  })
})
