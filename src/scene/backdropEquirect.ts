/**
 * Procedurally-baked **equirectangular photo backdrops**. Each preset paints a
 * single 2:1 canvas (sky gradient + ground + a horizon band) that the scene sets
 * as `scene.background` in walk mode — one texture, ZERO per-frame draw calls,
 * seen correctly through every window. Asset-free by design (no fetch), shaped to
 * be swapped for real CC0 equirectangular photos later (same background slot).
 */
import {
  buildHillBands,
  buildingWindows,
  buildSkylineBuildings,
  buildTreeline,
  EQUIRECT_H,
  EQUIRECT_W,
  HORIZON_Y,
  hillRidgeY,
} from './backdropHorizon'
import { paintSkyEquirect, type Vec3 } from './lighting/skyGradient'

export { EQUIRECT_H, EQUIRECT_W } from './backdropHorizon'

/** Photo-backdrop presets (the `none` backdrop bakes nothing — plain sky). */
export type PhotoBackdropKind = 'city' | 'dusk' | 'park' | 'hills'

export interface Preset {
  /** Sky vertical gradient zenith → mid → horizon. */
  sky: [string, string, string]
  /** Ground (lower hemisphere) gradient horizon → nadir. */
  ground: [string, string]
  /** Horizon content. */
  horizon: 'buildings' | 'trees' | 'hills'
  /** Near-building base colour `[r,g,b]` (buildings only). */
  building?: [number, number, number]
  /** Lit-window warmth + density multiplier (buildings only). */
  windowColor?: string
  litScale?: number
  /** Foliage near colour (trees/hills). */
  foliage?: [number, number, number]
  /** Horizon-haze blend colour. */
  haze: string
}

export const BACKDROP_PRESETS: Record<PhotoBackdropKind, Preset> = {
  city: {
    sky: ['#6fb0e8', '#a6d0ef', '#dfeaf2'],
    ground: ['#d2d4ce', '#a8aaa2'],
    horizon: 'buildings',
    building: [182, 177, 166],
    windowColor: 'rgba(52,66,84,0.5)',
    litScale: 4.2,
    haze: '#dfeaf2',
  },
  dusk: {
    sky: ['#3a3a6b', '#8a5a8f', '#f3a25c'],
    ground: ['#5a4a4a', '#332b2e'],
    horizon: 'buildings',
    building: [42, 40, 56],
    windowColor: 'rgba(255,206,128,0.85)',
    litScale: 3.2,
    haze: '#f3a25c',
  },
  park: {
    sky: ['#5d8fc4', '#9fc0db', '#e3ece6'],
    ground: ['#a9b48c', '#83925f'],
    horizon: 'trees',
    foliage: [58, 92, 54],
    haze: '#e3ece6',
  },
  hills: {
    sky: ['#5d8fc4', '#a8c6dd', '#e6efe7'],
    ground: ['#aeb89a', '#8a9670'],
    horizon: 'hills',
    foliage: [86, 120, 78],
    haze: '#e6efe7',
  },
}

/**
 * Shift a photo preset toward the hour it is being viewed at.
 *
 * WINDOW-SKY-DEFAULT (v0.31.5.92) kept `sky` as the default backdrop because the
 * photo presets are authored at ONE time of day and do not track the clock. That
 * is measurable: at 18:00 the `city` preset renders **cooler** than the interior
 * in front of it (window-region R/B 0.973) while the analytic sky is warm with it
 * (1.034) — the classic clashing-colour-temperature failure. This is the fix for
 * the preset side of that.
 *
 * `skyColor` is the analytic sky colour for the hour (`altitudeCurve.ts`), 0..1
 * rgb, which already models blue midday → warm horizon → deep blue night. Every
 * authored colour is pulled toward that hue and dimmed as the day ends, and the
 * lit-window density rises as it does.
 *
 * At `daylight === 1` the preset is returned **unchanged**, so nothing about the
 * shipped midday look moves. Pure, so the whole curve is unit-testable.
 */
