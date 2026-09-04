/**
 * The app's UI chrome, as fractions of the frame — one definition, shared.
 *
 * **Why one definition.** `light-distribution.mjs` has excluded these rectangles
 * from its own statistics since `v0.31.5.182`, which removed them believing an
 * element screenshot excludes overlaying DOM. It does not: Puppeteer clips the
 * COMPOSITED page to the element's box, so the toolbar and minimap are still in a
 * "canvas" capture (verified by sampling 235,232,227 in both a page shot and an
 * element shot). `v0.31.5.229` then added the walk-mode pill and hint bar, which
 * sit in the lower middle and so land squarely inside the FLOOR band.
 *
 * But the raster that probe *saves* is unmasked, and every downstream consumer —
 * `spatial-profile`, `chroma-locate`, `frame-compare` — reads that file while the
 * Cycles half of the pair has no chrome at all. When I added masking to
 * `spatial-profile` I copied three of the five rectangles and would have shipped a
 * partially-masked measurement that looked clean. Hence this module: the list is
 * long enough to copy wrong, and the copy is silent when it is wrong.
 *
 * Fractions, not pixels, so the same rectangles hold at the app's 2560x1440 and a
 * reference's 800x450.
 */

/** @type {ReadonlyArray<{name: string, x0: number, x1: number, y0: number, y1: number}>} */
export const HUD_RECTS = [
  { name: 'toolbar', x0: 0.24, x1: 0.76, y0: 0, y1: 0.1 },
  { name: 'measure', x0: 0.9, x1: 1, y0: 0, y1: 0.06 },
  { name: 'minimap', x0: 0.76, x1: 1, y0: 0.76, y1: 1 },
  // v0.31.5.229 — the walk-mode pill ("Turn off ceiling light") and the hint bar.
  { name: 'pill', x0: 0.4, x1: 0.61, y0: 0.81, y1: 0.89 },
  { name: 'hints', x0: 0.28, x1: 0.72, y0: 0.9, y1: 0.98 },
]

/** True when the fractional point lies under any chrome. */
export function isHud(xf, yf) {
  return HUD_RECTS.some((r) => xf >= r.x0 && xf < r.x1 && yf >= r.y0 && yf < r.y1)
}

/**
 * `Uint8Array` of `w * h`, 1 = usable pixel, 0 = chrome.
 *
 * Masked pixels are meant to be EXCLUDED, never filled: substituting any value
 * (black, grey, the frame's median) biases the bin means the mask exists to
 * protect.
 */
export function hudMask(w, h) {
  const use = new Uint8Array(w * h).fill(1)
  for (const r of HUD_RECTS) {
    const x0 = Math.max(0, Math.floor(r.x0 * w))
    const x1 = Math.min(w, Math.ceil(r.x1 * w))
    const y0 = Math.max(0, Math.floor(r.y0 * h))
    const y1 = Math.min(h, Math.ceil(r.y1 * h))
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) use[y * w + x] = 0
  }
  return use
}

/** Fraction of a `w x h` frame the chrome covers — the honest cost of masking. */
export function hudCoverage(w, h) {
  const use = hudMask(w, h)
  let masked = 0
  for (let i = 0; i < use.length; i++) if (!use[i]) masked += 1
  return masked / use.length
}
