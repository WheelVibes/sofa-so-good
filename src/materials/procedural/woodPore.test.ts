import { describe, expect, it } from 'vitest'
import { makeFbm } from './noise'
import {
  makeWoodPore,
  NYQUIST_CYCLES_PER_TEXEL,
  PORE_ANISOTROPY,
  topOctaveCyclesPerTexel,
  WOOD_PORE,
} from './woodPore'

/** The furniture wood tile's edge (`furnitureMaterials.ts:N`). */
const TILE = 256

describe('topOctaveCyclesPerTexel', () => {
  it('accounts for both the octave doubling and the caller-side uv scale', () => {
    // makeFbm's finest octave multiplies by baseFreq * 2 ** (octaves - 1).
    expect(topOctaveCyclesPerTexel(1, 1, 1, 256)).toBeCloseTo(1 / 256)
    expect(topOctaveCyclesPerTexel(1, 3, 1, 256)).toBeCloseTo(4 / 256)
    expect(topOctaveCyclesPerTexel(1, 3, 10, 256)).toBeCloseTo(40 / 256)
  })

  it('reproduces the SHIPPED-BROKEN wood pore field as wildly undersampled', () => {
    // The regression this module exists to fix: makeFbm(seed, 3, 48) at u * 18.
    // Documented as a test so the number in the docstring stays honest.
    expect(topOctaveCyclesPerTexel(48, 3, 18, TILE)).toBeCloseTo(13.5, 1)
    expect(topOctaveCyclesPerTexel(48, 3, 18, TILE)).toBeGreaterThan(NYQUIST_CYCLES_PER_TEXEL * 25)
  })
})

describe('WOOD_PORE parameters', () => {
  it('keeps every octave inside the tile Nyquist limit', () => {
    const top = topOctaveCyclesPerTexel(
      WOOD_PORE.baseFreq,
      WOOD_PORE.octaves,
      WOOD_PORE.uScale,
      TILE,
    )
    expect(top).toBeLessThan(NYQUIST_CYCLES_PER_TEXEL)
    // And with real margin, not scraping the limit — a field sitting exactly at
    // Nyquist still shimmers under minification.
    expect(top).toBeLessThan(0.42)
  })

  it('preserves the original 15:1 streak anisotropy', () => {
    expect(WOOD_PORE.uScale / WOOD_PORE.vScale).toBeCloseTo(PORE_ANISOTROPY)
  })

  it('still resolves a useful number of hairlines across the tile', () => {
    // Too few and the "pores" become broad blotches instead of a fine grain.
    const octave0 = WOOD_PORE.baseFreq * WOOD_PORE.uScale
    expect(octave0).toBeGreaterThan(24)
    expect(octave0).toBeLessThan(80)
  })
})

describe('makeWoodPore field', () => {
  const pore = makeWoodPore()
  const sample = (n: number) => {
    const rows: number[][] = []
    for (let y = 0; y < n; y++) {
      const row: number[] = []
      for (let x = 0; x < n; x++) row.push(pore(x / n, y / n))
      rows.push(row)
    }
    return rows
  }

  /** Mean |difference| between neighbours along one axis — low means the field
   *  varies SLOWLY along it (a streak runs that way). */
  const roughnessAlong = (rows: number[][], axis: 'u' | 'v') => {
    let sum = 0
    let n = 0
    for (let y = 0; y < rows.length - 1; y++) {
      for (let x = 0; x < rows[y].length - 1; x++) {
        sum += Math.abs(axis === 'u' ? rows[y][x + 1] - rows[y][x] : rows[y + 1][x] - rows[y][x])
        n++
      }
    }
    return sum / n
  }

  it('is deterministic', () => {
    const a = makeWoodPore()
    const b = makeWoodPore()
    expect(a(0.31, 0.77)).toBe(b(0.31, 0.77))
  })

  it('stays within 0..1', () => {
    for (const row of sample(48)) {
      for (const v of row) {
        expect(v).toBeGreaterThanOrEqual(0)
        expect(v).toBeLessThanOrEqual(1)
      }
    }
  })

  it('varies far faster ACROSS the grain than ALONG it (lengthwise hairlines)', () => {
    const rows = sample(TILE)
    const acrossGrain = roughnessAlong(rows, 'u')
    const alongGrain = roughnessAlong(rows, 'v')
    expect(acrossGrain).toBeGreaterThan(alongGrain * 4)
  })

  it('is RESOLVED, not white noise — the property the broken field failed', () => {
    // White noise has neighbour differences as large as its own spread; a
    // resolved field is much smoother than that from texel to texel. This is the
    // assertion that actually distinguishes hairlines from aliased speckle.
    const rows = sample(TILE)
    const flat = rows.flat()
    const mean = flat.reduce((a, b) => a + b, 0) / flat.length
    const sd = Math.sqrt(flat.reduce((a, b) => a + (b - mean) ** 2, 0) / flat.length)
    expect(roughnessAlong(rows, 'u')).toBeLessThan(sd)

    // The old parameters, sampled the same way, fail it — so the test has teeth.
    const broken = makeFbm(WOOD_PORE.seed, 3, 48)
    const brokenRows: number[][] = []
    for (let y = 0; y < TILE; y++) {
      const row: number[] = []
      for (let x = 0; x < TILE; x++) row.push(broken((x / TILE) * 18, (y / TILE) * 1.2))
      brokenRows.push(row)
    }
    const bFlat = brokenRows.flat()
    const bMean = bFlat.reduce((a, b) => a + b, 0) / bFlat.length
    const bSd = Math.sqrt(bFlat.reduce((a, b) => a + (b - bMean) ** 2, 0) / bFlat.length)
    expect(roughnessAlong(brokenRows, 'u')).toBeGreaterThan(bSd)
  })
})
