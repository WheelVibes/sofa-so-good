/**
 * One-tap "hero card" share image (feature `shareCard`).
 *
 * Composes an offscreen `<canvas>` = the current 3D snapshot framed with the
 * design's palette swatches + name + a small stat line + a "Sofa So Good"
 * wordmark, then downloads it as a PNG sized for messaging/social (4:5 portrait).
 * Mirrors `openMoodboard.ts`'s structure (grab state → capture hero → compose →
 * deliver) but rasterises to a canvas instead of an HTML document.
 *
 * The card is a FIXED DARK design regardless of the app theme: it's an exported
 * image, not a theme-reactive DOM surface, so it can't (and shouldn't) react to
 * light/dark. A dark frame reads well under any messaging app, makes the hero
 * render and the palette swatches pop, and matches a premium "look what I made"
 * aesthetic. The only theme-derived colour is the app's live accent (read from
 * the `--accent` CSS token) so the wordmark stays on-brand across the 5 themes.
 */

import { captureCanvasPng } from '../scene/captureCanvas'
import { useStore } from '../state/store'
import { designPalette } from './reportData'
import {
  buildShareCardStats,
  paletteStripLayout,
  pickShareCardSwatches,
  shareCardFilename,
} from './shareCard'

// --- fixed card design ------------------------------------------------------

const CARD_W = 1080
const CARD_H = 1350
const PAD = 56
const HERO_H = 900
const RADIUS = 28

// On-brand fixed dark palette (theme-independent export surface).
const BG = '#14161b'
const HERO_BG = '#1c1f26'
const HAIRLINE = 'rgba(255,255,255,0.10)'
const TEXT = '#f5f6f8'
const TEXT_MUTED = '#9aa4b2'
const ACCENT_FALLBACK = 'oklch(0.6 0.125 42)'
const SWATCH_GAP = 16
const SWATCH_MIN = 48
const SWATCH_MAX = 120

/** Read the app's live accent token, falling back to the default terracotta. */
function readAccent(): string {
  try {
    const v = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()
    return v || ACCENT_FALLBACK
  } catch {
    return ACCENT_FALLBACK
  }
}

/** Draw `text` at (x, baseline), ellipsised to fit `maxW`. */
function fillTextEllipsis(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxW: number,
): void {
  if (ctx.measureText(text).width <= maxW) {
    ctx.fillText(text, x, y)
    return
  }
  const ell = '…'
  let lo = 0
  let hi = text.length
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2)
    if (ctx.measureText(text.slice(0, mid) + ell).width <= maxW) lo = mid
    else hi = mid - 1
  }
  ctx.fillText(text.slice(0, lo) + ell, x, y)
}

export interface ShareCardRenderInput {
  name: string
  statLine: string
  swatches: string[]
  accent: string
  /** A loaded hero image, or null for the neutral placeholder. */
  hero: HTMLImageElement | null
}

/**
 * Render the hero card to a fresh `<canvas>`. Browser-only (creates a canvas +
 * 2D context). The layout math it relies on is the pure `paletteStripLayout`.
 */
