import { describe, expect, it } from 'vitest'
import { buildBrushedMetalFields, DEFAULT_BRUSH_PARAMS } from './metalBrush'

const SIZE = 64

/** Per-row std-dev (variance scanning ACROSS the brush, along a row at fixed v),
 *  averaged over all rows. */
function meanRowStd(field: Float32Array, size: number): number {
  let total = 0
  for (let y = 0; y < size; y++) {
    let mean = 0
    for (let x = 0; x < size; x++) mean += field[y * size + x]
    mean /= size
    let varSum = 0
    for (let x = 0; x < size; x++) {
      const d = field[y * size + x] - mean
      varSum += d * d
    }
    total += Math.sqrt(varSum / size)
  }
  return total / size
}

/** Per-column std-dev (variance scanning ALONG the brush, down a column at fixed
 *  u), averaged over all columns. */
function meanColStd(field: Float32Array, size: number): number {
  let total = 0
  for (let x = 0; x < size; x++) {
    let mean = 0
    for (let y = 0; y < size; y++) mean += field[y * size + x]
    mean /= size
    let varSum = 0
    for (let y = 0; y < size; y++) {
      const d = field[y * size + x] - mean
      varSum += d * d
    }
    total += Math.sqrt(varSum / size)
  }
  return total / size
}

describe('buildBrushedMetalFields', () => {
  it('returns row-major fields of the requested size', () => {
    const { height, rough } = buildBrushedMetalFields(SIZE, 0x4242, DEFAULT_BRUSH_PARAMS)
    expect(height).toHaveLength(SIZE * SIZE)
    expect(rough).toHaveLength(SIZE * SIZE)
  })

  it('is deterministic given the same seed + params', () => {
    const a = buildBrushedMetalFields(SIZE, 7, DEFAULT_BRUSH_PARAMS)
    const b = buildBrushedMetalFields(SIZE, 7, DEFAULT_BRUSH_PARAMS)
    expect(Array.from(a.height)).toEqual(Array.from(b.height))
    expect(Array.from(a.rough)).toEqual(Array.from(b.rough))
  })

  it('produces a DIRECTIONAL brush — row-variance ≫ column-variance', () => {
    // The brush runs along U: scanning across a row crosses many hairlines (high
    // variance); scanning down a column stays on a hairline (low variance).
    const { height } = buildBrushedMetalFields(SIZE, 0x4242, DEFAULT_BRUSH_PARAMS)
    const rowStd = meanRowStd(height, SIZE)
    const colStd = meanColStd(height, SIZE)
    expect(rowStd).toBeGreaterThan(colStd * 4)
  })

  it('the roughness streak is directional too (row-variance ≫ column-variance)', () => {
    const { rough } = buildBrushedMetalFields(SIZE, 0x4242, DEFAULT_BRUSH_PARAMS)
    expect(meanRowStd(rough, SIZE)).toBeGreaterThan(meanColStd(rough, SIZE) * 4)
  })

  it('values stay in range and the height is centred near 0.5', () => {
    const { height, rough } = buildBrushedMetalFields(SIZE, 1, DEFAULT_BRUSH_PARAMS)
    let hSum = 0
    for (const h of height) {
      expect(h).toBeGreaterThanOrEqual(0)
      expect(h).toBeLessThanOrEqual(1)
      hSum += h
    }
    // Mean-preserving baseline → the baked normal's flat reference is mid-grey.
    expect(hSum / height.length).toBeCloseTo(0.5, 1)
    // Roughness delta is a small signed whisper.
    for (const r of rough) expect(Math.abs(r)).toBeLessThanOrEqual(0.07)
  })

  it('streak: 0 collapses to a flat, plain metal (no grain, no rough delta)', () => {
    const { height, rough } = buildBrushedMetalFields(SIZE, 1, { streak: 0, anisotropy: 0.5 })
    for (const h of height) expect(h).toBe(0.5)
    for (const r of rough) expect(r).toBe(0)
  })
})
