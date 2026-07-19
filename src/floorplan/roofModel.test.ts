import { describe, expect, it } from 'vitest'
import {
  buildRoofModel,
  outerFootprintBounds,
  ROOF_OVERHANG_MAX,
  ROOF_PITCH_MAX,
  ROOF_PITCH_MIN,
  type RoofBounds,
} from './roofModel'
import type { PlanRoof, PlanWall } from './types'

const BOUNDS: RoofBounds = { minX: 0, minZ: 0, maxX: 6, maxZ: 10 }
const roof = (p: Partial<PlanRoof> = {}): PlanRoof => ({
  style: 'gable',
  pitchDeg: 30,
  overhang: 0,
  ridgeAxis: 'auto',
  ...p,
})

describe('roofModel — outerFootprintBounds', () => {
  it('bounds the external wall endpoints, ignoring internal walls', () => {
    const walls: PlanWall[] = [
      { id: 'n', start: [0.1, 0.1], end: [6.1, 0.1], thickness: 'external' },
      { id: 'e', start: [6.1, 0.1], end: [6.1, 10.1], thickness: 'external' },
      { id: 's', start: [6.1, 10.1], end: [0.1, 10.1], thickness: 'external' },
      { id: 'w', start: [0.1, 10.1], end: [0.1, 0.1], thickness: 'external' },
      { id: 'part', start: [3, 0.1], end: [3, 10.1], thickness: 'internal' },
    ]
    const b = outerFootprintBounds(walls)
    expect(b).toEqual({ minX: 0.1, minZ: 0.1, maxX: 6.1, maxZ: 10.1 })
  })

  it('returns null when there are no external walls', () => {
    expect(
      outerFootprintBounds([{ id: 'a', start: [0, 0], end: [3, 0], thickness: 'internal' }]),
    ).toBeNull()
  })

  it('returns null for a degenerate (near-zero) footprint', () => {
    expect(
      outerFootprintBounds([
        { id: 'a', start: [0, 0], end: [0.2, 0], thickness: 'external' },
        { id: 'b', start: [0.2, 0], end: [0.2, 0.2], thickness: 'external' },
      ]),
    ).toBeNull()
  })
})

describe('roofModel — gable', () => {
  it('produces 2 slope planes + 2 gable planes and the correct rise', () => {
    const m = buildRoofModel(BOUNDS, 5, roof({ ridgeAxis: 'x' }))
    expect(m.fallback).toBe(false)
    expect(m.planes.filter((p) => p.role === 'slope')).toHaveLength(2)
    expect(m.planes.filter((p) => p.role === 'gable')).toHaveLength(2)
    // Ridge along X ⇒ perpendicular span is Z (10) ⇒ half-span 5.
    expect(m.rise).toBeCloseTo(5 * Math.tan((30 * Math.PI) / 180), 5)
    // Ridge apex sits at baseY + rise.
    const apexY = Math.max(...m.planes.flatMap((p) => p.points.map((v) => v[1])))
    expect(apexY).toBeCloseTo(5 + m.rise, 5)
  })

  it('auto ridge runs along the LONGER footprint span', () => {
    // spanX 6 < spanZ 10 ⇒ ridge along Z, slopes face E/W.
    const m = buildRoofModel(BOUNDS, 5, roof({ ridgeAxis: 'auto' }))
    expect(m.ridgeAxis).toBe('z')
    const facings = new Set(m.planes.filter((p) => p.role === 'slope').map((p) => p.facing))
    expect(facings).toEqual(new Set(['E', 'W']))
    // Half-span is now X/2 = 3.
    expect(m.rise).toBeCloseTo(3 * Math.tan((30 * Math.PI) / 180), 5)
  })
})

describe('roofModel — hip', () => {
  it('produces 4 planes (2 slope trapezoids + 2 hip triangles)', () => {
    const m = buildRoofModel(BOUNDS, 5, roof({ style: 'hip', ridgeAxis: 'x' }))
    expect(m.planes).toHaveLength(4)
    expect(m.planes.filter((p) => p.role === 'slope')).toHaveLength(2)
    expect(m.planes.filter((p) => p.role === 'hip')).toHaveLength(2)
  })

  it('rise matches the half short-span', () => {
    const m = buildRoofModel(BOUNDS, 5, roof({ style: 'hip', ridgeAxis: 'x' }))
    // Ridge along X ⇒ short span is Z (10), half 5.
    expect(m.rise).toBeCloseTo(5 * Math.tan((30 * Math.PI) / 180), 5)
  })
})

