import { describe, expect, it } from 'vitest'
import { boxDownsample, type PixelBuffer } from './ssaaDownsample'

/** Build an RGBA PixelBuffer from a flat array of [r,g,b,a,…] bytes. */
function buf(width: number, height: number, bytes: number[]): PixelBuffer {
  return { data: new Uint8ClampedArray(bytes), width, height }
}

/** Solid-colour buffer for dimension tests. */
function solid(width: number, height: number, rgba: [number, number, number, number]): PixelBuffer {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let i = 0; i < width * height; i++) data.set(rgba, i * 4)
  return { data, width, height }
}

describe('boxDownsample', () => {
  it('output dimensions are floor(src / factor)', () => {
    const out = boxDownsample(solid(8, 6, [10, 20, 30, 255]), 2)
    expect(out.width).toBe(4)
    expect(out.height).toBe(3)
    expect(out.data.length).toBe(4 * 3 * 4)
  })

  it('floors when dimensions are not an exact multiple of factor', () => {
    const out = boxDownsample(solid(9, 7, [0, 0, 0, 255]), 2)
    expect(out.width).toBe(4) // floor(9/2)
    expect(out.height).toBe(3) // floor(7/2)
  })

  it('averages a known 2x2 block of black + white to mid-grey', () => {
    // One 2x2 block: two black [0,0,0,255], two white [255,255,255,255].
    // Row 0: black, white ; Row 1: white, black
    const src = buf(2, 2, [0, 0, 0, 255, 255, 255, 255, 255, 255, 255, 255, 255, 0, 0, 0, 255])
    const out = boxDownsample(src, 2)
    expect(out.width).toBe(1)
    expect(out.height).toBe(1)
    // (0 + 255 + 255 + 0) / 4 = 127.5 → round → 128
    expect(Array.from(out.data)).toEqual([128, 128, 128, 255])
  })

  it('averages each channel independently', () => {
    // 2x2 block, distinct per-channel values.
    const src = buf(2, 2, [40, 80, 120, 200, 40, 80, 120, 200, 40, 80, 120, 200, 40, 80, 120, 200])
    const out = boxDownsample(src, 2)
    // All four pixels identical → average equals the pixel.
    expect(Array.from(out.data)).toEqual([40, 80, 120, 200])
  })

  it('averages alpha, not just colour', () => {
    // 2x2 block with varying alpha: 0, 255, 100, 200 → mean 138.75 → 139
    const src = buf(2, 2, [10, 10, 10, 0, 10, 10, 10, 255, 10, 10, 10, 100, 10, 10, 10, 200])
    const out = boxDownsample(src, 2)
    expect(out.data[3]).toBe(139)
    expect(out.data[0]).toBe(10)
  })

  it('factor=1 is an identity copy (same content, new buffer)', () => {
    const src = buf(2, 1, [1, 2, 3, 4, 5, 6, 7, 8])
    const out = boxDownsample(src, 1)
    expect(out.width).toBe(2)
    expect(out.height).toBe(1)
    expect(Array.from(out.data)).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
    expect(out.data).not.toBe(src.data) // distinct buffer
  })

  it('handles factor=3 averaging over a 3x3 block', () => {
    // 3x3 block all 90 except one 0 → sum = 90*8 = 720, /9 = 80
    const data: number[] = []
    for (let i = 0; i < 9; i++) data.push(90, 90, 90, 90)
    // zero out the first pixel
    data[0] = 0
    data[1] = 0
    data[2] = 0
    data[3] = 0
    const out = boxDownsample(buf(3, 3, data), 3)
    expect(out.width).toBe(1)
    expect(out.height).toBe(1)
    expect(Array.from(out.data)).toEqual([80, 80, 80, 80])
  })

  it('throws on a non-positive or non-integer factor', () => {
    expect(() => boxDownsample(solid(2, 2, [0, 0, 0, 0]), 0)).toThrow()
    expect(() => boxDownsample(solid(2, 2, [0, 0, 0, 0]), -1)).toThrow()
    expect(() => boxDownsample(solid(2, 2, [0, 0, 0, 0]), 1.5)).toThrow()
  })

  it('maps the correct source block to each output pixel (no cross-bleed)', () => {
    // 4x2 source: left half red, right half blue (2x2 each).
    const R = [255, 0, 0, 255]
    const B = [0, 0, 255, 255]
    const src = buf(4, 2, [...R, ...R, ...B, ...B, ...R, ...R, ...B, ...B])
    const out = boxDownsample(src, 2) // → 2x1
    expect(out.width).toBe(2)
    expect(out.height).toBe(1)
    expect(Array.from(out.data.slice(0, 4))).toEqual([255, 0, 0, 255]) // left = red
    expect(Array.from(out.data.slice(4, 8))).toEqual([0, 0, 255, 255]) // right = blue
  })
})
