import { describe, expect, it } from 'vitest'
import { ellipseFootprintParts } from './footprintShapes'

/** Every corner of a FootprintPart, in the same local (dx/dz-relative) frame
 *  the ellipse is defined in. Parts here are always axis-aligned (rot 0). */
function corners(p: { dx: number; dz: number; w: number; d: number }): [number, number][] {
  const hx = p.w / 2
  const hz = p.d / 2
  return [
    [p.dx - hx, p.dz - hz],
    [p.dx + hx, p.dz - hz],
    [p.dx - hx, p.dz + hz],
    [p.dx + hx, p.dz + hz],
  ]
}

describe('ellipseFootprintParts', () => {
  it('returns 2*steps-3 boxes for the default steps=4 (5 boxes)', () => {
    expect(ellipseFootprintParts(2, 1)).toHaveLength(5)
  })

  it('returns fewer boxes for a coarser approximation (steps=2 → 1 box)', () => {
    expect(ellipseFootprintParts(2, 1, 2)).toHaveLength(1)
  })

  it('returns more boxes for a finer approximation (steps=6 → 9 boxes)', () => {
    expect(ellipseFootprintParts(2, 1, 6)).toHaveLength(9)
  })

  it('every part is axis-aligned (no extra rotation)', () => {
    for (const p of ellipseFootprintParts(1.4, 0.9)) expect(p.rot ?? 0).toBe(0)
  })

  it('every part corner lies inside (or on) the ellipse — union is a true subset', () => {
    const w = 1.6
    const d = 0.8
    const rx = w / 2
    const rz = d / 2
    const parts = ellipseFootprintParts(w, d)
    for (const p of parts) {
      for (const [x, z] of corners(p)) {
        const val = (x / rx) ** 2 + (z / rz) ** 2
        expect(val).toBeLessThanOrEqual(1 + 1e-9)
      }
    }
  })

  it('every part stays within the width×depth bbox', () => {
    const w = 1.2
    const d = 1.2
    const parts = ellipseFootprintParts(w, d)
    for (const p of parts) {
      expect(Math.abs(p.dx) + p.w / 2).toBeLessThanOrEqual(w / 2 + 1e-9)
      expect(Math.abs(p.dz) + p.d / 2).toBeLessThanOrEqual(d / 2 + 1e-9)
    }
  })

  it('is meaningfully tighter than the full bbox (union area well under 100%)', () => {
    const w = 1
    const d = 1
    const parts = ellipseFootprintParts(w, d)
    const area = parts.reduce((sum, p) => sum + p.w * p.d, 0)
    const bboxArea = w * d
    // A perfect circle covers ~78.5% of its bbox; the coarse inscribed
    // staircase covers less than that but should still be a solid majority.
    expect(area).toBeLessThan(bboxArea * 0.95)
    expect(area).toBeGreaterThan(bboxArea * 0.5)
  })

  it('total union area is symmetric under swapping width/depth (no x/z axis bug)', () => {
    // The banding always runs along local Z, so individual box shapes differ
    // between ellipseFootprintParts(2,1) and (1,2) — but the covered AREA must
    // be identical (an ellipse's area doesn't care which axis is "wide").
    const area = (parts: { w: number; d: number }[]) => parts.reduce((s, p) => s + p.w * p.d, 0)
    expect(area(ellipseFootprintParts(2, 1))).toBeCloseTo(area(ellipseFootprintParts(1, 2)), 9)
  })

  it('handles a squashed ellipse (depth much less than width)', () => {
    const w = 2
    const d = 0.4
    const parts = ellipseFootprintParts(w, d)
    for (const p of parts) {
      expect(p.w).toBeLessThanOrEqual(w + 1e-9)
      expect(p.d).toBeLessThanOrEqual(d + 1e-9)
    }
    // Widest (centre) band should be noticeably wider than any side band.
    const centre = parts.find((p) => p.dz === 0)
    const side = parts.filter((p) => p.dz !== 0)
    for (const s of side) expect(centre!.w).toBeGreaterThanOrEqual(s.w)
  })

  it('degenerates to a single full box for a zero/negative extent', () => {
    expect(ellipseFootprintParts(0, 1)).toEqual([{ dx: 0, dz: 0, w: 0, d: 1 }])
    expect(ellipseFootprintParts(-1, 1)).toEqual([{ dx: 0, dz: 0, w: 0, d: 1 }])
  })

  it('degenerates to a single full box when steps < 2', () => {
    expect(ellipseFootprintParts(1.2, 0.8, 1)).toEqual([{ dx: 0, dz: 0, w: 1.2, d: 0.8 }])
  })
})
