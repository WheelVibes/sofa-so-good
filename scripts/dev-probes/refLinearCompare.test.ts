import { describe, expect, it } from 'vitest'
// @ts-expect-error — dev probes are plain .mjs with no type declarations (see probeImports.test.ts).
import { buildMask, chromaBuckets, EXCLUDE, saturation, toPixels } from './ref-linear-compare.mjs'

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

describe('saturation', () => {
  it('is 0 for any neutral, including black', () => {
    expect(saturation(0, 0, 0)).toBe(0)
    expect(saturation(128, 128, 128)).toBe(0)
    expect(saturation(255, 255, 255)).toBe(0)
  })

  it('is 1 for a pure primary and scales with the gap', () => {
    expect(saturation(255, 0, 0)).toBe(1)
    expect(saturation(200, 100, 100)).toBeCloseTo(0.5, 6)
  })

  it('is invariant to a uniform EXPOSURE change, which is why it is the chroma metric here', () => {
    // The app's sun is artistic, so any metric that moves with overall level cannot separate a
    // colour error from a brightness one.
    expect(saturation(200, 100, 50)).toBeCloseTo(saturation(100, 50, 25), 6)
  })
})

describe('chromaBuckets', () => {
  const W = 4
  const H = 1
  const mask = new Uint8Array(W * H).fill(1)
  // Reference saturation ascends left to right; the app is flat neutral-ish throughout.
  const ref = Uint8Array.from([200, 200, 200, 200, 180, 180, 200, 140, 140, 200, 40, 40])
  const app = Uint8Array.from([200, 190, 190, 200, 190, 190, 200, 190, 190, 200, 190, 190])

  it('buckets by the REFERENCE, so the app error cannot choose its own bucket', () => {
    const [lo, hi] = chromaBuckets(app, ref, mask, W, H, 2)
    expect(lo.refSat).toBeLessThan(hi.refSat)
    // The app is constant, so any apparent trend in appSat would be the bucketing leaking.
    expect(lo.appSat).toBeCloseTo(hi.appSat, 3)
  })

  it('reports the app UNDER-saturating where the reference is chromatic', () => {
    const [lo, hi] = chromaBuckets(app, ref, mask, W, H, 2)
    expect(hi.satDelta).toBeLessThan(0)
    expect(lo.satDelta).toBeGreaterThan(hi.satDelta)
  })

  it('carries R-B alongside saturation', () => {
    const [, hi] = chromaBuckets(app, ref, mask, W, H, 2)
    // Reference reds dominate in the high bucket, so its R-B is strongly positive.
    expect(hi.refRB).toBeGreaterThan(hi.appRB)
  })

  it('ignores masked-out pixels entirely', () => {
    const half = Uint8Array.from([1, 1, 0, 0])
    const b = chromaBuckets(app, ref, half, W, H, 1)
    expect(b[0].n).toBe(2)
  })
})
