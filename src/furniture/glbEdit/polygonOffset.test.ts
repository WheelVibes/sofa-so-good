import { describe, expect, it } from 'vitest'
import { insetOutline, polygonSelfIntersects, polygonSignedArea } from './polygonOffset'
import { EXTRUDE_PRESETS, type ProfilePoint } from './shapeProfiles'

describe('polygonSignedArea', () => {
  it('is positive for a CCW loop, negative for CW', () => {
    const ccw: ProfilePoint[] = [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ]
    expect(polygonSignedArea(ccw)).toBeCloseTo(1, 5)
    expect(polygonSignedArea([...ccw].reverse())).toBeCloseTo(-1, 5)
  })
})

describe('insetOutline', () => {
  it('insets a convex square inward by delta (area shrinks, orientation kept)', () => {
    const sq: ProfilePoint[] = [
      [-0.5, -0.5],
      [0.5, -0.5],
      [0.5, 0.5],
      [-0.5, 0.5],
    ]
    const inner = insetOutline(sq, 0.1)
    expect(inner).not.toBeNull()
    // A 1×1 square inset 0.1 → an 0.8×0.8 square.
    const a = Math.abs(polygonSignedArea(inner!))
    expect(a).toBeCloseTo(0.64, 2)
    // Same orientation (both CW here, as authored).
    expect(Math.sign(polygonSignedArea(inner!))).toBe(Math.sign(polygonSignedArea(sq)))
  })

  it('handles a concave L outline without self-intersecting', () => {
    // A concave L (the `l-shape` extrude preset). A modest inset stays valid.
    const inner = insetOutline(EXTRUDE_PRESETS['l-shape'], 0.05)
    expect(inner).not.toBeNull()
    // Every point finite.
    for (const p of inner!) {
      expect(Number.isFinite(p[0])).toBe(true)
      expect(Number.isFinite(p[1])).toBe(true)
    }
    // Inset area is smaller than the original.
    expect(Math.abs(polygonSignedArea(inner!))).toBeLessThan(
      Math.abs(polygonSignedArea(EXTRUDE_PRESETS['l-shape'])),
    )
    // The valid inset is NOT self-intersecting.
    expect(polygonSelfIntersects(inner!)).toBe(false)
  })

  it('returns null when the inset collapses the outline (delta too large)', () => {
    const sq: ProfilePoint[] = [
      [-0.5, -0.5],
      [0.5, -0.5],
      [0.5, 0.5],
      [-0.5, 0.5],
    ]
    // delta ≥ half-width → the inset flips/collapses.
    expect(insetOutline(sq, 0.6)).toBeNull()
    expect(insetOutline(sq, 0)).toBeNull()
    expect(insetOutline([[0, 0]], 0.1)).toBeNull()
  })

  it('rejects a same-orientation bowtie inset (self-intersection guard)', () => {
    // A deep, narrow U/staple outline: the two prongs are close enough that a
    // wall-thick inset folds the inner ring THROUGH itself at the neck without
    // reversing any edge heading or flipping the shoelace sign — the case the
    // area/edge-reversal guards miss and the segment-cross check must catch.
    const staple: ProfilePoint[] = [
      [-0.5, -0.5],
      [-0.35, -0.5],
      [-0.35, 0.3], // left prong inner wall
      [0.35, 0.3], // bridge across the top of the slot
      [0.35, -0.5],
      [0.5, -0.5],
      [0.5, 0.5],
      [-0.5, 0.5],
    ]
    // A thickness larger than the half-slot-width (0.35) folds the inset.
    const bad = insetOutline(staple, 0.4)
    // Either the guards reject it (null) or, if a result is produced, it must be
    // free of self-intersection. The bowtie case must NOT slip through as a
    // tangled polygon.
    if (bad) expect(polygonSelfIntersects(bad)).toBe(false)
    else expect(bad).toBeNull()
  })

  it('polygonSelfIntersects flags a hand-built bowtie', () => {
    // Classic bowtie: the two diagonals cross.
    const bowtie: ProfilePoint[] = [
      [0, 0],
      [1, 1],
      [1, 0],
      [0, 1],
    ]
    expect(polygonSelfIntersects(bowtie)).toBe(true)
    // A simple square does not.
    const sq: ProfilePoint[] = [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ]
    expect(polygonSelfIntersects(sq)).toBe(false)
  })
})
