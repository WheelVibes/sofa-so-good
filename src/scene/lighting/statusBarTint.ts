// Drives the browser/OS chrome tint (`<meta name="theme-color">`) from the live
// top-of-canvas colour so the iOS standalone (Add-to-Home-Screen) status bar —
// and the mobile-browser address bar — blend seamlessly into the scene instead
// of showing a static band that fights the time-of-day sky.
//
// Primary source is the real rendered pixel at the top-centre of the canvas
// (sampled via the preserve-drawing-buffer the Export/Record features already
// require), so the match accounts for tone-mapping, exposure and camera pitch.
// The fallback, before the first frame is readable, is the hemisphere *sky* tint
// (`lightingFromAltitude(...).skyColor`); it is authored in linear light (three
// feeds it to `Color.setRGB`), so it is converted to sRGB for CSS.

import { isFeatureEnabled } from '../../features/featureFlags'

/** Linear-light channel (0..1) → sRGB (0..1), per the standard transfer curve. */
function linearToSrgb(c: number): number {
  const x = c < 0 ? 0 : c > 1 ? 1 : c
  return x <= 0.0031308 ? x * 12.92 : 1.055 * x ** (1 / 2.4) - 0.055
}

function byteHex(b: number): string {
  return (b < 0 ? 0 : b > 255 ? 255 : Math.round(b)).toString(16).padStart(2, '0')
}

function channelHex(srgb: number): string {
  return byteHex(srgb * 255)
}

/** Linear-RGB sky colour (0..1) → CSS sRGB hex string, e.g. `#acd4f7`. */
export function skyColorToHex(rgb: readonly [number, number, number]): string {
  return `#${channelHex(linearToSrgb(rgb[0]))}${channelHex(linearToSrgb(rgb[1]))}${channelHex(linearToSrgb(rgb[2]))}`
}

// A reused 1×1 scratch canvas to read back a single rendered pixel. Sampling the
// real frame (rather than the analytic sky colour) is what makes the seam truly
// vanish: it already accounts for tone-mapping, exposure and the camera pitch
// that decides how much sky vs. ceiling sits at the very top of the viewport.
let probeCtx: CanvasRenderingContext2D | null = null
function getProbeCtx(): CanvasRenderingContext2D | null {
  if (probeCtx) return probeCtx
  const c = document.createElement('canvas')
  c.width = 1
  c.height = 1
  probeCtx = c.getContext('2d', { willReadFrequently: true })
  return probeCtx
}

/**
 * Read the top-centre pixel of the rendered canvas (where the iOS status bar
 * sits) as a CSS sRGB hex. The WebGL canvas already outputs sRGB bytes, so the
 * value is used verbatim. Returns `null` when the frame isn't readable yet
 * (zero-sized, transparent/not-yet-drawn, or a cross-origin/context error) so
 * the caller can fall back to the analytic sky colour.
 */
function sampleCanvasTopHex(source: HTMLCanvasElement): string | null {
  const w = source.width
  const h = source.height
  if (!w || !h) return null
  const ctx = getProbeCtx()
  if (!ctx) return null
  try {
    // Sample one row down from the very edge to dodge any AA fringe.
    ctx.drawImage(source, (w / 2) | 0, h > 1 ? 1 : 0, 1, 1, 0, 0, 1, 1)
    const d = ctx.getImageData(0, 0, 1, 1).data
    // Alpha 0 ⇒ the buffer hasn't been painted yet — defer to the fallback.
    if (d[3] === 0) return null
    return `#${byteHex(d[0])}${byteHex(d[1])}${byteHex(d[2])}`
  } catch {
    return null
  }
}

// Cache the last value pushed to the DOM so the per-frame caller is a cheap
// string compare until the sky colour actually shifts.
let lastApplied = ''

/**
 * Minimum interval between the (GPU-readback) canvas samples, ms. `sampleCanvasTopHex`
 * does a `drawImage(webglCanvas,…)` + `getImageData` — a GPU→CPU pipeline sync/readback.
 * Running it on EVERY render frame (up to the tier's DPR-scaled 60 Hz) during a camera
 * orbit stalls the frame for a chrome-tint update the eye can't perceive faster than
 * ~10 Hz. Throttling the readback to this interval is a pure perf win — the resting
 * colour is identical (at most one interval "stale" on the exponential day/night tween
 * tail, imperceptible) and the 3D render is untouched. PERF-MAX-2.
 */
const SAMPLE_INTERVAL_MS = 100
let lastSampleAt = Number.NEGATIVE_INFINITY

