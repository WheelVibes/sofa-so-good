import { describe, expect, it } from 'vitest'
import {
  blendPaintPixel,
  hexToRgb,
  isPaintablePolygon,
  luminance,
  MIN_PAINT_AREA,
  type Point,
  paintImageDataInPolygon,
  pointInPolygon,
  polygonArea,
  polygonBounds,
  type RGB,
  setLuminance,
} from './composite'

const near = (a: number, b: number, eps = 0.5) => Math.abs(a - b) <= eps

describe('luminance / setLuminance', () => {
  it('setLuminance preserves the requested luma', () => {
    const out = setLuminance([200, 40, 40], 128)
    expect(near(luminance(out), 128)).toBe(true)
  })
  it('keeps every channel within the 0–255 gamut (clip)', () => {
    // A very light target luma on a saturated colour would overflow without clip.
    const out = setLuminance([255, 0, 0], 250)
    for (const ch of out) {
      expect(ch).toBeGreaterThanOrEqual(-0.01)
      expect(ch).toBeLessThanOrEqual(255.01)
    }
  })
})

describe('blendPaintPixel (photo-luminance-preserving recolour)', () => {
  const paint: RGB = [40, 90, 200] // a blue

  it('preserves the photo pixel luminance on a LIGHT wall', () => {
    const light: RGB = [225, 220, 215]
    const out = blendPaintPixel(light, paint)
    expect(near(luminance(out), luminance(light), 1)).toBe(true)
    // and it actually took the paint's blue-ness: B channel is the largest.
    expect(out[2]).toBeGreaterThan(out[0])
    expect(out[2]).toBeGreaterThan(out[1])
  })

  it('preserves the photo pixel luminance on a DARK wall (stays dark, not a flat sticker)', () => {
    const dark: RGB = [40, 38, 36]
    const out = blendPaintPixel(dark, paint)
    expect(near(luminance(out), luminance(dark), 1)).toBe(true)
    // dark input must stay dark — nowhere near the raw swatch's brightness.
    expect(luminance(out)).toBeLessThan(luminance(paint))
  })

  it('a shadow stays darker than a highlight after painting (shading preserved)', () => {
    const shadow = blendPaintPixel([60, 58, 55], paint)
    const highlight = blendPaintPixel([230, 226, 222], paint)
    expect(luminance(highlight)).toBeGreaterThan(luminance(shadow) + 50)
  })

  it('strength 0 returns the untouched photo pixel', () => {
    const base: RGB = [123, 45, 67]
    const out = blendPaintPixel(base, paint, 0)
    expect(out.map(Math.round)).toEqual([123, 45, 67])
  })

  it('strength between 0 and 1 sits between original and full recolour', () => {
    const base: RGB = [200, 200, 200]
    const full = blendPaintPixel(base, paint, 1)
    const half = blendPaintPixel(base, paint, 0.5)
    // half's blue channel is between the original grey and the full recolour.
    expect(half[2]).toBeGreaterThan(base[2])
    expect(half[2]).toBeLessThan(full[2])
  })
})

describe('hexToRgb', () => {
  it('parses 6-digit and 3-digit hex, with/without #', () => {
    expect(hexToRgb('#ff8800')).toEqual([255, 136, 0])
    expect(hexToRgb('0f0')).toEqual([0, 255, 0])
    expect(hexToRgb('#ABC')).toEqual([170, 187, 204])
  })
  it('rejects garbage', () => {
    expect(hexToRgb('nope')).toBeNull()
    expect(hexToRgb('#12')).toBeNull()
  })
})

describe('pointInPolygon', () => {
  const square: Point[] = [
    [0, 0],
    [10, 0],
    [10, 10],
    [0, 10],
  ]
  it('detects inside / outside', () => {
    expect(pointInPolygon([5, 5], square)).toBe(true)
    expect(pointInPolygon([15, 5], square)).toBe(false)
    expect(pointInPolygon([-1, -1], square)).toBe(false)
  })
  it('is false for a degenerate polygon (<3 pts)', () => {
    expect(pointInPolygon([1, 1], [[0, 0]])).toBe(false)
  })
  it('handles a concave polygon', () => {
    // Right-pointing arrowhead with a notch at the left ([3,5]).
    const arrow: Point[] = [
      [0, 0],
      [10, 5],
      [0, 10],
      [3, 5],
    ]
    expect(pointInPolygon([6, 5], arrow)).toBe(true) // in the solid body, right of the notch
    expect(pointInPolygon([1, 5], arrow)).toBe(false) // in the concave notch gap
  })
})

