import { describe, expect, it } from 'vitest'
// @ts-expect-error — dev probes are plain .mjs with no type declarations (see probeImports.test.ts).
import {
  BLOCK_COLS,
  BLOCK_ROWS,
  blockMeans,
  classifyFraming,
  classifyNight,
  classifyPoseKind,
  DETAIL_FRACTION,
  largestUniformFraction,
  stratumLabel,
} from './corpus-reconcile.mjs'

/**
 * CORPUS-RECONCILE — the pure halves.
 *
 * The hero-vs-detail split is the one judgement call this probe makes that isn't already settled
 * elsewhere in the arc, so it is the part most worth locking down with tests: a silent regression
 * here would misclassify frames and make a stratified comparison look more decisive than it is.
 */
describe('blockMeans', () => {
  it('divides a flat field into equal blocks with the same mean', () => {
    const w = 8
    const h = 6
    const lum = new Float32Array(w * h).fill(100)
    const bm = blockMeans(lum, w, h, 4, 3)
    expect(bm.length).toBe(12)
    for (const v of bm) expect(v).toBeCloseTo(100, 6)
  })

  it('reports a distinct mean per block on a two-tone field', () => {
    const w = 4
    const h = 2
    // Left half 0, right half 200.
    const lum = Float32Array.from([0, 0, 200, 200, 0, 0, 200, 200])
    const bm = blockMeans(lum, w, h, 2, 1)
    expect(bm[0]).toBeCloseTo(0, 6)
    expect(bm[1]).toBeCloseTo(200, 6)
  })
})

describe('largestUniformFraction', () => {
  it('is 1 when every block shares the same value (one surface fills the frame)', () => {
    const bm = new Float64Array(BLOCK_COLS * BLOCK_ROWS).fill(120)
    expect(largestUniformFraction(bm, BLOCK_COLS, BLOCK_ROWS)).toBeCloseTo(1, 6)
  })

  it('is small when the grid alternates so no two neighbours agree', () => {
    const cols = 4
    const rows = 4
    const bm = new Float64Array(cols * rows)
    // True 2D checkerboard by (x + y) parity: every 4-neighbour differs, unlike alternating by
    // flat index alone, which (on an even width) leaves whole COLUMNS constant and connected.
    for (let i = 0; i < bm.length; i++) {
      const x = i % cols
      const y = Math.floor(i / cols)
      bm[i] = (x + y) % 2 ? 0 : 250
    }
    // Every block differs from all four of its neighbours, so the largest connected patch is a
    // single block: 1/16.
    expect(largestUniformFraction(bm, cols, rows)).toBeCloseTo(1 / 16, 6)
  })

  it('requires CONTIGUITY: two equal blocks separated by a different one do not merge', () => {
    // Row of three blocks: 100, 0, 100. The two 100-blocks share a value but are not neighbours,
    // so the largest connected patch is one block (1/3), not two (2/3) — this is the property
    // that rejected a plain "close to the median" count during calibration (see module doc).
    const bm = Float64Array.from([100, 0, 100])
    expect(largestUniformFraction(bm, 3, 1)).toBeCloseTo(1 / 3, 6)
  })

  it('merges a contiguous run within tolerance into one region', () => {
    // 0, 5, 40 with tol 10: blocks 0 and 1 merge (diff 5), block 2 does not join (diff 35).
    const bm = Float64Array.from([0, 5, 40])
    expect(largestUniformFraction(bm, 3, 1, 10)).toBeCloseTo(2 / 3, 6)
  })
})

describe('classifyFraming', () => {
  it('reads a dominant single-region fraction as a tight detail close-up', () => {
    expect(classifyFraming(DETAIL_FRACTION)).toBe('detail')
    expect(classifyFraming(0.9)).toBe('detail')
  })

  it('reads a frame with no dominant region as a hero room view', () => {
    expect(classifyFraming(0)).toBe('hero')
    expect(classifyFraming(DETAIL_FRACTION - 0.01)).toBe('hero')
  })
})

describe('classifyPoseKind', () => {
  it('identifies orbit frames under both naming conventions on disk', () => {
    expect(classifyPoseKind('01-00-orbit-13h.png')).toBe('orbit')
    expect(classifyPoseKind('performance__orbit__yaw0.png')).toBe('orbit')
  })

  it("identifies editor frames — a case `showroom-parity.mjs`'s `isInteriorPose` misses", () => {
    // isInteriorPose only excludes /orbit/, so `21-19-editor-living.png` passes it as "interior";
    // this classifier gives editor its own bucket instead of folding it into interior.
    expect(classifyPoseKind('21-19-editor-living.png')).toBe('editor')
    expect(classifyPoseKind('performance__editor__kitchen.png')).toBe('editor')
  })

  it('falls through to interior for a plain walkthrough frame', () => {
    expect(classifyPoseKind('02-01-living-far.png')).toBe('interior')
    expect(classifyPoseKind('performance__walk__living-far.png')).toBe('interior')
  })
})

describe('classifyNight', () => {
  it("is named, like showroom-parity.mjs's isNightPose", () => {
    expect(classifyNight('16-14-living-night.png')).toBe(true)
    expect(classifyNight('02-01-living-far.png')).toBe(false)
  })
})

describe('stratumLabel', () => {
  it('reports orbit and editor as their own kind regardless of framing or time of day', () => {
    expect(stratumLabel('orbit', false, 'hero')).toBe('orbit')
    expect(stratumLabel('editor', true, 'detail')).toBe('editor')
  })

  it('reports night before framing for an interior frame', () => {
    expect(stratumLabel('interior', true, 'hero')).toBe('interior-night')
    expect(stratumLabel('interior', true, 'detail')).toBe('interior-night')
  })

  it('combines day + framing for a daylit interior frame', () => {
    expect(stratumLabel('interior', false, 'hero')).toBe('interior-day-hero')
    expect(stratumLabel('interior', false, 'detail')).toBe('interior-day-detail')
  })
})
