/**
 * FINISH-RECOLOR — the pure luminance-preserving, mean-anchored recolor core.
 * Node env: `recolorPixels` needs no DOM (the canvas wrappers are covered by
 * the cache/UI happy-dom tests). Rec.709 weights sum to 1, so a grey pixel's
 * luma equals its value — the fixtures below exploit that for exact assertions.
 */
import { describe, expect, it } from 'vitest'
import { recolorPixels } from './recolor'

/** Build an RGBA buffer from per-pixel `[r,g,b,a]` tuples. */
function rgba(pixels: Array<[number, number, number, number]>): Uint8ClampedArray {
  const out = new Uint8ClampedArray(pixels.length * 4)
  pixels.forEach(([r, g, b, a], i) => {
    out[i * 4] = r
    out[i * 4 + 1] = g
    out[i * 4 + 2] = b
    out[i * 4 + 3] = a
  })
  return out
}

/** Mean of one channel (0=r,1=g,2=b) across an RGBA buffer. */
function channelMean(data: Uint8ClampedArray, ch: number): number {
  let sum = 0
  let count = 0
  for (let i = ch; i < data.length; i += 4) {
    sum += data[i]
    count++
  }
  return sum / count
}

describe('recolorPixels (FINISH-RECOLOR)', () => {
  it('anchors a uniform grey image exactly to the target colour', () => {
    // grey 100 → luma 100 = mean → factor 1 → every pixel becomes the target.
    const data = rgba([
      [100, 100, 100, 255],
      [100, 100, 100, 255],
    ])
    recolorPixels(data, { r: 136, g: 0, b: 255 }) // #8800ff
    expect(Array.from(data.slice(0, 4))).toEqual([136, 0, 255, 255])
    expect(channelMean(data, 0)).toBeCloseTo(136, 5)
    expect(channelMean(data, 1)).toBeCloseTo(0, 5)
    expect(channelMean(data, 2)).toBeCloseTo(255, 5)
  })

  it('keeps the channel means at the target across a varied (non-clamping) image', () => {
    // grey values symmetric about mean 100; a non-saturating target so no clamp.
    const data = rgba([
      [80, 80, 80, 255],
      [90, 90, 90, 255],
      [110, 110, 110, 255],
      [120, 120, 120, 255],
    ])
    recolorPixels(data, { r: 200, g: 100, b: 50 })
    expect(channelMean(data, 0)).toBeCloseTo(200, 4)
    expect(channelMean(data, 1)).toBeCloseTo(100, 4)
    expect(channelMean(data, 2)).toBeCloseTo(50, 4)
  })

  it('lightens a dark source when recolored to a light target', () => {
    // mean luma 30, recolored toward #e0e0e0 → averages light (well above 128).
    const data = rgba([
      [30, 30, 30, 255],
      [30, 30, 30, 255],
    ])
    recolorPixels(data, { r: 224, g: 224, b: 224 })
    expect(channelMean(data, 0)).toBeGreaterThan(128)
    expect(data[0]).toBe(224)
  })

  it('preserves relative contrast ordering (brighter source stays brighter)', () => {
    const data = rgba([
      [60, 60, 60, 255], // darker
      [120, 120, 120, 255], // brighter
    ])
    recolorPixels(data, { r: 200, g: 100, b: 40 })
    expect(data[4]).toBeGreaterThan(data[0]) // r
    expect(data[5]).toBeGreaterThan(data[1]) // g
    expect(data[6]).toBeGreaterThan(data[2]) // b
  })

  it('clamps to 255 without wrapping when the factor overshoots', () => {
    const data = rgba([
      [10, 10, 10, 255],
      [10, 10, 10, 255],
      [10, 10, 10, 255],
      [255, 255, 255, 255], // luma far above the mean → huge factor
    ])
    recolorPixels(data, { r: 255, g: 255, b: 255 })
    // The bright pixel saturates to 255 — NOT a wrapped value like 144.
    expect(data[12]).toBe(255)
    expect(data[13]).toBe(255)
    expect(data[14]).toBe(255)
  })

  it('leaves alpha untouched', () => {
    const data = rgba([
      [100, 100, 100, 10],
      [100, 100, 100, 200],
    ])
    recolorPixels(data, { r: 136, g: 0, b: 255 })
    expect(data[3]).toBe(10)
    expect(data[7]).toBe(200)
  })

  it('flat-fills the target on an all-black image (mean guard)', () => {
    const data = rgba([
      [0, 0, 0, 128],
      [0, 0, 0, 64],
    ])
    recolorPixels(data, { r: 18, g: 52, b: 86 }) // #123456
    expect(Array.from(data.slice(0, 4))).toEqual([18, 52, 86, 128])
    expect(Array.from(data.slice(4, 8))).toEqual([18, 52, 86, 64])
  })

  it('is deterministic (same input twice → identical output)', () => {
    const base: Array<[number, number, number, number]> = [
      [12, 200, 33, 255],
      [180, 40, 90, 128],
      [66, 66, 66, 255],
      [240, 10, 5, 200],
    ]
    const a = rgba(base)
    const b = rgba(base)
    recolorPixels(a, { r: 90, g: 140, b: 210 })
    recolorPixels(b, { r: 90, g: 140, b: 210 })
    expect(Array.from(a)).toEqual(Array.from(b))
  })
})