/**
 * STATUS-TINT-READBACK (P1, docs/audit/perf-trace-2026-09-25.md). The 100 ms floor above is
 * NOT a cost bound — it is a *rate* bound, and the readback's own cost is not constant. A CDP
 * `Tracing` capture of the documented P1 repro (walk mode, `realistic`, 21:00, lights switched
 * on) attributed **4631 ms of 10.3 s of sampled main-thread CPU to this one `getImageData`** —
 * 45 %, seven times the next entry. `drawImage(webglCanvas, …)` + `getImageData` is a
 * synchronous GPU→CPU round-trip (`RasterImplementation::ReadbackImagePixels` in the trace), so
 * its cost is the depth of the GPU queue at the moment it runs, not the one pixel it returns:
 * 0.2 ms with the lights off, **76 ms** with the 19 fixture point lights on. Ten of those a
 * second is 760 ms of every wall-clock second — exactly the 60 → 33/42 Hz collapse P1 recorded,
 * and exactly why the `render` (`gl.render` submit) column stayed in budget while `raf` pacing
 * did not: the stall is beside `gl.render`, not inside it.
 *
 * Two bounds, both only active with `statusBarTintBudget` on:
 *
 * 1. **Where it can be seen at all.** `<meta name="theme-color">` tints browser/OS chrome on
 *    mobile browsers and installed (standalone) PWAs; desktop Chrome/Firefox/Safari render no
 *    such band, so the sampled pixel is invisible there and the analytic sky colour is a free
 *    substitute. Desktop therefore does ZERO readbacks.
 * 2. **A duty cycle, not a fixed rate.** Where it IS visible, the next interval is derived from
 *    how long the last readback actually took, so the sampler can never consume more than
 *    `1 / SAMPLE_DUTY_DIVISOR` of the frame budget however deep the GPU queue gets.
 */
const SAMPLE_DUTY_DIVISOR = 50 // ≤ 2 % of wall time spent in the readback
const SAMPLE_INTERVAL_MAX_MS = 2000
let lastSampleCostMs = 0

/** Reset the applied-colour cache, the sample throttle and the measured cost. Test-only seam. */
export function resetStatusBarTint(): void {
  lastApplied = ''
  lastSampleAt = Number.NEGATIVE_INFINITY
  lastSampleCostMs = 0
  tintVisible = null
}

/**
 * Does a `theme-color` tint actually paint anything on this client?
 *
 * True for a coarse-pointer (mobile/tablet) browser — Chrome/Android and Safari/iOS tint the
 * address bar — and for any installed PWA running in a chromeless display mode, where the iOS
 * status bar takes the colour. Cached after the first query: `matchMedia` is cheap but this runs
 * from a per-frame path, and neither answer changes without a reload (a window resized across the
 * pointer breakpoint does not grow a tinted address bar). `null` until first asked; the
 * test-only `resetStatusBarTint` clears it.
 */
let tintVisible: boolean | null = null
function statusBarTintIsVisible(): boolean {
  if (tintVisible !== null) return tintVisible
  const mm = typeof window === 'undefined' ? undefined : window.matchMedia
  if (typeof mm !== 'function') {
    tintVisible = true // unknown environment — keep the old behaviour rather than guess it away
    return tintVisible
  }
  const q = (s: string) => {
    try {
      return window.matchMedia(s).matches
    } catch {
      return false
    }
  }
  tintVisible =
    q('(pointer: coarse)') || q('(display-mode: standalone)') || q('(display-mode: fullscreen)')
  return tintVisible
}

/**
 * Point every `<meta name="theme-color">` tag at `hex`. The page ships two
 * media-scoped tags (light/dark Clay surfaces); we override both so whichever
 * the OS picks shows the sky colour. No-ops when the colour is unchanged.
 */
export function applyStatusBarTint(hex: string, doc: Document = document): void {
  if (hex === lastApplied) return
  lastApplied = hex
  const metas = doc.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')
  if (metas.length === 0) {
    const meta = doc.createElement('meta')
    meta.setAttribute('name', 'theme-color')
    meta.setAttribute('content', hex)
    doc.head.appendChild(meta)
    return
  }
  for (const meta of metas) meta.setAttribute('content', hex)
}

/** Convenience: convert a linear sky colour and apply it in one call. */
export function applySkyStatusBarTint(rgb: readonly [number, number, number]): void {
  applyStatusBarTint(skyColorToHex(rgb))
}

/**
 * Per-frame driver for `Lighting`: samples the real top-of-canvas pixel and
 * tints the chrome to match, falling back to the analytic sky colour when the
 * frame isn't readable yet. `fallbackLinearRgb` is the eased hemisphere sky tint
 * (linear light). `applyStatusBarTint` dedups, so re-calling with an unchanged
 * colour is a cheap string compare — no per-frame DOM churn.
 *
 * The expensive canvas readback is throttled to `SAMPLE_INTERVAL_MS` (PERF-MAX-2):
 * a call inside the throttle window is a no-op, so during a continuous orbit span
 * the pipeline stalls on the readback ~10 Hz instead of every frame. `now` is
 * injectable for deterministic tests.
 */
export function updateStatusBarTint(
  source: HTMLCanvasElement | undefined,
  fallbackLinearRgb: readonly [number, number, number],
  now: number = performance.now(),
): void {
  const budgeted = isFeatureEnabled('statusBarTintBudget')
  const interval = budgeted
    ? Math.min(
        SAMPLE_INTERVAL_MAX_MS,
        Math.max(SAMPLE_INTERVAL_MS, lastSampleCostMs * SAMPLE_DUTY_DIVISOR),
      )
    : SAMPLE_INTERVAL_MS
  if (now - lastSampleAt < interval) return
  lastSampleAt = now
  // Readback only where the tint is visible (see STATUS-TINT-READBACK). Everywhere else the
  // eased analytic sky colour drives the (unpainted) meta tag at zero GPU cost.
  const readable = source && (!budgeted || statusBarTintIsVisible())
  let sampled: string | null = null
  if (readable) {
    const t0 = performance.now()
    sampled = sampleCanvasTopHex(source)
    lastSampleCostMs = performance.now() - t0
  } else {
    lastSampleCostMs = 0
  }
  applyStatusBarTint(sampled ?? skyColorToHex(fallbackLinearRgb))
}
