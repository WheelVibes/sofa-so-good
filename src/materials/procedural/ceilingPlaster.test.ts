import { describe, expect, it } from 'vitest'
import {
  CEILING_PLASTER_ALBEDO_AMPLITUDE,
  CEILING_PLASTER_BASE_ROUGHNESS,
  CEILING_PLASTER_COLOR,
  ceilingPlasterFields,
  effectiveCeilingPlasterSize,
} from './ceilingPlaster'
import { heightToNormalRGBA, hexToRgb } from './noise'

const SEED = 0x9c1e
const S = 64 // small tile for fast, exact-arithmetic assertions
const BASE = hexToRgb(CEILING_PLASTER_COLOR)

describe('ceilingPlasterFields (CEILING-PLASTER determinism)', () => {
  it('is byte-identical for the same seed/base/size', () => {
    const a = ceilingPlasterFields(BASE, SEED, S)
    const b = ceilingPlasterFields(BASE, SEED, S)
    expect(a.albedo).toEqual(b.albedo)
    expect(a.height).toEqual(b.height)
    expect(a.rough).toEqual(b.rough)
  })

  it('changes with the seed (not a constant field)', () => {
    const a = ceilingPlasterFields(BASE, SEED, S)
    const b = ceilingPlasterFields(BASE, 0x2222, S)
    let differs = false
    for (let i = 0; i < a.albedo.length && !differs; i++) {
      if (a.albedo[i] !== b.albedo[i]) differs = true
    }
    expect(differs).toBe(true)
  })
})

describe('ceilingPlasterFields — mean albedo pinned to the flat colour (MEAN-PRESERVING)', () => {
  it('keeps the mean albedo within 0.5% of #fafafa (linear-order channel means)', () => {
    const f = ceilingPlasterFields(BASE, SEED, S)
    const n = S * S
    let sumR = 0
    let sumG = 0
    let sumB = 0
    for (let i = 0; i < n; i++) {
      sumR += f.albedo[i * 4]
      sumG += f.albedo[i * 4 + 1]
      sumB += f.albedo[i * 4 + 2]
    }
    const meanR = sumR / n
    const meanG = sumG / n
    const meanB = sumB / n
    for (const [mean, base] of [
      [meanR, BASE[0]],
      [meanG, BASE[1]],
      [meanB, BASE[2]],
    ] as const) {
      const relErr = Math.abs(mean - base) / base
      expect(relErr).toBeLessThan(0.005)
    }
  })

  it('bounds the per-texel albedo swing to roughly the ±2-3% ask', () => {
    const f = ceilingPlasterFields(BASE, SEED, S)
    const n = S * S
    let maxRelDelta = 0
    for (let i = 0; i < n; i++) {
      const r = f.albedo[i * 4]
      const rel = Math.abs(r - BASE[0]) / BASE[0]
      if (rel > maxRelDelta) maxRelDelta = rel
    }
    // Upper bound: the swing is ±amplitude around 1.0, plus one byte of
    // rounding slack. Past this the bright half would clip at 255 and the
    // mean-preserving property above would quietly fail.
    expect(maxRelDelta).toBeLessThanOrEqual(CEILING_PLASTER_ALBEDO_AMPLITUDE + 0.005)
    // LOWER bound, and it is the assertion with teeth. The field is
    // peak-normalised, so the realized swing must actually REACH the constant.
    // Without the normalisation `makeFbm`'s octaves peaked near ±0.15 and the
    // texture shipped a ±0.8 % swing where ±2 % was designed — measured as a
    // 0.45-count ON-vs-OFF difference on the phone ceiling crop, i.e. nothing.
    // 0.7, not 1.0: `shade` rounds to bytes, so on a 250-count base the
    // realized extreme lands at 4 counts (0.016) against the nominal 5.
    expect(maxRelDelta).toBeGreaterThanOrEqual(CEILING_PLASTER_ALBEDO_AMPLITUDE * 0.7)
  })
})

describe('ceilingPlasterFields — roughness stays in the matte skim-coat band', () => {
  it('every texel resolves between 0.9 and 1.0', () => {
    const f = ceilingPlasterFields(BASE, SEED, S)
    let min = Infinity
    let max = -Infinity
    for (let i = 0; i < S * S; i++) {
      if (f.rough[i] < min) min = f.rough[i]
      if (f.rough[i] > max) max = f.rough[i]
    }
    expect(min).toBeGreaterThanOrEqual(0.9)
    expect(max).toBeLessThanOrEqual(1.0)
    // The base is actually inside the band, not just the clamp doing the work.
    expect(CEILING_PLASTER_BASE_ROUGHNESS).toBeGreaterThan(0.9)
    expect(CEILING_PLASTER_BASE_ROUGHNESS).toBeLessThan(1.0)
  })
})

describe('ceilingPlasterFields — bump amplitude is tiny (normal map stays near-flat)', () => {
  it('the derived normal deviates only slightly from (0,0,1) on average', () => {
    const f = ceilingPlasterFields(BASE, SEED, S)
    const normal = heightToNormalRGBA(f.height, S, f.normalStrength)
    let sumDevXY = 0
    const n = S * S
    for (let i = 0; i < n; i++) {
      const nx = normal[i * 4] / 255 - 0.5
      const ny = normal[i * 4 + 1] / 255 - 0.5
      sumDevXY += Math.hypot(nx, ny)
    }
    const meanDev = sumDevXY / n
    // A visibly bumpy surface (e.g. the wall's own orange-peel plaster at
    // normalStrength 1.1) reads well above 0.05; this ceiling finish is
    // deliberately under half that strength.
    expect(meanDev).toBeLessThan(0.05)
  })
})

describe('ceilingPlasterFields — tileable: no seam at the tile edge (world-space UV wrap)', () => {
  it('the wrap-around texel step is not larger than a typical interior step', () => {
    const f = ceilingPlasterFields(BASE, SEED, S)
    let interiorSum = 0
    let interiorCount = 0
    let wrapSum = 0
    for (let y = 0; y < S; y++) {
      for (let x = 1; x < S; x++) {
        interiorSum += Math.abs(f.height[y * S + x] - f.height[y * S + x - 1])
        interiorCount++
      }
      wrapSum += Math.abs(f.height[y * S] - f.height[y * S + S - 1])
    }
    const interiorMean = interiorSum / interiorCount
    const wrapMean = wrapSum / S
    // A real seam would spike the wrap-boundary step far above the interior's
    // own texel-to-texel step; this bounds it to the same order of magnitude.
    expect(wrapMean).toBeLessThanOrEqual(interiorMean * 3 + 1e-6)
  })
})

describe('effectiveCeilingPlasterSize (resolution by tier, CEILING-PLASTER)', () => {
  it('caps at 256 even when the global base size is 512 (Medium+/high-frequency headroom unused)', () => {
    expect(effectiveCeilingPlasterSize(512)).toBe(256)
  })

  it('matches the global base size when it is already at or under the cap', () => {
    expect(effectiveCeilingPlasterSize(256)).toBe(256)
  })

  it('never returns below the 128 floor', () => {
    expect(effectiveCeilingPlasterSize(64)).toBe(128)
    expect(effectiveCeilingPlasterSize(0)).toBe(128)
  })
})
