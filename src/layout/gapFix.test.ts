import { describe, expect, it } from 'vitest'
import { gapFixVector, type PositionedGap, suggestGapFixes } from './gapFix'

// A `PositionedGap` matching the real `findNarrowGaps` (`NarrowGap`) shape —
// `a`/`b`/`gap`/`severity`/`wall` — enriched with the two footprint centres the
// fix derives its separation axis from. Box A sits left of box B on the X axis.
function gapOnX(gap: number, opts: Partial<PositionedGap> = {}): PositionedGap {
  return {
    a: 'A',
    b: 'B',
    gap,
    severity: 'tight',
    wall: false,
    ax: 0,
    az: 0,
    bx: 2,
    bz: 0,
    ...opts,
  }
}

describe('gapFixVector', () => {
  it('nudges a sub-clearance gap by exactly (required - current) along the axis', () => {
    const fix = gapFixVector(gapOnX(0.5), 0.9)
    expect(fix.distance).toBeCloseTo(0.4, 6)
    // A is at x=0, B at x=2 → away-from-B points toward −X.
    expect(fix.dx).toBeCloseTo(-0.4, 6)
    expect(fix.dz).toBeCloseTo(0, 6)
    // Magnitude equals the shortfall.
    expect(Math.hypot(fix.dx, fix.dz)).toBeCloseTo(0.4, 6)
  })

  it('points away from the opposing item', () => {
    // A right of B (A at x=2, B at x=0) → nudge toward +X.
    const fix = gapFixVector(gapOnX(0.5, { ax: 2, bx: 0 }), 0.9)
    expect(fix.dx).toBeGreaterThan(0)
    expect(fix.dz).toBeCloseTo(0, 6)
    // Direction is the unit vector A−B times the shortfall.
    expect(fix.dx).toBeCloseTo(0.4, 6)
  })

  it('handles a diagonal separation axis', () => {
    // A at origin, B at (1,1): away-from-B unit dir = (−1,−1)/√2.
    const fix = gapFixVector(gapOnX(0.5, { ax: 0, az: 0, bx: 1, bz: 1 }), 0.9)
    const inv = 1 / Math.SQRT2
    expect(fix.dx).toBeCloseTo(-0.4 * inv, 6)
    expect(fix.dz).toBeCloseTo(-0.4 * inv, 6)
    expect(Math.hypot(fix.dx, fix.dz)).toBeCloseTo(0.4, 6)
  })

  it('returns a zero vector for an already-clear gap (== required)', () => {
    const fix = gapFixVector(gapOnX(0.9), 0.9)
    expect(fix).toEqual({ dx: 0, dz: 0, distance: 0 })
  })

  it('returns a zero vector for a gap above the requirement', () => {
    const fix = gapFixVector(gapOnX(1.2), 0.9)
    expect(fix).toEqual({ dx: 0, dz: 0, distance: 0 })
  })

  it('defaults to +X for coincident centres (degenerate axis)', () => {
    const fix = gapFixVector(gapOnX(0.5, { ax: 1, az: 1, bx: 1, bz: 1 }), 0.9)
    expect(fix.dx).toBeCloseTo(0.4, 6)
    expect(fix.dz).toBeCloseTo(0, 6)
  })
})

describe('suggestGapFixes', () => {
  it('filters out already-clear gaps and keeps their original index', () => {
    const gaps: PositionedGap[] = [
      gapOnX(0.5), // index 0 — needs a fix
      gapOnX(1.0), // index 1 — already clear, skipped
      gapOnX(0.6), // index 2 — needs a fix
    ]
    const fixes = suggestGapFixes(gaps, 0.9)
    expect(fixes).toHaveLength(2)
    expect(fixes.map((f) => f.gapIndex)).toEqual([0, 2])
    expect(fixes[0]!.distance).toBeCloseTo(0.4, 6)
    expect(fixes[1]!.distance).toBeCloseTo(0.3, 6)
  })

  it('returns an empty list when every gap is clear', () => {
    const fixes = suggestGapFixes([gapOnX(0.9), gapOnX(1.5)], 0.9)
    expect(fixes).toEqual([])
  })
})
