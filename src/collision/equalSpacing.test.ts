import { describe, expect, it } from 'vitest'
import { detectEqualSpacingAxis, type Span } from './equalSpacing'

/** Convenience: a span centred at `c` with half-extent `h`. */
const span = (c: number, h: number): Span => ({ lo: c - h, hi: c + h })

describe('detectEqualSpacingAxis', () => {
  it('returns null with fewer than two gaps available', () => {
    // A single neighbour, no other reference gap → only one drag-gap, no match.
    const r = detectEqualSpacingAxis('x', 2, 0.5, [span(0, 0.5)])
    expect(r).toBeNull()
  })

  it('detects equal spacing between two existing items and the dragged item', () => {
    // Items at 0 and 2 (half 0.5) → reference gap of 1.0 between them.
    // Dragging a third (half 0.5) to centre 4 → gap to the item at 2 is 1.0.
    const others = [span(0, 0.5), span(2, 0.5)]
    const r = detectEqualSpacingAxis('x', 4, 0.5, others)
    expect(r).not.toBeNull()
    expect(r!.axis).toBe('x')
    expect(r!.size).toBeCloseTo(1.0, 3)
    expect(r!.gaps.length).toBeGreaterThanOrEqual(2)
  })

  it('snaps the drag centre to make its gap exactly equal', () => {
    // Reference gap 1.0 (items at 0 and 2). Drag near centre 3.95 → gap ~0.95;
    // within tol, snaps so the gap is exactly 1.0 → centre 3.0(item far) + 1.0 + 0.5 = 3.5? no:
    // neighbour at 2 has hi=2.5; snapCenter = 2.5 + 1.0 + 0.5 = 4.0.
    const others = [span(0, 0.5), span(2, 0.5)]
    const r = detectEqualSpacingAxis('x', 3.95, 0.5, others)
    expect(r).not.toBeNull()
    expect(r!.snapCenter).toBeCloseTo(4.0, 3)
  })

  it('centres the dragged item between two neighbours (equalises both gaps)', () => {
    // Neighbours at 0 and 4 (half 0.5, far edges 0.5 and near edge 3.5).
    // Dragging a half-0.5 item near the middle. Centred at 2.0 → each gap = 1.0.
    const others = [span(0, 0.5), span(4, 0.5)]
    const r = detectEqualSpacingAxis('x', 2.05, 0.5, others)
    expect(r).not.toBeNull()
    expect(r!.snapCenter).toBeCloseTo(2.0, 3)
    expect(r!.size).toBeCloseTo(1.0, 2)
    expect(r!.gaps.length).toBe(2)
  })

  it('matches a gap against a wall face', () => {
    // Wall at x=0. One item at centre 1.0 (half 0.5) → its near edge is 0.5, so
    // gap to wall = 0.5. Drag a half-0.5 item to the right of it forming a 0.5 gap.
    // item.hi = 1.5; drag at 2.5 → gap = 2.5-0.5 - 1.5 = 0.5.
    const others = [span(1, 0.5)]
    const r = detectEqualSpacingAxis('x', 2.5, 0.5, others, [0])
    expect(r).not.toBeNull()
    expect(r!.size).toBeCloseTo(0.5, 2)
  })

  it('ignores overlapping spans as gap partners', () => {
    // Two overlapping items can't form a clean reference gap.
    const others = [span(0, 0.5), span(0.3, 0.5)]
    const r = detectEqualSpacingAxis('x', 4, 0.5, others)
    // No clean reference gap and only one drag-side neighbour → null.
    expect(r).toBeNull()
  })

  it('does not match when gaps differ beyond tolerance', () => {
    // Reference gap 1.0, but the dragged item forms a 2.0 gap (far off).
    const others = [span(0, 0.5), span(2, 0.5)]
    const r = detectEqualSpacingAxis('x', 5.5, 0.5, others, [], { tol: 0.05 })
    expect(r).toBeNull()
  })

  it('respects a custom tolerance', () => {
    const others = [span(0, 0.5), span(2, 0.5)]
    // Gap ~0.9 vs reference 1.0: difference 0.1. Rejected at tol 0.05, accepted at 0.15.
    const drag = 3.9
    expect(detectEqualSpacingAxis('x', drag, 0.5, others, [], { tol: 0.05 })).toBeNull()
    expect(detectEqualSpacingAxis('x', drag, 0.5, others, [], { tol: 0.15 })).not.toBeNull()
  })

  it('prefers the match tying the most gaps together', () => {
    // Three evenly spaced items at 0,2,4 (gap 1.0 each). Drag a fifth to 6 →
    // forms another 1.0 gap, tying 3 reference gaps + the drag gap.
    const others = [span(0, 0.5), span(2, 0.5), span(4, 0.5)]
    const r = detectEqualSpacingAxis('x', 6, 0.5, others)
    expect(r).not.toBeNull()
    expect(r!.size).toBeCloseTo(1.0, 3)
    expect(r!.gaps.length).toBeGreaterThanOrEqual(3)
  })

  it('returns gaps in axis order', () => {
    const others = [span(0, 0.5), span(2, 0.5)]
    const r = detectEqualSpacingAxis('x', 4, 0.5, others)
    expect(r).not.toBeNull()
    const froms = r!.gaps.map((g) => g.from)
    expect([...froms].sort((a, b) => a - b)).toEqual(froms)
  })
})
