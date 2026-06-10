import { describe, expect, it } from 'vitest'
import {
  extractPalette,
  nearestColor,
  type PaletteColor,
  type Rgb,
  relativeLuminance,
  rgbToHex,
} from './imagePalette'

/** Build an RGBA image laid out as `blocks` stacked horizontally. */
const makeImage = (
  blocks: Array<{ color: [number, number, number, number?]; cols: number }>,
  height: number,
): { pixels: Uint8ClampedArray; width: number; height: number } => {
  const width = blocks.reduce((sum, b) => sum + b.cols, 0)
  const pixels = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) {
    let x = 0
    for (const block of blocks) {
      const [r, g, b, a = 255] = block.color
      for (let c = 0; c < block.cols; c++, x++) {
        const o = (y * width + x) * 4
        pixels[o] = r
        pixels[o + 1] = g
        pixels[o + 2] = b
        pixels[o + 3] = a
      }
    }
  }
  return { pixels, width, height }
}

const sumWeights = (p: PaletteColor[]): number => p.reduce((s, c) => s + c.weight, 0)

describe('rgbToHex', () => {
  it('formats lowercase #rrggbb with zero padding', () => {
    expect(rgbToHex({ r: 0, g: 0, b: 0 })).toBe('#000000')
    expect(rgbToHex({ r: 255, g: 255, b: 255 })).toBe('#ffffff')
    expect(rgbToHex({ r: 255, g: 0, b: 16 })).toBe('#ff0010')
  })

  it('clamps and rounds out-of-range channels', () => {
    expect(rgbToHex({ r: -10, g: 300, b: 127.6 })).toBe('#00ff80')
  })
})

describe('relativeLuminance', () => {
  it('returns ~0 for black and ~1 for white', () => {
    expect(relativeLuminance({ r: 0, g: 0, b: 0 })).toBeCloseTo(0, 5)
    expect(relativeLuminance({ r: 255, g: 255, b: 255 })).toBeCloseTo(1, 5)
  })

  it('ranks green brighter than blue', () => {
    const green = relativeLuminance({ r: 0, g: 255, b: 0 })
    const blue = relativeLuminance({ r: 0, g: 0, b: 255 })
    expect(green).toBeGreaterThan(blue)
  })
})

describe('nearestColor', () => {
  const candidates: Rgb[] = [
    { r: 0, g: 0, b: 0 },
    { r: 255, g: 0, b: 0 },
    { r: 0, g: 255, b: 0 },
    { r: 0, g: 0, b: 255 },
  ]

  it('finds the closest candidate by RGB distance', () => {
    expect(nearestColor({ r: 250, g: 10, b: 5 }, candidates)).toEqual({ r: 255, g: 0, b: 0 })
    expect(nearestColor({ r: 10, g: 10, b: 240 }, candidates)).toEqual({ r: 0, g: 0, b: 255 })
  })

  it('returns undefined for an empty candidate list', () => {
    expect(nearestColor({ r: 1, g: 2, b: 3 }, [])).toBeUndefined()
  })
})

