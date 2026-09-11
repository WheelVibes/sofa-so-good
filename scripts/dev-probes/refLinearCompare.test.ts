import { describe, expect, it } from 'vitest'
// @ts-expect-error — dev probes are plain .mjs with no type declarations (see probeImports.test.ts).
import { buildMask, EXCLUDE, toPixels } from './ref-linear-compare.mjs'

/**
 * REF-LINEAR-COMPARE — the pure halves.
 *
 * The comparison needs a rendered pair, so it cannot run here. The MASK can, and it is where a
 * silent error would be most expensive: a mask that quietly kept the glazing would measure the
 * HDB estate backdrop against Cycles' sky and report it as an interior-lighting difference, which
 * is precisely the class of confounding this probe was built to remove.
 */
describe('EXCLUDE', () => {
  it('covers the HUD and the glazing, and nothing else', () => {
    const names = EXCLUDE.map((r: { name: string }) => r.name)
    expect(names).toContain('glazing')
    expect(names.filter((n: string) => n.startsWith('hud-')).length).toBeGreaterThanOrEqual(3)
    // Everything excluded is either HUD or the window: any other exclusion would be throwing away
    // interior pixels that the two renders agree on, which is the signal.
    expect(names.every((n: string) => n === 'glazing' || n.startsWith('hud-'))).toBe(true)
  })

  it('keeps every region inside the frame', () => {
    for (const r of EXCLUDE) {
      expect(r.x).toBeGreaterThanOrEqual(0)
      expect(r.y).toBeGreaterThanOrEqual(0)
      expect(r.x + r.w).toBeLessThanOrEqual(1)
      expect(r.y + r.h).toBeLessThanOrEqual(1)
    }
  })
})

describe('toPixels', () => {
  it('scales fractions to the grid, so a region survives a resolution change', () => {
    expect(toPixels({ x: 0.5, y: 0.25, w: 0.1, h: 0.2 }, 800, 500)).toEqual({
      left: 400,
      top: 125,
      width: 80,
      height: 100,
    })
    // Same region, double the grid: twice the pixels, same part of the picture.
    expect(toPixels({ x: 0.5, y: 0.25, w: 0.1, h: 0.2 }, 1600, 1000)).toEqual({
      left: 800,
      top: 250,
      width: 160,
      height: 200,
    })
  })
})

describe('buildMask', () => {
  it('excludes the regions and keeps a clear majority of the frame', () => {
    const W = 800
    const H = 500
    const mask = buildMask(W, H)
    const kept = mask.reduce((a: number, b: number) => a + b, 0)
    // Enough left to be a distribution rather than a patch, but the glazing really is excluded —
    // a mask that kept ~100 % would mean the regions silently missed.
    expect(kept / (W * H)).toBeGreaterThan(0.6)
    expect(kept / (W * H)).toBeLessThan(0.9)
  })

  it('zeroes the centre of every excluded region', () => {
    const W = 800
    const H = 500
    const mask = buildMask(W, H)
    for (const r of EXCLUDE) {
      const p = toPixels(r, W, H)
      const cx = p.left + Math.floor(p.width / 2)
      const cy = p.top + Math.floor(p.height / 2)
      expect(mask[cy * W + cx]).toBe(0)
    }
  })

  it('is resolution-independent in the FRACTION it keeps', () => {
    // The raster is 2560x1600 and the reference 800x500; if the kept fraction moved with the grid
    // the two would not be measuring the same part of the picture.
    const a = buildMask(800, 500)
    const b = buildMask(1600, 1000)
    const fa = a.reduce((s: number, v: number) => s + v, 0) / (800 * 500)
    const fb = b.reduce((s: number, v: number) => s + v, 0) / (1600 * 1000)
    expect(Math.abs(fa - fb)).toBeLessThan(0.01)
  })

  it('honours a caller-supplied region list', () => {
    const mask = buildMask(10, 10, [{ name: 'all', x: 0, y: 0, w: 1, h: 1 }])
    expect(mask.reduce((s: number, v: number) => s + v, 0)).toBe(0)
  })
})
