/**
 * Luminance-preserving, mean-anchored recolor engine (FINISH-RECOLOR).
 *
 * The legacy `tint:` path multiplies a textured base's albedo via
 * `material.color`, which can only ever DARKEN a photo texture. Repaint mode
 * instead re-bakes the albedo so its *average* colour becomes the chosen colour
 * while the pattern's relative contrast survives — a dark walnut can become a
 * light-grey wood, not just a muddier walnut.
 *
 * The maths operates directly on the sRGB-encoded bytes (no linearisation): the
 * W3C compositing spec's colour blends work in the same encoded domain, and it
 * preserves the perceptual light/dark pattern the eye reads. Pure core
 * (`recolorPixels`, node-testable, no allocation beyond scalars) + thin DOM
 * wrappers for the render (`recolorImageToCanvas`) and picker previews
 * (`recolorThumbnailDataUrl`).
 */

import { normalizeHex } from './colorHarmony'
import { hexToRgb } from './procedural/noise'

/** Below this mean luma the image carries no luminance to anchor to (an
 *  all-black source), so we flat-fill the target colour instead of dividing. */
const MEAN_EPSILON = 1e-4

/** Round + clamp a float to a 0..255 byte (explicit so behaviour matches the
 *  spec regardless of the destination array type). */
function clampByte(v: number): number {
  const r = Math.round(v)
  return r < 0 ? 0 : r > 255 ? 255 : r
}

/**
 * In-place luminance-preserving recolor of an RGBA byte buffer. Two passes:
 *  1. mean of per-pixel Rec.709 luma `L = 0.2126R + 0.7152G + 0.0722B`;
 *  2. `out_c = clamp(round(target_c * L / Lmean))` per channel.
 * Alpha is untouched. Deterministic; allocates only scalars.
 */
export function recolorPixels(
  data: Uint8ClampedArray,
  target: { r: number; g: number; b: number },
): void {
  const n = data.length
  if (n === 0) return
  const tr = target.r
  const tg = target.g
  const tb = target.b

  // Pass 1 — mean luma over the sRGB bytes.
  let sum = 0
  let count = 0
  for (let i = 0; i < n; i += 4) {
    sum += 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]
    count++
  }
  const mean = sum / count

  // All-black / vanishing-mean guard: nothing to anchor → flat target fill.
  if (mean < MEAN_EPSILON) {
    for (let i = 0; i < n; i += 4) {
      data[i] = tr
      data[i + 1] = tg
      data[i + 2] = tb
    }
    return
  }

  // Pass 2 — anchor each pixel's luma onto the target colour.
  const k = 1 / mean
  for (let i = 0; i < n; i += 4) {
    const f = (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) * k
    data[i] = clampByte(tr * f)
    data[i + 1] = clampByte(tg * f)
    data[i + 2] = clampByte(tb * f)
  }
}

/** Longest side and shortest side dimensions of a drawable image source, or 0
 *  when it has none. Prefers the intrinsic `naturalWidth`/`naturalHeight` of an
 *  <img> (0 until decoded) over its layout `width`/`height`. */
function sourceDimensions(image: unknown): { w: number; h: number } {
  const s = image as {
    naturalWidth?: number
    naturalHeight?: number
    width?: number
    height?: number
  }
  return {
    w: s.naturalWidth || s.width || 0,
    h: s.naturalHeight || s.height || 0,
  }
}

/**
 * Draw `image` (downscaled so its max dimension is ≤ `maxSize`, aspect kept),
 * recolor its albedo toward `hex`, and return the canvas. Returns `null` (never
 * throws) when the 2D context is unavailable, the hex is invalid, or the image
 * has no dimensions — callers fall back to the legacy multiply path / a flat
 * colour block. The 1024 cap bounds VRAM; the normal map keeps full detail.
 */
export function recolorImageToCanvas(
  image: CanvasImageSource,
  hex: string,
  maxSize = 1024,
): HTMLCanvasElement | null {
  const norm = normalizeHex(hex)
  if (!norm) return null
  const [r, g, b] = hexToRgb(norm)

  const { w: srcW, h: srcH } = sourceDimensions(image)
  if (srcW <= 0 || srcH <= 0) return null
  const scale = Math.min(1, maxSize / Math.max(srcW, srcH))
  const w = Math.max(1, Math.round(srcW * scale))
  const h = Math.max(1, Math.round(srcH * scale))

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  try {
    ctx.drawImage(image, 0, 0, w, h)
    const img = ctx.getImageData(0, 0, w, h)
    recolorPixels(img.data, { r, g, b })
    ctx.putImageData(img, 0, 0)
  } catch {
    // Tainted canvas (cross-origin without CORS), OOM, etc. → give up cleanly.
    return null
  }
  return canvas
}

// Module-level preview memo so picker/composer re-renders don't re-fetch+re-bake
// the same recolored thumbnail. Small FIFO cap (a picker shows a bounded grid).
const THUMB_MEMO_MAX = 64
const thumbMemo = new Map<string, string | null>()

/**
 * Load `url`, recolor it at thumbnail size toward `hex`, and return a data URL —
 * a preview helper for the finish picker / material composer. ANY error (load
 * failure, tainted canvas, missing context) resolves `null` so the caller can
 * fall back to a flat colour block. Results (including `null`) are memoised.
 */
export async function recolorThumbnailDataUrl(
  url: string,
  hex: string,
  size = 96,
): Promise<string | null> {
  const key = `${url}|${hex}|${size}`
  const cached = thumbMemo.get(key)
  if (cached !== undefined) return cached

  const result = await loadAndRecolor(url, hex, size)
  if (thumbMemo.size >= THUMB_MEMO_MAX) {
    const oldest = thumbMemo.keys().next().value
    if (oldest !== undefined) thumbMemo.delete(oldest)
  }
  thumbMemo.set(key, result)
  return result
}

async function loadAndRecolor(url: string, hex: string, size: number): Promise<string | null> {
  try {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.src = url
    await img.decode()
    const canvas = recolorImageToCanvas(img, hex, size)
    if (!canvas) return null
    return canvas.toDataURL()
  } catch {
    return null
  }
}
