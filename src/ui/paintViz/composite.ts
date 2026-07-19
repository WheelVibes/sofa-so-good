/**
 * Pure geometry + colour maths for the **Real-photo paint visualizer**
 * (`PaintVizModal`). No DOM, no React — everything here is deterministic and
 * unit-tested so the compositing that actually renders is the same code the
 * tests exercise.
 *
 * The recolour uses the W3C "color" non-separable blend mode: the result keeps
 * the PHOTO's luminance (shading, texture, highlights, shadows) but takes the
 * paint swatch's hue + saturation — exactly how a coat of matte paint reads on
 * a real wall (light walls stay light, shadowed corners stay dark), rather than
 * a flat opaque sticker. See https://www.w3.org/TR/compositing-1/#blendingcolor.
 */

export type RGB = readonly [number, number, number]
export type Point = readonly [number, number]

/** Rec.601-ish luma the W3C compositing spec uses for its non-separable modes. */
export function luminance(c: RGB): number {
  return 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2]
}

/** W3C `ClipColor`: pull any out-of-[0,255] channel back in while preserving the
 *  colour's luminance (so re-lighting a very light/dark base can't clip to a
 *  flat grey). Operates on the 0–255 domain used by canvas ImageData. */
function clipColor(c: RGB): RGB {
  const l = luminance(c)
  const n = Math.min(c[0], c[1], c[2])
  const x = Math.max(c[0], c[1], c[2])
  let [r, g, b] = c
  if (n < 0) {
    r = l + ((r - l) * l) / (l - n || 1)
    g = l + ((g - l) * l) / (l - n || 1)
    b = l + ((b - l) * l) / (l - n || 1)
  }
  if (x > 255) {
    r = l + ((r - l) * (255 - l)) / (x - l || 1)
    g = l + ((g - l) * (255 - l)) / (x - l || 1)
    b = l + ((b - l) * (255 - l)) / (x - l || 1)
  }
  return [r, g, b]
}

/** W3C `SetLum`: return `c` shifted so its luminance equals `l`, clipped to gamut. */
export function setLuminance(c: RGB, l: number): RGB {
  const d = l - luminance(c)
  return clipColor([c[0] + d, c[1] + d, c[2] + d])
}

/**
 * "Color" blend of a paint swatch over a photo pixel: keep the photo's
 * luminance, take the paint's hue + saturation. `strength` (0–1) mixes between
 * the untouched photo pixel (0) and the fully-recoloured pixel (1), so the user
 * can dial the coat from a sheer wash to solid coverage. Returns 0–255 RGB.
 */
export function blendPaintPixel(base: RGB, paint: RGB, strength = 1): RGB {
  const painted = setLuminance(paint, luminance(base))
  const s = clamp01(strength)
  return [
    base[0] + (painted[0] - base[0]) * s,
    base[1] + (painted[1] - base[1]) * s,
    base[2] + (painted[2] - base[2]) * s,
  ]
}

function clamp01(n: number): number {
  return n < 0 ? 0 : n > 1 ? 1 : n
}

/** Parse a `#rgb`/`#rrggbb` hex string to 0–255 RGB. Returns null on garbage. */
export function hexToRgb(hex: string): RGB | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return null
  let h = m[1]!
  if (h.length === 3) h = h[0]! + h[0]! + h[1]! + h[1]! + h[2]! + h[2]!
  const int = Number.parseInt(h, 16)
  return [(int >> 16) & 255, (int >> 8) & 255, int & 255]
}

/**
 * Even-odd ray-cast point-in-polygon test (polygon = array of [x,y] vertices,
 * implicitly closed). Points exactly on an edge count as inside often enough for
 * a paint mask; the exact boundary rule doesn't matter here.
 */
export function pointInPolygon(pt: Point, poly: readonly Point[]): boolean {
  if (poly.length < 3) return false
  const [px, py] = pt
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]!
    const [xj, yj] = poly[j]!
    const intersects = yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi
    if (intersects) inside = !inside
  }
  return inside
}

/** Absolute polygon area via the shoelace formula (px², coordinate units). */
export function polygonArea(poly: readonly Point[]): number {
  if (poly.length < 3) return 0
  let sum = 0
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]!
    const [xj, yj] = poly[j]!
    sum += xj * yi - xi * yj
  }
  return Math.abs(sum) / 2
}

/** Minimum polygon area (px²) worth compositing — below this the mask is a
 *  stray tap / degenerate sliver and we should not paint (avoids a flash of
 *  recolour on an accidental 2-point drag that just closed). */
export const MIN_PAINT_AREA = 100

/** A mask is paintable only with ≥3 vertices AND a non-trivial enclosed area. */
export function isPaintablePolygon(poly: readonly Point[]): boolean {
  return poly.length >= 3 && polygonArea(poly) >= MIN_PAINT_AREA
}

/**
 * In-place recolour of an `ImageData`-like buffer (`{ data, width, height }`):
 * every pixel whose centre falls inside `poly` is repainted with
 * {@link blendPaintPixel}. Pure w.r.t. inputs other than the buffer it mutates,
 * and framework-free so it runs identically in a test (a plain object + array)
 * and in the browser (a real `ImageData`). Returns the painted pixel count.
 */
export function paintImageDataInPolygon(
  img: { data: Uint8ClampedArray | number[]; width: number; height: number },
  poly: readonly Point[],
  paint: RGB,
  strength = 1,
): number {
  if (!isPaintablePolygon(poly)) return 0
  const { data, width, height } = img
  const bb = polygonBounds(poly)
  const minX = Math.max(0, Math.floor(bb.minX))
  const maxX = Math.min(width - 1, Math.ceil(bb.maxX))
  const minY = Math.max(0, Math.floor(bb.minY))
  const maxY = Math.min(height - 1, Math.ceil(bb.maxY))
  let painted = 0
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      if (!pointInPolygon([x + 0.5, y + 0.5], poly)) continue
      const idx = (y * width + x) * 4
      const out = blendPaintPixel([data[idx]!, data[idx + 1]!, data[idx + 2]!], paint, strength)
      data[idx] = Math.round(out[0])
      data[idx + 1] = Math.round(out[1])
      data[idx + 2] = Math.round(out[2])
      painted++
    }
  }
  return painted
}

/** Axis-aligned bounds of a polygon (px). */
export function polygonBounds(poly: readonly Point[]): {
  minX: number
  minY: number
  maxX: number
  maxY: number
} {
  let minX = Number.POSITIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY
  for (const [x, y] of poly) {
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (y < minY) minY = y
    if (y > maxY) maxY = y
  }
  if (!Number.isFinite(minX)) return { minX: 0, minY: 0, maxX: 0, maxY: 0 }
  return { minX, minY, maxX, maxY }
}