describe('roofModel — flat-parapet', () => {
  it('is a single flat slab ringed by four parapet walls, no rise', () => {
    const m = buildRoofModel(BOUNDS, 5, roof({ style: 'flat-parapet' }))
    expect(m.rise).toBe(0)
    expect(m.planes.filter((p) => p.role === 'flat')).toHaveLength(1)
    expect(m.parapets).toHaveLength(4)
    // Slab sits at the eave height.
    for (const v of m.planes[0].points) expect(v[1]).toBeCloseTo(5, 6)
  })
})

describe('roofModel — overhang', () => {
  it('extends the eave rectangle outward by the overhang', () => {
    const m = buildRoofModel(BOUNDS, 5, roof({ overhang: 0.4, ridgeAxis: 'x' }))
    expect(m.eave).toEqual({ minX: -0.4, minZ: -0.4, maxX: 6.4, maxZ: 10.4 })
  })

  it('clamps overhang to the allowed maximum', () => {
    const m = buildRoofModel(BOUNDS, 5, roof({ overhang: 5, ridgeAxis: 'x' }))
    expect(m.eave.minX).toBeCloseTo(-ROOF_OVERHANG_MAX, 6)
  })
})

describe('roofModel — pitch clamp', () => {
  it('clamps pitch below the minimum', () => {
    const m = buildRoofModel(BOUNDS, 5, roof({ pitchDeg: 2, ridgeAxis: 'x' }))
    expect(m.rise).toBeCloseTo(5 * Math.tan((ROOF_PITCH_MIN * Math.PI) / 180), 5)
  })
  it('clamps pitch above the maximum', () => {
    const m = buildRoofModel(BOUNDS, 5, roof({ pitchDeg: 80, ridgeAxis: 'x' }))
    expect(m.rise).toBeCloseTo(5 * Math.tan((ROOF_PITCH_MAX * Math.PI) / 180), 5)
  })
})

describe('roofModel — dormers', () => {
  it('positions a gable dormer inside the eave rect on the requested slope', () => {
    const m = buildRoofModel(
      BOUNDS,
      5,
      roof({ ridgeAxis: 'x', dormers: [{ wallSide: 'S', offset: 1, width: 1.2 }] }),
    )
    expect(m.dormers).toHaveLength(1)
    const d = m.dormers[0]
    expect(d.facing).toBe('S')
    // Centre within the eave rectangle, below the ridge apex.
    expect(d.cx).toBeGreaterThanOrEqual(m.eave.minX)
    expect(d.cx).toBeLessThanOrEqual(m.eave.maxX)
    expect(d.cz).toBeGreaterThan((m.eave.minZ + m.eave.maxZ) / 2)
    expect(d.baseY).toBeGreaterThan(5)
    expect(d.baseY).toBeLessThan(5 + m.rise)
  })

  it('drops a dormer whose side is not one the ridge axis faces', () => {
    // Ridge along X faces N/S; an E dormer is invalid.
    const m = buildRoofModel(
      BOUNDS,
      5,
      roof({ ridgeAxis: 'x', dormers: [{ wallSide: 'E', offset: 1, width: 1.2 }] }),
    )
    expect(m.dormers).toHaveLength(0)
  })
})

describe('roofModel — degenerate footprint', () => {
  it('falls back (no roof) for null bounds', () => {
    const m = buildRoofModel(null, 5, roof())
    expect(m.fallback).toBe(true)
    expect(m.planes).toHaveLength(0)
  })

  it('falls back for a collapsed footprint', () => {
    const m = buildRoofModel({ minX: 0, minZ: 0, maxX: 0.1, maxZ: 0.1 }, 5, roof())
    expect(m.fallback).toBe(true)
  })

  it('falls back for a non-finite base height', () => {
    const m = buildRoofModel(BOUNDS, Number.NaN, roof())
    expect(m.fallback).toBe(true)
  })
})