export interface BackdropHour {
  /** 0 night … 1 full day. Drives DIMMING and lit-window density only. */
  daylight: number
  /** 0 sun high … 1 sun on the horizon. Drives the WARM SHIFT. A separate signal
   *  on purpose: `daylightFromAltitude` is a night ramp that saturates at 1 for
   *  every altitude above 0°, so at 18:00 — the hour the defect was measured at,
   *  sun still 16° up — it reports "full day" and would leave the preset
   *  untouched. Warmth has to follow how LOW the sun is, not whether it has set. */
  lowSun: number
  /** The hour's light colour (`lightingFromAltitude(...).sunColor`), 0..1 rgb. */
  tint: readonly [number, number, number]
}

export function presetForDaylight(preset: Preset, hour: BackdropHour): Preset {
  const num = (v: number, fallback: number) => (Number.isFinite(v) ? v : fallback)
  const d = Math.max(0, Math.min(1, num(hour.daylight, 1)))
  const low = Math.max(0, Math.min(1, num(hour.lowSun, 0)))
  if (d >= 1 && low <= 0) return preset
  const night = 1 - d
  const hue = 0.8 * low
  const dim = 1 - 0.72 * night
  const sky = normaliseToPeak(hour.tint)
  const shift = (hex: string): string => {
    const c = parseHex(hex)
    if (!c) return hex
    const out: [number, number, number] = [0, 0, 0]
    for (let i = 0; i < 3; i++) {
      const tinted = c[i] * sky[i]
      out[i] = Math.round(Math.max(0, Math.min(255, (c[i] + (tinted - c[i]) * hue) * dim)))
    }
    return `#${out.map((v) => v.toString(16).padStart(2, '0')).join('')}`
  }
  return {
    ...preset,
    sky: [shift(preset.sky[0]), shift(preset.sky[1]), shift(preset.sky[2])],
    ground: [shift(preset.ground[0]), shift(preset.ground[1])],
    haze: shift(preset.haze),
    // Lit windows belong to the night, not to noon: at full day the authored
    // density stands, and it grows as the light goes.
    litScale: preset.litScale === undefined ? undefined : preset.litScale * (1 + 1.6 * night),
  }
}

/** Scale an 0..1 rgb triple so its largest channel is 1 — keeps a tint's HUE
 *  without also applying its brightness (which `dim` handles separately). */
function normaliseToPeak(c: readonly [number, number, number]): [number, number, number] {
  const peak = Math.max(c[0], c[1], c[2])
  if (!Number.isFinite(peak) || peak <= 0) return [1, 1, 1]
  return [c[0] / peak, c[1] / peak, c[2] / peak]
}

/** `#rrggbb` → 0..255 triple; null on anything else (the presets are all hex,
 *  but `windowColor` is `rgba(...)` and must not be mangled). */
