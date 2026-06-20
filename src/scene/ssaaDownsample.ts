/**
 * Pure, deterministic box-filter downsampling for supersampled (SSAA) PNG
 * export. The export renders the scene at `factor×` the target resolution, then
 * averages each `factor×factor` block of source pixels into a single output
 * pixel — cheap anti-aliasing that produces crisp reference stills without
 * per-frame MSAA cost. No DOM, no three — just RGBA byte arithmetic, so it is
 * unit-testable in isolation.
 */

export interface PixelBuffer {
  data: Uint8ClampedArray
  width: number
  height: number
}

/**
 * Average each `factor×factor` block of `src` into one output pixel.
 *
 * - Output size is `floor(width / factor) × floor(height / factor)`.
 * - `factor === 1` returns an identical-content copy (identity).
 * - All four RGBA channels (including alpha) are averaged with rounding.
 *
 * Any source rows/columns past the last whole block (when the dimensions
 * aren't an exact multiple of `factor`) are ignored, keeping output dimensions
 * exact and deterministic.
 */
export function boxDownsample(src: PixelBuffer, factor: number): PixelBuffer {
  if (!Number.isInteger(factor) || factor < 1) {
    throw new Error(`boxDownsample: factor must be a positive integer, got ${factor}`)
  }

  const outWidth = Math.floor(src.width / factor)
  const outHeight = Math.floor(src.height / factor)
  const out = new Uint8ClampedArray(outWidth * outHeight * 4)

  if (factor === 1) {
    // Identity: copy the in-bounds region (handles the non-cropping fast path).
    for (let y = 0; y < outHeight; y++) {
      const srcRow = y * src.width * 4
      const outRow = y * outWidth * 4
      for (let i = 0; i < outWidth * 4; i++) {
        out[outRow + i] = src.data[srcRow + i]
      }
    }
    return { data: out, width: outWidth, height: outHeight }
  }

  const blockArea = factor * factor
  for (let oy = 0; oy < outHeight; oy++) {
    for (let ox = 0; ox < outWidth; ox++) {
      let r = 0
      let g = 0
      let b = 0
      let a = 0
      const sx0 = ox * factor
      const sy0 = oy * factor
      for (let dy = 0; dy < factor; dy++) {
        const rowStart = (sy0 + dy) * src.width * 4
        for (let dx = 0; dx < factor; dx++) {
          const p = rowStart + (sx0 + dx) * 4
          r += src.data[p]
          g += src.data[p + 1]
          b += src.data[p + 2]
          a += src.data[p + 3]
        }
      }
      const o = (oy * outWidth + ox) * 4
      out[o] = Math.round(r / blockArea)
      out[o + 1] = Math.round(g / blockArea)
      out[o + 2] = Math.round(b / blockArea)
      out[o + 3] = Math.round(a / blockArea)
    }
  }

  return { data: out, width: outWidth, height: outHeight }
}