describe('polygonArea / bounds / isPaintablePolygon', () => {
  it('shoelace area is orientation-independent', () => {
    const cw: Point[] = [
      [0, 0],
      [0, 10],
      [10, 10],
      [10, 0],
    ]
    const ccw = [...cw].reverse()
    expect(polygonArea(cw)).toBe(100)
    expect(polygonArea(ccw)).toBe(100)
  })
  it('area is 0 for <3 points', () => {
    expect(
      polygonArea([
        [0, 0],
        [1, 1],
      ]),
    ).toBe(0)
  })
  it('bounds cover every vertex', () => {
    const b = polygonBounds([
      [2, 3],
      [8, 1],
      [5, 9],
    ])
    expect(b).toEqual({ minX: 2, minY: 1, maxX: 8, maxY: 9 })
  })
  it('isPaintablePolygon guards on point count AND area', () => {
    const tri: Point[] = [
      [0, 0],
      [30, 0],
      [0, 30],
    ]
    expect(isPaintablePolygon(tri)).toBe(true) // area 450 > MIN
    const sliver: Point[] = [
      [0, 0],
      [5, 0],
      [0, 5],
    ]
    expect(polygonArea(sliver)).toBeLessThan(MIN_PAINT_AREA)
    expect(isPaintablePolygon(sliver)).toBe(false)
    expect(
      isPaintablePolygon([
        [0, 0],
        [10, 10],
      ]),
    ).toBe(false)
  })
})

describe('paintImageDataInPolygon', () => {
  function grid(w: number, h: number, fill: RGB) {
    const data = new Uint8ClampedArray(w * h * 4)
    for (let i = 0; i < w * h; i++) {
      data[i * 4] = fill[0]
      data[i * 4 + 1] = fill[1]
      data[i * 4 + 2] = fill[2]
      data[i * 4 + 3] = 255
    }
    return { data, width: w, height: h }
  }
  const px = (img: { data: Uint8ClampedArray; width: number }, x: number, y: number): RGB => {
    const idx = (y * img.width + x) * 4
    return [img.data[idx]!, img.data[idx + 1]!, img.data[idx + 2]!]
  }

  it('only repaints pixels inside the polygon', () => {
    const img = grid(16, 16, [200, 200, 200])
    // Area 121 px² > MIN_PAINT_AREA so the mask is paintable.
    const poly: Point[] = [
      [1, 1],
      [12, 1],
      [12, 12],
      [1, 12],
    ]
    const n = paintImageDataInPolygon(img, poly, [40, 90, 200])
    expect(n).toBeGreaterThan(0)
    // inside → recoloured blue-ish
    const inside = px(img, 5, 5)
    expect(inside[2]).toBeGreaterThan(inside[0])
    // outside → untouched grey
    expect(px(img, 15, 15)).toEqual([200, 200, 200])
  })

  it('does nothing for a non-paintable polygon', () => {
    const img = grid(10, 10, [200, 200, 200])
    const n = paintImageDataInPolygon(
      img,
      [
        [0, 0],
        [1, 0],
      ],
      [40, 90, 200],
    )
    expect(n).toBe(0)
    expect(px(img, 0, 0)).toEqual([200, 200, 200])
  })

  it('preserves relative shading across a gradient wall', () => {
    // Left half dark, right half light — after painting both must keep their
    // relative brightness order (proof it is not a flat opaque fill).
    const img = grid(30, 8, [60, 60, 60])
    for (let y = 0; y < 8; y++) {
      for (let x = 15; x < 30; x++) {
        const idx = (y * 30 + x) * 4
        img.data[idx] = 220
        img.data[idx + 1] = 220
        img.data[idx + 2] = 220
      }
    }
    const n = paintImageDataInPolygon(
      img,
      [
        [0, 0],
        [30, 0],
        [30, 8],
        [0, 8],
      ],
      [200, 40, 40],
    )
    expect(n).toBeGreaterThan(0)
    const darkP = px(img, 3, 3)
    const lightP = px(img, 25, 3)
    expect(luminance(lightP)).toBeGreaterThan(luminance(darkP) + 50)
  })
})