function parseHex(hex: string): [number, number, number] | null {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return null
  const n = Number.parseInt(m[1], 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function rgb(c: [number, number, number], lighten = 0): string {
  const f = (v: number) => Math.round(Math.min(255, v + (255 - v) * lighten))
  return `rgb(${f(c[0])},${f(c[1])},${f(c[2])})`
}

/**
 * Paint a preset's equirectangular backdrop into a fresh canvas. Guards a missing
 * 2D context (e.g. happy-dom in tests) by returning the un-painted canvas.
 */
export function bakeBackdropEquirect(
  kind: PhotoBackdropKind,
  hour: BackdropHour = { daylight: 1, lowSun: 0, tint: [1, 1, 1] },
): HTMLCanvasElement {
  const preset = presetForDaylight(BACKDROP_PRESETS[kind], hour)
  const canvas = document.createElement('canvas')
  canvas.width = EQUIRECT_W
  canvas.height = EQUIRECT_H
  const ctx = canvas.getContext('2d')
  if (!ctx) return canvas

  // Sky (upper half).
  const sky = ctx.createLinearGradient(0, 0, 0, HORIZON_Y)
  sky.addColorStop(0, preset.sky[0])
  sky.addColorStop(0.55, preset.sky[1])
  sky.addColorStop(1, preset.sky[2])
  ctx.fillStyle = sky
  ctx.fillRect(0, 0, EQUIRECT_W, HORIZON_Y)

  // Ground (lower half) — hazy neutral so it never distracts.
  const ground = ctx.createLinearGradient(0, HORIZON_Y, 0, EQUIRECT_H)
  ground.addColorStop(0, preset.ground[0])
  ground.addColorStop(1, preset.ground[1])
  ctx.fillStyle = ground
  ctx.fillRect(0, HORIZON_Y, EQUIRECT_W, EQUIRECT_H - HORIZON_Y)

  if (preset.horizon === 'buildings') paintBuildings(ctx, preset)
  else if (preset.horizon === 'trees') paintTrees(ctx, preset)
  else paintHills(ctx, preset)

  // Soft horizon haze to blend the band into the ground.
  const haze = ctx.createLinearGradient(0, HORIZON_Y - 28, 0, HORIZON_Y + 10)
  haze.addColorStop(0, hexAlpha(preset.haze, 0))
  haze.addColorStop(1, hexAlpha(preset.haze, 0.85))
  ctx.fillStyle = haze
  ctx.fillRect(0, HORIZON_Y - 28, EQUIRECT_W, 38)

  return canvas
}

function paintBuildings(ctx: CanvasRenderingContext2D, preset: Preset) {
  const base = preset.building ?? [74, 86, 104]
  for (const b of buildSkylineBuildings()) {
    // Atmospheric perspective: far blocks fade toward the haze colour.
    ctx.fillStyle = rgb(base, b.depth * 0.7)
    ctx.fillRect(b.x, b.top, b.w, HORIZON_Y - b.top)
    ctx.fillStyle = preset.windowColor ?? 'rgba(255,221,160,0.55)'
    for (const win of buildingWindows(b, preset.litScale ?? 1)) {
      ctx.fillRect(win.x, win.y, win.w, win.h)
    }
  }
}

function paintTrees(ctx: CanvasRenderingContext2D, preset: Preset) {
  const base = preset.foliage ?? [58, 92, 54]
  for (const t of buildTreeline()) {
    ctx.fillStyle = rgb(base, t.depth * 0.55)
    // A rounded canopy sitting on the horizon — a half-disc plus a little trunk.
    ctx.beginPath()
    ctx.arc(t.cx, HORIZON_Y, t.r, Math.PI, Math.PI * 2)
    ctx.fill()
    ctx.fillRect(t.cx - t.r * 0.12, HORIZON_Y - t.r * 0.2, t.r * 0.24, t.r * 0.5)
  }
}

function paintHills(ctx: CanvasRenderingContext2D, preset: Preset) {
  const base = preset.foliage ?? [86, 120, 78]
  const step = 8
  for (const band of buildHillBands()) {
    ctx.fillStyle = rgb(base, band.depth * 0.6)
    ctx.beginPath()
    ctx.moveTo(0, HORIZON_Y)
    for (let x = 0; x <= EQUIRECT_W; x += step) ctx.lineTo(x, hillRidgeY(band, x))
    ctx.lineTo(EQUIRECT_W, HORIZON_Y)
    ctx.closePath()
    ctx.fill()
  }
}

/** Add an alpha to a `#rrggbb` colour (presets use hex for the haze). */
function hexAlpha(hex: string, a: number): string {
  const n = Number.parseInt(hex.slice(1), 16)
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`
}

// ---------------------------------------------------------------------------
// Sun-driven procedural sky (RD-412, steps 1–5)
// ---------------------------------------------------------------------------

/** A lower-resolution equirect for the sun-driven sky — it has no fine horizon
 *  detail (pure gradient), and is re-baked as the sun moves, so a smaller buffer
 *  keeps the per-rebake cost low. Still 2:1 so the mapping is identical. */
export const SKY_EQUIRECT_W = 1024
export const SKY_EQUIRECT_H = 512

/**
 * Paint the analytic sun-driven sky (`skyGradient.ts`) into a fresh canvas as a
 * 2:1 equirect. Like `bakeBackdropEquirect`, guards a missing 2D context (e.g.
 * happy-dom in tests) by returning the un-painted canvas. The pure painter fills
 * an `ImageData` buffer which is blitted in one `putImageData`.
 */
export function bakeSkyEquirect(sunDir: Vec3, turbidity: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = SKY_EQUIRECT_W
  canvas.height = SKY_EQUIRECT_H
  const ctx = canvas.getContext('2d')
  if (!ctx) return canvas

  const image = ctx.createImageData(SKY_EQUIRECT_W, SKY_EQUIRECT_H)
  paintSkyEquirect(image.data, SKY_EQUIRECT_W, SKY_EQUIRECT_H, { sunDir, turbidity })
  ctx.putImageData(image, 0, 0)
  return canvas
}
