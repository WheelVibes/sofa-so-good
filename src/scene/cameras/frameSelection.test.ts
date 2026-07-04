import { describe, expect, it } from 'vitest'
import { BUILTIN_CATALOG } from '../../furniture/builtinCatalog'
import type { FurnitureItem } from '../../furniture/types'
import {
  clampOrbitDistance,
  FRAME_MIN_RADIUS,
  fitDistanceForFov,
  type ItemFrameExtent,
  ORBIT_MAX_DISTANCE,
  ORBIT_MIN_DISTANCE,
  resolveSelectionExtents,
  selectionBounds,
} from './frameSelection'

const box = (
  cx: number,
  cz: number,
  hx: number,
  hz: number,
  rot = 0,
  base = 0,
  top = 1,
): ItemFrameExtent => ({ obb: { cx, cz, hx, hz, rot }, base, top })

describe('selectionBounds', () => {
  it('returns null for an empty selection', () => {
    expect(selectionBounds([])).toBeNull()
  })

  it('a single axis-aligned box: centre + radius from its own half-extents', () => {
    const b = selectionBounds([box(2, 3, 1, 0.5, 0, 0, 1)])!
    expect(b.center).toEqual([2, 0.5, 3])
    // hypot(1, 0.5, 0.5)
    expect(b.radius).toBeCloseTo(Math.hypot(1, 0.5, 0.5), 5)
  })

  it('unions two disjoint boxes into one bounding box centred between them', () => {
    const a = box(-2, 0, 0.5, 0.5, 0, 0, 1)
    const c = box(2, 0, 0.5, 0.5, 0, 0, 1)
    const b = selectionBounds([a, c])!
    expect(b.center[0]).toBeCloseTo(0, 5)
    expect(b.center[2]).toBeCloseTo(0, 5)
    // Union AABB spans x in [-2.5, 2.5] → half-extent 2.5.
    expect(b.radius).toBeGreaterThan(2.4)
  })

  it('a 45°-rotated box has a larger world-axis half-extent than unrotated', () => {
    const straight = selectionBounds([box(0, 0, 1, 0.2, 0)])!
    const rotated = selectionBounds([box(0, 0, 1, 0.2, Math.PI / 4)])!
    expect(rotated.radius).toBeGreaterThan(straight.radius)
  })

  it('a degenerate point-like item still gets a floor radius (never zero)', () => {
    const b = selectionBounds([box(0, 0, 0, 0, 0, 0, 0)])!
    expect(b.radius).toBe(FRAME_MIN_RADIUS)
  })

  it('vertical span from tall + short items sets the union height', () => {
    const short = box(0, 0, 0.3, 0.3, 0, 0, 0.5)
    const tall = box(0, 0, 0.3, 0.3, 0, 0, 2.2)
    const b = selectionBounds([short, tall])!
    // centre Y is the midpoint of the union's [0, 2.2] vertical span.
    expect(b.center[1]).toBeCloseTo(1.1, 5)
  })
})

describe('fitDistanceForFov', () => {
  it('a bigger radius needs a bigger distance (monotonic)', () => {
    const vFov = (50 * Math.PI) / 180
    const d1 = fitDistanceForFov(1, vFov, 1.5)
    const d2 = fitDistanceForFov(2, vFov, 1.5)
    expect(d2).toBeGreaterThan(d1)
  })

  it('a narrower aspect (portrait) needs more distance for the same radius', () => {
    const vFov = (50 * Math.PI) / 180
    const landscape = fitDistanceForFov(1, vFov, 1.6)
    const portrait = fitDistanceForFov(1, vFov, 0.5)
    expect(portrait).toBeGreaterThan(landscape)
  })

  it('never divides by ~zero for a degenerate near-180° fov', () => {
    expect(Number.isFinite(fitDistanceForFov(1, Math.PI, 1))).toBe(true)
  })
})

describe('clampOrbitDistance', () => {
  it('clamps into [ORBIT_MIN_DISTANCE, ORBIT_MAX_DISTANCE]', () => {
    expect(clampOrbitDistance(0)).toBe(ORBIT_MIN_DISTANCE)
    expect(clampOrbitDistance(1000)).toBe(ORBIT_MAX_DISTANCE)
    expect(clampOrbitDistance(10)).toBe(10)
  })

  it('falls back to the minimum for a non-finite input', () => {
    expect(clampOrbitDistance(Number.NaN)).toBe(ORBIT_MIN_DISTANCE)
    expect(clampOrbitDistance(Number.POSITIVE_INFINITY)).toBe(ORBIT_MIN_DISTANCE)
  })
})

describe('resolveSelectionExtents', () => {
  const sofa: FurnitureItem = {
    id: 's1',
    defId: 'sofa-3seat',
    position: [1, 2],
    rotation: 0,
    props: {},
  }
  const bed: FurnitureItem = {
    id: 'b1',
    defId: 'bed-double',
    position: [5, 5],
    rotation: 0,
    props: {},
  }

  it('resolves an OBB + vertical span per selected item, in item order', () => {
    const extents = resolveSelectionExtents([sofa, bed], ['s1', 'b1'], BUILTIN_CATALOG)
    expect(extents).toHaveLength(2)
    expect(extents[0].obb.cx).toBeCloseTo(1, 5)
    expect(extents[1].obb.cx).toBeCloseTo(5, 5)
    // Every builtin def resolves *some* positive vertical span.
    for (const e of extents) expect(e.top).toBeGreaterThan(e.base)
  })

  it('ignores ids not in the selection and defs missing from the catalog', () => {
    const extents = resolveSelectionExtents([sofa, bed], ['s1'], BUILTIN_CATALOG)
    expect(extents).toHaveLength(1)
    expect(extents[0].obb.cx).toBeCloseTo(1, 5)

    const stray: FurnitureItem = { ...sofa, id: 'x1', defId: 'not-a-real-def' as never }
    const withStray = resolveSelectionExtents([stray], ['x1'], BUILTIN_CATALOG)
    expect(withStray).toHaveLength(0)
  })

  it('returns [] for an empty selection without touching the catalog', () => {
    expect(resolveSelectionExtents([sofa, bed], [], BUILTIN_CATALOG)).toEqual([])
  })
})
