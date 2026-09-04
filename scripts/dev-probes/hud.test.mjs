import { describe, expect, it } from 'vitest'
import { HUD_RECTS, hudCoverage, hudMask, isHud } from './hud.mjs'

describe('HUD chrome mask', () => {
  it('covers all FIVE rectangles, not the three that are easy to remember', () => {
    // The regression this exists for: `spatial-profile` was first written with
    // toolbar/measure/minimap only, omitting the walk-mode pill and hint bar that
    // v0.31.5.229 added -- and the pill is a near-white block in the FLOOR band.
    expect(HUD_RECTS.map((r) => r.name)).toEqual(['toolbar', 'measure', 'minimap', 'pill', 'hints'])
  })

  it('flags a point inside each rectangle', () => {
    expect(isHud(0.5, 0.05)).toBe(true) // toolbar
    expect(isHud(0.95, 0.03)).toBe(true) // measure
    expect(isHud(0.9, 0.9)).toBe(true) // minimap
    expect(isHud(0.5, 0.85)).toBe(true) // pill
    expect(isHud(0.5, 0.94)).toBe(true) // hints
  })

  it('leaves the centre of the frame alone', () => {
    // Where the actual room is. If this ever fails the mask has eaten the subject.
    expect(isHud(0.5, 0.5)).toBe(false)
    expect(isHud(0.1, 0.5)).toBe(false)
  })

  it('masks the same pixels at two resolutions', () => {
    // Fractions, not pixels -- the app raster is 2560x1440 and a reference 800x450.
    const a = hudCoverage(2560, 1440)
    const b = hudCoverage(800, 450)
    expect(Math.abs(a - b)).toBeLessThan(0.005)
  })

  it('costs a KNOWN fraction of the frame, so the price is never a surprise', () => {
    const cov = hudCoverage(800, 450)
    expect(cov).toBeGreaterThan(0.1)
    expect(cov).toBeLessThan(0.25)
  })

  it('produces a mask whose zeros are exactly the flagged points', () => {
    const w = 200
    const h = 100
    const use = hudMask(w, h)
    for (let y = 0; y < h; y += 7) {
      for (let x = 0; x < w; x += 7) {
        // Sample the pixel CENTRE: isHud takes a point, hudMask covers a cell.
        expect(use[y * w + x] === 0, `(${x},${y})`).toBe(isHud((x + 0.5) / w, (y + 0.5) / h))
      }
    }
  })
})
