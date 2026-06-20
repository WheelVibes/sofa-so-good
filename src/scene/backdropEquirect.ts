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

export { EQUIRECT_H, EQUIRECT_W, HORIZON_Y } from './backdropHorizon'

/** Photo-backdrop presets (the `none` backdrop bakes nothing — plain sky). */
export type PhotoBackdropKind = 'city' | 'dusk' | 'park' | 'hills'

interface Preset {
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
    sky: ['#5d8fc4', '#9fc0db', '#dfe8ec'],
    ground: ['#c4c6c0', '#9a9c96'],
    horizon: 'buildings',
    building: [74, 86, 104],
    windowColor: 'rgba(255,221,160,0.55)',
    litScale: 1,
    haze: '#dfe8ec',
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

function rgb(c: [number, number, number], lighten = 0): string {
  const f = (v: number) => Math.round(Math.min(255, v + (255 - v) * lighten))
  return `rgb(${f(c[0])},${f(c[1])},${f(c[2])})`
}

/**
 * Paint a preset's equirectangular backdrop into a fresh canvas. Guards a missing
 * 2D context (e.g. happy-dom in tests) by returning the un-painted canvas.
 */
export function bakeBackdropEquirect(kind: PhotoBackdropKind): HTMLCanvasElement {
  const preset = BACKDROP_PRESETS[kind]
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
