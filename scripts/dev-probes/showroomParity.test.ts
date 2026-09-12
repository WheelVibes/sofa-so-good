import { describe, expect, it } from 'vitest'
// @ts-expect-error — dev probes are plain .mjs with no type declarations (see probeImports.test.ts).
import {
  band,
  CROP,
  isInteriorPose,
  isNightPose,
  localContrast,
  rec709,
} from './showroom-parity.mjs'

/**
 * SHOWROOM-PARITY — the pure halves.
 *
 * The comparison needs a corpus of photographs and a GPU, so it cannot run here. What can run is
 * everything that decides WHICH pixels and WHICH frames are compared — and that is where a silent
 * error is most expensive, because it would look like a render finding. The first run of this
 * probe proved it: including four orbit/dollhouse frames, which are a cutaway seen from outside
 * the flat, moved three metrics.
 */
describe('CROP', () => {
  it('excludes the app HUD at top-centre and the bottom corners', () => {
    // Toolbar sits above y 0.10, the minimap and interaction pill below y 0.79.
    expect(CROP.y).toBeGreaterThanOrEqual(0.1)
    expect(CROP.y + CROP.h).toBeLessThanOrEqual(0.8)
  })

  it('still keeps most of the frame, or the statistics stop describing the picture', () => {
    expect(CROP.w * CROP.h).toBeGreaterThan(0.5)
  })

  it('is a single fixed rule, applied to BOTH corpora', () => {
    // Fractions, not pixels: the references are 1000-7360 px wide and the app frames 2560, and a
    // pixel crop would sample a different part of each.
    for (const v of [CROP.x, CROP.y, CROP.w, CROP.h]) expect(v).toBeGreaterThan(0)
    expect(CROP.x + CROP.w).toBeLessThanOrEqual(1)
  })
})

describe('pose filters', () => {
  it('rejects orbit frames as non-interior', () => {
    expect(isInteriorPose('01-00-orbit-13h.png')).toBe(false)
    expect(isInteriorPose('17-17-orbit-0730-goldenhour.png')).toBe(false)
    expect(isInteriorPose('02-01-living-far.png')).toBe(true)
  })

  it('identifies night poses, which a daylit corpus cannot judge', () => {
    expect(isNightPose('16-14-living-night.png')).toBe(true)
    expect(isNightPose('15-serviceyard-night.png')).toBe(true)
    expect(isNightPose('02-01-living-far.png')).toBe(false)
  })
})

describe('rec709', () => {
  it('weights green most', () => {
    expect(rec709(0, 255, 0)).toBeGreaterThan(rec709(255, 0, 0))
    expect(rec709(255, 0, 0)).toBeGreaterThan(rec709(0, 0, 255))
  })
})

describe('localContrast', () => {
  it('is 0 on a flat field', () => {
    const w = 40
    const h = 40
    expect(localContrast(new Float32Array(w * h).fill(128), w, h)).toBeCloseTo(0, 6)
  })

  it('rises with surface detail', () => {
    const w = 40
    const h = 40
    const noisy = new Float32Array(w * h)
    for (let i = 0; i < noisy.length; i++) noisy[i] = i % 2 ? 160 : 96
    expect(localContrast(noisy, w, h)).toBeGreaterThan(10)
  })
})

describe('band', () => {
  it('reports p10/p50/p90 of a corpus, not a single value', () => {
    const b = band([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    expect(b.n).toBe(10)
    expect(b.p50).toBe(5)
    expect(b.p10).toBeLessThan(b.p50)
    expect(b.p90).toBeGreaterThan(b.p50)
  })

  it('does not mutate its input', () => {
    // The caller passes a mapped array per metric; an in-place sort would silently reorder the
    // per-image records and misalign any later join.
    const src = [3, 1, 2]
    band(src)
    expect(src).toEqual([3, 1, 2])
  })
})
