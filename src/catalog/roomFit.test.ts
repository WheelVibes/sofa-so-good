import { describe, expect, it } from 'vitest'
import {
  type AxisAlignedRect,
  freeRectsFromShellRects,
  itemFitsRoom,
  ROOM_FIT_MARGIN,
} from './roomFit'

describe('freeRectsFromShellRects', () => {
  it('reduces axis-aligned rects to plain width/depth pairs', () => {
    const rects: AxisAlignedRect[] = [
      { x0: 0, z0: 0, x1: 3, z1: 4 },
      { x0: 3, z0: 0, x1: 5, z1: 2 }, // an L-shaped extension
    ]
    expect(freeRectsFromShellRects(rects)).toEqual([
      { w: 3, d: 4 },
      { w: 2, d: 2 },
    ])
  })

  it('returns an empty array for an empty rect list', () => {
    expect(freeRectsFromShellRects([])).toEqual([])
  })
})

describe('itemFitsRoom', () => {
  const roomyRect = [{ w: 4, d: 4 }] // plenty of space either way

  it('is "unknown" when no footprint is given', () => {
    expect(itemFitsRoom(null, roomyRect)).toBe('unknown')
    expect(itemFitsRoom(undefined, roomyRect)).toBe('unknown')
  })

  it('is "unknown" for a non-finite / zero / negative footprint (never a false won\'t-fit)', () => {
    expect(itemFitsRoom({ w: Number.NaN, d: 1 }, roomyRect)).toBe('unknown')
    expect(itemFitsRoom({ w: 0, d: 1 }, roomyRect)).toBe('unknown')
    expect(itemFitsRoom({ w: -1, d: 1 }, roomyRect)).toBe('unknown')
    expect(itemFitsRoom({ w: 1, d: Number.POSITIVE_INFINITY }, roomyRect)).toBe('unknown')
  })

  it('is "unknown" when no room is being edited (no rects)', () => {
    expect(itemFitsRoom({ w: 1, d: 1 }, null)).toBe('unknown')
    expect(itemFitsRoom({ w: 1, d: 1 }, undefined)).toBe('unknown')
    expect(itemFitsRoom({ w: 1, d: 1 }, [])).toBe('unknown')
  })

  it('is "unknown" when every candidate rect is degenerate, never "wont-fit"', () => {
    expect(itemFitsRoom({ w: 1, d: 1 }, [{ w: 0, d: 0 }])).toBe('unknown')
  })

  it('is "fits" for a small item in a spacious room (comfortable margin both axes)', () => {
    // A 1.8 x 0.9 sofa in a 4 x 4 room leaves >0.6m clearance on both axes.
    expect(itemFitsRoom({ w: 1.8, d: 0.9 }, roomyRect)).toBe('fits')
  })

  it('honours 90-degree rotation when checking fit', () => {
    // A long, narrow item (0.8 x 3.8) doesn't fit a 4 x 1.0 rect as-given
    // (3.8 deep vs a 1.0m-deep rect), but rotated (3.8 wide x 0.8 deep) it
    // clears the bare minimum margin on both axes.
    const rect = [{ w: 4, d: 1.0 }]
    expect(itemFitsRoom({ w: 0.8, d: 3.8 }, rect)).toBe('tight')
  })

  it('is "tight" when the item only clears the bare minimum skirting margin', () => {
    // Room rect 2.0 x 2.0; item 1.85 x 1.85 leaves 0.15m slack per axis —
    // above the 0.10m minimum but below the 0.60m comfortable margin.
    const rect = [{ w: 2.0, d: 2.0 }]
    expect(itemFitsRoom({ w: 1.85, d: 1.85 }, rect)).toBe('tight')
  })

  it('is "wont-fit" when the item exceeds every rect in every orientation', () => {
    const rect = [{ w: 2.0, d: 2.0 }]
    expect(itemFitsRoom({ w: 3.0, d: 3.0 }, rect)).toBe('wont-fit')
  })

  it('checks every rect of an L-shaped room, not just the first', () => {
    // Fails the tiny main rect but fits comfortably in the larger extension.
    const rects = [
      { w: 1.0, d: 1.0 },
      { w: 4.0, d: 4.0 },
    ]
    expect(itemFitsRoom({ w: 2.0, d: 2.0 }, rects)).toBe('fits')
  })

  it('is exactly at the boundary between wont-fit and tight at the minimum margin', () => {
    const rect = [{ w: 2.0, d: 2.0 }]
    // Item sized so the resulting slack is just OVER the minimum → still placeable.
    const itemLeavingSlackJustOverMin = 2.0 - (ROOM_FIT_MARGIN.minimum + 0.001)
    // Item sized so the resulting slack is just UNDER the minimum → won't fit.
    const itemLeavingSlackJustUnderMin = 2.0 - (ROOM_FIT_MARGIN.minimum - 0.001)
    expect(
      itemFitsRoom({ w: itemLeavingSlackJustOverMin, d: itemLeavingSlackJustOverMin }, rect),
    ).not.toBe('wont-fit')
    expect(
      itemFitsRoom({ w: itemLeavingSlackJustUnderMin, d: itemLeavingSlackJustUnderMin }, rect),
    ).toBe('wont-fit')
  })
})
