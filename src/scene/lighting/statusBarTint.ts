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

/** Reset the applied-colour cache + the sample throttle. Test-only seam. */
export function resetStatusBarTint(): void {
  lastApplied = ''
  lastSampleAt = Number.NEGATIVE_INFINITY
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
  if (now - lastSampleAt < SAMPLE_INTERVAL_MS) return
  lastSampleAt = now
  const sampled = source ? sampleCanvasTopHex(source) : null
  applyStatusBarTint(sampled ?? skyColorToHex(fallbackLinearRgb))
}
