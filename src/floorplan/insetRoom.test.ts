import { describe, expect, it } from 'vitest'
import { insetPolygon } from './insetRoom'
import { type PlanVec2, polygonArea } from './types'

/** A 4×4 m square (CCW in screen coords). */
const SQUARE: PlanVec2[] = [
  [0, 0],
  [4, 0],
  [4, 4],
  [0, 4],
]

/** An L-shape (concave) — a 4×4 square with a 2×2 bite out of the SE corner. */
const L_SHAPE: PlanVec2[] = [
  [0, 0],
  [4, 0],
  [4, 2],
  [2, 2],
  [2, 4],
  [0, 4],
]

describe('insetPolygon', () => {
  it('shrinks a square predictably: a d inset of an S×S square → (S−2d)²', () => {
    const d = 0.5
    const out = insetPolygon(SQUARE, d)
    expect(out).not.toBeNull()
    // 4×4 inset by 0.5 on every side → 3×3 = 9 m².
    expect(polygonArea(out!)).toBeCloseTo((4 - 2 * d) ** 2, 6)
    // Corners pulled in by exactly d on each axis.
    expect(out).toEqual([
      [0.5, 0.5],
      [3.5, 0.5],
      [3.5, 3.5],
      [0.5, 3.5],
    ])
  })

  it('grows a square on a negative distance (outset): (S+2|d|)²', () => {
    const out = insetPolygon(SQUARE, -0.5)
    expect(out).not.toBeNull()
    expect(polygonArea(out!)).toBeCloseTo(5 ** 2, 6)
    expect(out).toEqual([
      [-0.5, -0.5],
      [4.5, -0.5],
      [4.5, 4.5],
      [-0.5, 4.5],
    ])
  })

  it('returns a fresh identity copy for dist 0 (not the same reference)', () => {
    const out = insetPolygon(SQUARE, 0)
    expect(out).toEqual(SQUARE)
    expect(out).not.toBe(SQUARE)
  })

  it('rejects (null) an inset larger than half the min width — the room collapses', () => {
    // Half-width of a 4 m square is 2 m: insetting by ≥ 2 m collapses it.
    expect(insetPolygon(SQUARE, 2)).toBeNull()
    expect(insetPolygon(SQUARE, 2.5)).toBeNull()
    // Just under the limit still works.
    expect(insetPolygon(SQUARE, 1.9)).not.toBeNull()
  })

  it('handles a concave L-shape: area shrinks and stays a valid 6-gon', () => {
    const d = 0.25
    const out = insetPolygon(L_SHAPE, d)
    expect(out).not.toBeNull()
    expect(out).toHaveLength(6)
    // The L's area before inset is 4*4 - 2*2 = 12 m². An inset shrinks it.
    expect(polygonArea(out!)).toBeLessThan(12)
    expect(polygonArea(out!)).toBeGreaterThan(0)
    // The reflex (concave) corner [2,2] moves toward the body on a positive
    // inset — both its coordinates shrink by d (the inset offsets every edge
    // uniformly inward, so the notch corner pulls in to [2−d, 2−d]).
    const reflex = out!.find(
      (p) => Math.abs(p[0] - (2 - d)) < 1e-6 && Math.abs(p[1] - (2 - d)) < 1e-6,
    )
    expect(reflex).toBeDefined()
    expect(reflex![0]).toBeCloseTo(2 - d, 6)
    expect(reflex![1]).toBeCloseTo(2 - d, 6)
  })

  it('outsets a concave L-shape without collapsing', () => {
    const out = insetPolygon(L_SHAPE, -0.3)
    expect(out).not.toBeNull()
    expect(polygonArea(out!)).toBeGreaterThan(12)
  })

  it('composes: two 0.5 m insets equal one 1.0 m inset (same area)', () => {
    const once = insetPolygon(SQUARE, 1.0)
    const twice = insetPolygon(insetPolygon(SQUARE, 0.5)!, 0.5)
    expect(once).not.toBeNull()
    expect(twice).not.toBeNull()
    expect(polygonArea(twice!)).toBeCloseTo(polygonArea(once!), 6)
  })

  it('inset∘outset by the same distance round-trips back to the original area', () => {
    const grown = insetPolygon(SQUARE, -0.4)!
    const back = insetPolygon(grown, 0.4)!
    expect(polygonArea(back)).toBeCloseTo(polygonArea(SQUARE), 6)
  })

  it('works regardless of winding (CW input gives the same shrunk area)', () => {
    const cw = [...SQUARE].reverse()
    const out = insetPolygon(cw, 0.5)
    expect(out).not.toBeNull()
    expect(polygonArea(out!)).toBeCloseTo(9, 6)
  })

  it('returns null for invalid input (< 3 vertices, NaN/Infinity dist, zero-area)', () => {
    expect(insetPolygon([[0, 0]], 0.1)).toBeNull()
    expect(
      insetPolygon(
        [
          [0, 0],
          [1, 1],
        ],
        0.1,
      ),
    ).toBeNull()
    expect(insetPolygon(SQUARE, Number.NaN)).toBeNull()
    expect(insetPolygon(SQUARE, Number.POSITIVE_INFINITY)).toBeNull()
    // Three collinear points = zero area.
    expect(
      insetPolygon(
        [
          [0, 0],
          [1, 0],
          [2, 0],
        ],
        0.1,
      ),
    ).toBeNull()
  })

  it('does not mutate the input polygon', () => {
    const input = SQUARE.map((p) => [...p] as PlanVec2)
    const before = JSON.stringify(input)
    insetPolygon(input, 0.5)
    expect(JSON.stringify(input)).toBe(before)
  })
})
