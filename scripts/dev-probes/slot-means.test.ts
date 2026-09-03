/**
 * `slotRect` maps an atlas slot to PNG pixels. Tested because the UV-space vs
 * PNG-row flip in this exact formula produced — and then invalidated — a whole
 * round of lightmap findings in `v0.31.7.100`/`.101`.
 */
import { describe, expect, it } from 'vitest'
// @ts-expect-error -- plain .mjs dev probe, no type declarations
import { slotRect } from './slot-means.mjs'

describe('slotRect', () => {
  it('puts slot ROW 0 in the LOWER half of the image (UV v=0 is the bottom)', () => {
    // The whole point. Row 0 is the +axis sign, v near 0, which samples the
    // LAST PNG rows because three's default `flipY` is true.
    expect(slotRect(0, 0, 256, 256)).toMatchObject({ y0: 128, y1: 256 })
    expect(slotRect(0, 1, 256, 256)).toMatchObject({ y0: 0, y1: 128 })
  })

  it('splits columns in thirds, left to right', () => {
    expect(slotRect(0, 0, 300, 200)).toMatchObject({ x0: 0, x1: 100 })
    expect(slotRect(1, 0, 300, 200)).toMatchObject({ x0: 100, x1: 200 })
    expect(slotRect(2, 0, 300, 200)).toMatchObject({ x0: 200, x1: 300 })
  })

  it('tiles the image exactly — six slots, no gap, no overlap', () => {
    let area = 0
    for (let col = 0; col < 3; col += 1) {
      for (let row = 0; row < 2; row += 1) {
        const r = slotRect(col, row, 256, 256)
        area += (r.x1 - r.x0) * (r.y1 - r.y0)
      }
    }
    expect(area).toBe(256 * 256)
  })
})