describe('extractPalette', () => {
  it('extracts ~3 colours from a 3-block image with weights summing to ~1', () => {
    const { pixels, width, height } = makeImage(
      [
        { color: [200, 30, 30], cols: 10 },
        { color: [30, 200, 30], cols: 10 },
        { color: [30, 30, 200], cols: 10 },
      ],
      10,
    )
    const palette = extractPalette(pixels, width, height, { count: 6, sampleStep: 1 })
    expect(palette).toHaveLength(3)
    expect(sumWeights(palette)).toBeCloseTo(1, 6)

    const hexes = palette.map((c) => c.hex).sort()
    expect(hexes).toEqual(['#1ec81e', '#1e1ec8', '#c81e1e'].sort())
    // Equal-area blocks → roughly equal weights.
    for (const c of palette) expect(c.weight).toBeCloseTo(1 / 3, 5)
  })

  it('is sorted by descending weight', () => {
    const { pixels, width, height } = makeImage(
      [
        { color: [10, 10, 10], cols: 30 },
        { color: [240, 240, 240], cols: 10 },
      ],
      10,
    )
    const palette = extractPalette(pixels, width, height, { sampleStep: 1 })
    expect(palette.length).toBeGreaterThanOrEqual(2)
    for (let i = 1; i < palette.length; i++) {
      expect(palette[i - 1].weight).toBeGreaterThanOrEqual(palette[i].weight)
    }
    expect(palette[0].hex).toBe('#0a0a0a')
  })

  it('returns a single colour with weight ~1 for a solid image', () => {
    const { pixels, width, height } = makeImage([{ color: [123, 45, 67], cols: 20 }], 20)
    const palette = extractPalette(pixels, width, height, { sampleStep: 1 })
    expect(palette).toHaveLength(1)
    expect(palette[0].hex).toBe('#7b2d43')
    expect(palette[0].weight).toBeCloseTo(1, 6)
  })

  it('caps the result at `count`', () => {
    const { pixels, width, height } = makeImage(
      [
        { color: [200, 30, 30], cols: 10 },
        { color: [30, 200, 30], cols: 10 },
        { color: [30, 30, 200], cols: 10 },
        { color: [200, 200, 30], cols: 10 },
      ],
      10,
    )
    const palette = extractPalette(pixels, width, height, { count: 2, sampleStep: 1 })
    expect(palette).toHaveLength(2)
    expect(sumWeights(palette)).toBeCloseTo(1, 6)
  })

  it('returns fewer than `count` when there are fewer distinct colours', () => {
    const { pixels, width, height } = makeImage(
      [
        { color: [200, 30, 30], cols: 10 },
        { color: [30, 30, 200], cols: 10 },
      ],
      10,
    )
    const palette = extractPalette(pixels, width, height, { count: 6, sampleStep: 1 })
    expect(palette).toHaveLength(2)
    // No empty or duplicate clusters.
    expect(new Set(palette.map((c) => c.hex)).size).toBe(palette.length)
  })

  it('skips near-transparent pixels', () => {
    const { pixels, width, height } = makeImage(
      [
        { color: [255, 0, 0, 255], cols: 10 },
        { color: [0, 255, 0, 10], cols: 10 },
      ],
      10,
    )
    const palette = extractPalette(pixels, width, height, { sampleStep: 1 })
    expect(palette).toHaveLength(1)
    expect(palette[0].hex).toBe('#ff0000')
    expect(palette[0].weight).toBeCloseTo(1, 6)
  })

  it('handles a 1x1 image without throwing', () => {
    const { pixels, width, height } = makeImage([{ color: [12, 34, 56], cols: 1 }], 1)
    const palette = extractPalette(pixels, width, height)
    expect(palette).toHaveLength(1)
    expect(palette[0].hex).toBe('#0c2238')
    expect(palette[0].weight).toBeCloseTo(1, 6)
  })

  it('returns [] for empty input', () => {
    expect(extractPalette(new Uint8ClampedArray(0), 0, 0)).toEqual([])
    expect(extractPalette(new Uint8ClampedArray(0), 10, 10)).toEqual([])
  })

  it('returns [] for a fully-transparent image', () => {
    const { pixels, width, height } = makeImage([{ color: [255, 0, 0, 0], cols: 10 }], 10)
    expect(extractPalette(pixels, width, height, { sampleStep: 1 })).toEqual([])
  })

  it('is deterministic across runs', () => {
    const { pixels, width, height } = makeImage(
      [
        { color: [200, 30, 30], cols: 7 },
        { color: [30, 200, 30], cols: 11 },
        { color: [30, 30, 200], cols: 5 },
      ],
      9,
    )
    const a = extractPalette(pixels, width, height, { count: 4, sampleStep: 1 })
    const b = extractPalette(pixels, width, height, { count: 4, sampleStep: 1 })
    expect(a).toEqual(b)
  })
})
