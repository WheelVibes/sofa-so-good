import { describe, expect, it } from 'vitest'
import { hexToRgb } from '../noise'
import { peranakanFields } from './tile'
import { limewashFields, plasterFields } from './wall'

/**
 * CAT-A heritage/quiet-luxury procedural painters — pure (no DOM/three), so the
 * per-texel Fields are inspected directly.
 *  - `peranakan` = Nyonya majolica encaustic tile (multi-colour, MATTE cement)
 *  - `limewash`  = cloudy mineral-wash paint (broader tonal drift than plaster)
 */

const S = 64
const jade = hexToRgb('#3f7d6a')

function meanRough(rough: Float32Array): number {
  let s = 0
  for (const r of rough) s += r
  return s / rough.length
}

function albedoLumaVariance(albedo: Uint8ClampedArray): number {
  const n = albedo.length / 4
  const luma: number[] = []
  for (let i = 0; i < n; i++) {
    luma.push(0.2126 * albedo[i * 4] + 0.7152 * albedo[i * 4 + 1] + 0.0722 * albedo[i * 4 + 2])
  }
  const mean = luma.reduce((a, b) => a + b, 0) / luma.length
  return luma.reduce((a, b) => a + (b - mean) ** 2, 0) / luma.length
}

function distinctQuantizedColors(albedo: Uint8ClampedArray): number {
  const set = new Set<string>()
  const n = albedo.length / 4
  for (let i = 0; i < n; i++) {
    // Quantize to 16 levels/channel so speckle noise doesn't inflate the count.
    const r = albedo[i * 4] >> 4
    const g = albedo[i * 4 + 1] >> 4
    const b = albedo[i * 4 + 2] >> 4
    set.add(`${r},${g},${b}`)
  }
  return set.size
}

describe('peranakan (Nyonya majolica) painter', () => {
  it('paints full-size buffers', () => {
    const f = peranakanFields(jade, 7, S)
    expect(f.albedo.length).toBe(S * S * 4)
    expect(f.rough.length).toBe(S * S)
  })

  it('is deterministic for identical inputs', () => {
    const a = peranakanFields(jade, 7, S)
    const b = peranakanFields(jade, 7, S)
    expect(Array.from(a.albedo)).toEqual(Array.from(b.albedo))
  })

  it('is genuinely multi-colour (cream ground + field + accent), not monochrome', () => {
    const f = peranakanFields(jade, 7, S)
    // A rich encaustic motif → many distinct quantized colours (a flat tile would
    // have ~1–2). The checker painter, by contrast, only has ~2 tonal families.
    expect(distinctQuantizedColors(f.albedo)).toBeGreaterThan(6)
  })

  it('reads as a MATTE cement tile (high roughness, no glossy glaze)', () => {
    const f = peranakanFields(jade, 7, S)
    expect(meanRough(f.rough)).toBeGreaterThan(0.5)
  })
})

describe('limewash painter', () => {
  it('paints full-size buffers and is deterministic', () => {
    const a = limewashFields(hexToRgb('#e8e6dd'), 3, S)
    const b = limewashFields(hexToRgb('#e8e6dd'), 3, S)
    expect(a.albedo.length).toBe(S * S * 4)
    expect(Array.from(a.albedo)).toEqual(Array.from(b.albedo))
  })

  it('has a broader cloudy tonal wash than flat plaster (its signature)', () => {
    const base = hexToRgb('#cdc6b8')
    const lime = albedoLumaVariance(limewashFields(base, 3, S).albedo)
    const plaster = albedoLumaVariance(plasterFields(base, 3, S).albedo)
    expect(lime).toBeGreaterThan(plaster)
  })

  it('stays matte (near-flat, high roughness)', () => {
    const f = limewashFields(hexToRgb('#cdc6b8'), 3, S)
    expect(meanRough(f.rough)).toBeGreaterThan(0.8)
    expect(f.normalStrength).toBeLessThan(2) // near-flat, no stucco relief
  })
})