export function renderShareCardCanvas(input: ShareCardRenderInput): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = CARD_W
  canvas.height = CARD_H
  const ctx = canvas.getContext('2d')
  if (!ctx) return canvas

  // Background.
  ctx.fillStyle = BG
  ctx.fillRect(0, 0, CARD_W, CARD_H)

  // Hero panel (rounded, clipped cover-fit render or placeholder).
  const hx = PAD
  const hy = PAD
  const hw = CARD_W - PAD * 2
  ctx.save()
  ctx.beginPath()
  ctx.roundRect(hx, hy, hw, HERO_H, RADIUS)
  ctx.closePath()
  ctx.fillStyle = HERO_BG
  ctx.fill()
  ctx.clip()
  if (input.hero && input.hero.width > 0 && input.hero.height > 0) {
    const scale = Math.max(hw / input.hero.width, HERO_H / input.hero.height)
    const dw = input.hero.width * scale
    const dh = input.hero.height * scale
    ctx.drawImage(input.hero, hx + (hw - dw) / 2, hy + (HERO_H - dh) / 2, dw, dh)
  } else {
    // Placeholder: a subtle accent wash so a card without a capture still reads.
    ctx.fillStyle = input.accent
    ctx.globalAlpha = 0.12
    ctx.fillRect(hx, hy, hw, HERO_H)
    ctx.globalAlpha = 1
  }
  ctx.restore()
  // Hairline around the hero.
  ctx.strokeStyle = HAIRLINE
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.roundRect(hx, hy, hw, HERO_H, RADIUS)
  ctx.stroke()

  const textX = PAD
  const maxTextW = CARD_W - PAD * 2

  // Design name.
  const nameY = hy + HERO_H + 84
  ctx.fillStyle = TEXT
  ctx.textBaseline = 'alphabetic'
  ctx.font = '800 60px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'
  fillTextEllipsis(ctx, input.name || 'My design', textX, nameY, maxTextW)

  // Stat line.
  const statsY = nameY + 46
  ctx.fillStyle = TEXT_MUTED
  ctx.font = '600 30px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'
  fillTextEllipsis(ctx, input.statLine, textX, statsY, maxTextW)

  // Palette swatch strip.
  const stripTop = statsY + 40
  if (input.swatches.length > 0) {
    const layout = paletteStripLayout({
      count: input.swatches.length,
      width: maxTextW,
      gap: SWATCH_GAP,
      min: SWATCH_MIN,
      max: SWATCH_MAX,
    })
    for (let i = 0; i < input.swatches.length; i++) {
      const r = layout.rects[i]
      ctx.save()
      ctx.beginPath()
      ctx.roundRect(textX + r.x, stripTop, r.width, layout.size, 14)
      ctx.closePath()
      ctx.fillStyle = input.swatches[i]
      ctx.fill()
      ctx.strokeStyle = HAIRLINE
      ctx.lineWidth = 2
      ctx.stroke()
      ctx.restore()
    }
  }

  // Wordmark, bottom-left.
  const wordY = CARD_H - PAD
  ctx.fillStyle = input.accent
  ctx.font = '800 30px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'
  ctx.fillText('Sofa So Good', textX, wordY)

  return canvas
}

/** Resolve the render input from the live store (hero not yet loaded). */
function collectShareCardInput(): Omit<ShareCardRenderInput, 'hero'> & {
  heroDataUrl: string | null
} {
  const s = useStore.getState()
  let heroDataUrl = captureCanvasPng()
  if (!heroDataUrl) {
    const canvas = document.querySelector('canvas')
    try {
      heroDataUrl = canvas ? canvas.toDataURL('image/png') : null
    } catch {
      heroDataUrl = null
    }
  }
  const designSwatches = designPalette(s.finishes).map((p) => p.swatch)
  return {
    name: s.floorPlan.name || 'My design',
    statLine: buildShareCardStats(s.floorPlan, s.items, s.units).line,
    swatches: pickShareCardSwatches(s.masterPalette, designSwatches),
    accent: readAccent(),
    heroDataUrl,
  }
}

/** Load a data URL into an Image, resolving null if it can't decode. */
function loadImage(dataUrl: string | null): Promise<HTMLImageElement | null> {
  if (!dataUrl) return Promise.resolve(null)
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = dataUrl
  })
}

/** Build the hero card and return its PNG data URL (dev hook / headless verify). */
export async function buildShareCardDataUrl(): Promise<string | null> {
  const { heroDataUrl, ...rest } = collectShareCardInput()
  const hero = await loadImage(heroDataUrl)
  const canvas = renderShareCardCanvas({ ...rest, hero })
  try {
    return canvas.toDataURL('image/png')
  } catch {
    return null
  }
}

/**
 * Compose + download the one-tap hero card as a PNG. Entry point for the
 * ShareModal "Save hero image" button.
 */
export async function openShareCard(): Promise<void> {
  const s = useStore.getState()
  try {
    const url = await buildShareCardDataUrl()
    if (!url) {
      s.notify.start({
        title: "Couldn't create the hero image",
        kind: 'error',
        message: 'The scene view was unavailable — try again from the 3D view.',
      })
      return
    }
    const a = document.createElement('a')
    a.href = url
    a.download = shareCardFilename(s.floorPlan.name || 'design')
    document.body.appendChild(a)
    a.click()
    a.remove()
    s.notify.start({ title: 'Hero image saved to your downloads', kind: 'success' })
  } catch {
    s.notify.start({ title: "Couldn't create the hero image", kind: 'error' })
  }
}
