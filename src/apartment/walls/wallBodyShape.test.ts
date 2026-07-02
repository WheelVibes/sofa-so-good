import { describe, expect, it } from 'vitest'
import type { WallSpec } from '../types'
import { buildWallBodyOutline, OPENING_CLEARANCE, wallBodyOutlineFromSpans } from './wallBodyShape'

const wall = (cutouts: WallSpec['cutouts']): WallSpec => ({
  id: 'w',
  start: [0, 0],
  end: [4, 0],
  thickness: 'external',
  cutouts,
})

describe('buildWallBodyOutline', () => {
  it('returns a plain rectangle for a solid wall (no cutouts)', () => {
    const { outline, holes } = buildWallBodyOutline(wall([]), 2.6, 4, 0, 0)
    expect(holes).toEqual([])
    // centred: x in [-2, 2], y in [0, 2.6]
    expect(outline).toEqual([
      [-2, 0],
      [2, 0],
      [2, 2.6],
      [-2, 2.6],
    ])
  })

  it('extends the outer rectangle by the abutment at each end', () => {
    const { outline } = buildWallBodyOutline(wall([]), 2.6, 4, 0.1, 0.05)
    expect(outline[0]).toEqual([-2.1, 0]) // start extended by startAbut
    expect(outline[1]).toEqual([2.05, 0]) // end extended by endAbut
  })

  it('carves a floor-reaching cutout (door) as a bottom notch, not a hole', () => {
    const { outline, holes } = buildWallBodyOutline(
      wall([{ kind: 'door', offset: 1.5, width: 1, sill: 0, head: 2.1 }]),
      2.6,
      4,
      0,
      0,
    )
    expect(holes).toEqual([]) // not an interior hole
    // notch: door spans local x [1.5-2, 2.5-2] = [-0.5, 0.5], up to head 2.1
    expect(outline).toEqual([
      [-2, 0],
      [-0.5, 0],
      [-0.5, 2.1],
      [0.5, 2.1],
      [0.5, 0],
      [2, 0],
      [2, 2.6],
      [-2, 2.6],
    ])
  })

  it('makes a floating cutout (window with a sill) an interior hole', () => {
    const { outline, holes } = buildWallBodyOutline(
      wall([{ kind: 'window', offset: 1, width: 1.4, sill: 0.95, head: 2.1 }]),
      2.6,
      4,
      0,
      0,
    )
    // outer contour is the plain rectangle (no notch)
    expect(outline).toEqual([
      [-2, 0],
      [2, 0],
      [2, 2.6],
      [-2, 2.6],
    ])
    // one hole spanning local x [1-2, 2.4-2] = [-1, 0.4], y [0.95, 2.1]
    expect(holes).toHaveLength(1)
    const rounded = holes[0].map(([x, y]) => [Math.round(x * 1e6) / 1e6, y])
    expect(rounded).toEqual([
      [-1, 0.95],
      [0.4, 0.95],
      [0.4, 2.1],
      [-1, 2.1],
    ])
  })

  it('clamps a cutout head to the wall top and drops degenerate cutouts', () => {
    const { holes } = buildWallBodyOutline(
      wall([
        { kind: 'window', offset: 1, width: 1, sill: 0.95, head: 5 }, // head clamped to 2.6
        { kind: 'window', offset: 2.5, width: 1, sill: 2.7, head: 2.9 }, // entirely above top → dropped
      ]),
      2.6,
      4,
      0,
      0,
    )
    expect(holes).toHaveLength(1)
    expect(holes[0][2][1]).toBe(2.6) // top clamped to wall top
  })
})

describe('wallBodyOutlineFromSpans', () => {
  it('carves a door span as a bottom notch and a window span as a hole', () => {
    const { outline, holes } = wallBodyOutlineFromSpans(
      [
        { a: -0.5, b: 0.5, bottom: 0, top: 2.1 }, // door (reaches floor)
        { a: 1, b: 1.8, bottom: 0.9, top: 2.1 }, // window (floating)
      ],
      -2,
      2,
      2.6,
    )
    expect(outline).toEqual([
      [-2, 0],
      [-0.5, 0],
      [-0.5, 2.1],
      [0.5, 2.1],
      [0.5, 0],
      [2, 0],
      [2, 2.6],
      [-2, 2.6],
    ])
    expect(holes).toEqual([
      [
        [1, 0.9],
        [1.8, 0.9],
        [1.8, 2.1],
        [1, 2.1],
      ],
    ])
  })

  it('shrinks each cutout inward by the clearance (kills leaf/jamb coplanarity)', () => {
    const c = OPENING_CLEARANCE
    const { outline, holes } = wallBodyOutlineFromSpans(
      [
        { a: -0.5, b: 0.5, bottom: 0, top: 2.1 }, // door: keeps floor at 0
        { a: 1, b: 1.8, bottom: 0.9, top: 2.1 }, // window: sill pulls in too
      ],
      -2,
      2,
      2.6,
      c,
    )
    // Door notch is narrower and shorter, but still reaches the floor (y=0).
    expect(outline).toEqual([
      [-2, 0],
      [-0.5 + c, 0],
      [-0.5 + c, 2.1 - c],
      [0.5 - c, 2.1 - c],
      [0.5 - c, 0],
      [2, 0],
      [2, 2.6],
      [-2, 2.6],
    ])
    // Window hole inset on all four edges.
    expect(holes).toEqual([
      [
        [1 + c, 0.9 + c],
        [1.8 - c, 0.9 + c],
        [1.8 - c, 2.1 - c],
        [1 + c, 2.1 - c],
      ],
    ])
  })

  it('clamps spans to the outer edges and drops ones outside the clip', () => {
    // A span entirely to the right of the clip (a shared wall's far-room opening)
    // is clamped to b <= a and dropped, leaving a plain rectangle.
    const { outline, holes } = wallBodyOutlineFromSpans(
      [{ a: 3, b: 4, bottom: 0, top: 2.1 }],
      -2,
      2,
      2.6,
    )
    expect(holes).toEqual([])
    expect(outline).toEqual([
      [-2, 0],
      [2, 0],
      [2, 2.6],
      [-2, 2.6],
    ])
  })
})
