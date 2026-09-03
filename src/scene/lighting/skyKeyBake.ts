/**
 * Composite the baked Cycles sky keys into an equirect canvas.
 *
 * The runtime half of `(z)`4 / item `(l)`. `skyKeys.ts` decides *which* keys and *how much*; this
 * draws them. Deliberately the same shape as `bakeSkyEquirect` — canvas in, `CanvasTexture` out — so
 * `SkyBackdrop`'s existing debounce, dispose and restore logic is reused rather than duplicated.
 *
 * **The blend happens in sRGB byte space, and that is the measured configuration.** Canvas
 * `globalAlpha` compositing computes `dst = src·a + dst·(1−a)`, i.e. exactly the lerp — and the
 * error figures in `v0.31.7.148`–`.150` (≤1.4 % at 30° spacing, ≤0.67 % in the brightest decile)
 * were measured on display counts, not on linear light. So this is the arrangement those numbers
 * describe; blending in linear light would be more physical and is NOT what was validated.
 */
import { SKY_KEY_ALTITUDES, skyKeyBlend, skyKeyUrl } from './skyKeys'

type Vec3 = readonly [number, number, number]

let images: Map<number, HTMLImageElement> | null = null
let loading: Promise<void> | null = null

/**
 * Load the key set once. Idempotent; concurrent callers share one promise.
 *
 * Resolves even if a key fails, so a missing asset degrades to the analytic sky rather than leaving
 * the caller waiting forever — `bakeSkyFromKeys` then returns `null` and the existing path runs.
 */
export function preloadSkyKeys(base?: string): Promise<void> {
  if (images) return Promise.resolve()
  if (loading) return loading
  loading = Promise.all(
    SKY_KEY_ALTITUDES.map(
      (alt) =>
        new Promise<[number, HTMLImageElement | null]>((res) => {
          const img = new Image()
          img.onload = () => res([alt, img])
          img.onerror = () => res([alt, null])
          img.src = skyKeyUrl(alt, base)
        }),
    ),
  ).then((pairs) => {
    const map = new Map<number, HTMLImageElement>()
    for (const [alt, img] of pairs) if (img) map.set(alt, img)
    // All-or-nothing: a partial set would blend a key against a hole.
    images = map.size === SKY_KEY_ALTITUDES.length ? map : new Map()
  })
  return loading
}

/** True once `preloadSkyKeys` has a complete set. */
export function skyKeysReady(): boolean {
  return !!images && images.size === SKY_KEY_ALTITUDES.length
}

/**
 * Blend the two bracketing keys into a fresh canvas, rotated to the sun's azimuth.
 *
 * Returns `null` when the set is not loaded, which is the caller's signal to use the analytic sky.
 */
export function bakeSkyFromKeys(sunTravel: Vec3): HTMLCanvasElement | null {
  if (!images || images.size !== SKY_KEY_ALTITUDES.length) return null
  const { loAlt, hiAlt, t, uOffset } = skyKeyBlend(sunTravel)
  const lo = images.get(loAlt)
  const hi = images.get(hiAlt)
  if (!lo || !hi) return null

  const w = lo.naturalWidth || lo.width
  const h = lo.naturalHeight || lo.height
  if (w < 2 || h < 2) return null
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  // TWO DRAWS PER KEY so the azimuth rotation wraps. The offset shifts the image right; the second
  // draw one width to the left fills what the first vacated. A single draw would leave a vertical
  // seam of blank canvas at whatever azimuth the sun happens to be at, which is the kind of defect
  // that only appears at some times of day.
  const off = Math.round(uOffset * w)
  const drawWrapped = (img: HTMLImageElement, alpha: number) => {
    ctx.globalAlpha = alpha
    ctx.drawImage(img, off, 0, w, h)
    ctx.drawImage(img, off - w, 0, w, h)
  }
  drawWrapped(lo, 1)
  if (t > 0 && hi !== lo) drawWrapped(hi, Math.min(1, t))
  ctx.globalAlpha = 1
  return canvas
}

/** Test seam: forget the loaded set. */
export function resetSkyKeysForTest(): void {
  images = null
  loading = null
}
