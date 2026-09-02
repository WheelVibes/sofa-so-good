/**
 * Pure helpers for the one-tap "hero card" share image (feature `shareCard`).
 *
 * The hero card is a single branded, share-ready PNG: the current 3D snapshot
 * framed with the design's palette swatches + design name + a small stat line
 * (item count · total area · room count) + a "Sofa So Good" wordmark, sized for
 * messaging/social. Distinct from the moodboard (a full styling collage) — this
 * is a polished single "look what I made" card.
 *
 * Everything here is pure + DOM-free so it can be unit-tested in node; the
 * actual canvas raster lives in `openShareCard.ts` (browser-only) and consumes
 * these builders.
 */

import { allPlanRooms, planTotalAreaAllLevels } from '../floorplan/levels'
import type { FloorPlan } from '../floorplan/types'
import type { FurnitureItem } from '../furniture/types'
import { formatArea, type UnitSystem } from '../utils/measurement'

/** The stat line broken into parts (for layout) plus the joined single line. */
export interface ShareCardStats {
  itemsText: string
  areaText: string
  roomsText: string
  /** The three parts joined by " · " — the one-line stat readout on the card. */
  line: string
}

/**
 * Build the hero-card stat line from the live design: item count, total floor
 * area (metric or imperial), and room count. Mirrors `buildShareSummary`'s
 * counting (raw `items.length`, `plan.rooms.length`, `planTotalArea`) so the
 * card matches the text summary, but omits name/cost — the card shows the name
 * separately and stays price-free (it's a shareable brag artifact, not a quote).
 */
export function buildShareCardStats(
  plan: FloorPlan,
  items: FurnitureItem[],
  units: UnitSystem = 'metric',
): ShareCardStats {
  const n = items.length
  // Whole home (F13) — `plan.rooms` is ground-only, so a maisonette's share
  // card advertised half its rooms.
  const rooms = allPlanRooms(plan).length
  const itemsText = `${n} ${n === 1 ? 'item' : 'items'}`
  const areaText = formatArea(planTotalAreaAllLevels(plan), units)
  const roomsText = `${rooms} ${rooms === 1 ? 'room' : 'rooms'}`
  return {
    itemsText,
    areaText,
    roomsText,
    line: [itemsText, areaText, roomsText].join(' · '),
  }
}

/** Max swatches shown in the card's palette strip (keeps chips legible). */
export const SHARE_CARD_MAX_SWATCHES = 6

/**
 * Choose the colour story for the card's swatch strip: prefer the user's curated
 * master palette (CUSTOMIZE-MASTER-PALETTE), else fall back to the design's
 * finish palette swatches. Returns up to {@link SHARE_CARD_MAX_SWATCHES} hex
 * strings; empty when neither source has colour.
 */
export function pickShareCardSwatches(master: string[], designSwatches: string[]): string[] {
  const source = master.length > 0 ? master : designSwatches
  return source
    .filter((c) => typeof c === 'string' && c.length > 0)
    .slice(0, SHARE_CARD_MAX_SWATCHES)
}

/** Geometry for one swatch chip in the palette strip. */
interface SwatchRect {
  x: number
  width: number
}

/** Result of {@link paletteStripLayout}: chip size + positions, left-aligned. */
export interface PaletteStripLayout {
  /** Width (px) of each chip (also its height — chips are squares/rounded-squares). */
  size: number
  /** Gap (px) actually used between chips. */
  gap: number
  /** Per-chip rects, left-to-right. */
  rects: SwatchRect[]
  /** Total width occupied (px) — chips + gaps. */
  totalWidth: number
}

/**
 * Lay out an evenly-spaced, left-aligned strip of `count` square swatch chips
 * inside `width` px. Chip size is the largest that fits with `gap` between
 * chips, clamped to `[min, max]`; when the clamp forces chips wider than the
 * container the strip simply overflows the return `totalWidth` (caller decides
 * whether to clip) — but with the default cap of 6 swatches and a comfortable
 * container this never triggers. Returns zero-length for `count <= 0`.
 */
export function paletteStripLayout(opts: {
  count: number
  width: number
  gap: number
  min: number
  max: number
}): PaletteStripLayout {
  const { count, width, gap, min, max } = opts
  if (count <= 0 || width <= 0) return { size: 0, gap, rects: [], totalWidth: 0 }
  const raw = (width - gap * (count - 1)) / count
  const size = Math.max(min, Math.min(max, raw))
  const rects: SwatchRect[] = []
  for (let i = 0; i < count; i++) rects.push({ x: i * (size + gap), width: size })
  const totalWidth = count * size + (count - 1) * gap
  return { size, gap, rects, totalWidth }
}

/**
 * Build the download filename for the hero card: `sofa-hero-<slug>-<date>.png`
 * for the default `post` format, `sofa-hero-<slug>-<date>-<format>.png` for
 * `square`/`story` (back-compat: the default format's filename is unchanged).
 * The design name is slugified (lowercase, non-alphanumerics → single dashes,
 * trimmed); a blank/emoji-only name degrades to `design`. `date` defaults to
 * today (ISO `YYYY-MM-DD`) — passed in for deterministic tests.
 */
export function shareCardFilename(
  name: string,
  date: Date = new Date(),
  format: ShareCardFormat = 'post',
): string {
  const slug = String(name ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
  const stamp = date.toISOString().slice(0, 10)
  const suffix = format === 'post' ? '' : `-${format}`
  return `sofa-hero-${slug || 'design'}-${stamp}${suffix}.png`
}

// --- format / layout table --------------------------------------------------

/**
 * The three share-card aspect presets: `post` (4:5, the original default —
 * Instagram/Facebook feed post), `square` (1:1), `story` (9:16 — Instagram/
 * WhatsApp Story). Picked via a `Segmented` at the "Save hero image" entry
 * point (`ShareModal`); `post` is the default and byte-identical to the
 * original hardcoded card.
 */
export type ShareCardFormat = 'post' | 'square' | 'story'

/** Pixel dimensions for each format (all 1080 px wide — social-standard sizes). */
export const SHARE_CARD_DIMS: Record<ShareCardFormat, { width: number; height: number }> = {
  post: { width: 1080, height: 1350 },
  square: { width: 1080, height: 1080 },
  story: { width: 1080, height: 1920 },
}

/** Outer margin (px) on every side, and the hero panel's corner radius. */
const SHARE_CARD_PAD = 56
const SHARE_CARD_RADIUS = 28

/**
 * Fixed height (px) of the "chrome" block below the hero image — name line +
 * stat line + swatch strip + wordmark, with their internal gaps — measured
 * from the ORIGINAL 1080×1350 `post` card so the default format stays
 * byte-identical. Kept constant across formats so the hero simply fills
 * whatever top area remains above this fixed-height footer, per format.
 */
const SHARE_CARD_CHROME_H = 394
/** Gap (px) from the hero's bottom edge to the design-name baseline. */
const SHARE_CARD_NAME_OFFSET = 84
/** Gap (px) from the name baseline to the stat-line baseline. */
const SHARE_CARD_STATS_OFFSET = 46
/** Gap (px) from the stat-line baseline to the swatch strip's top edge. */
const SHARE_CARD_STRIP_OFFSET = 40

/** Rect for the hero image panel within the card. */
interface ShareCardRect {
  x: number
  y: number
  width: number
  height: number
}

/** Full pixel layout for one format: hero rect + the chrome block's anchors. */
export interface ShareCardLayout {
  width: number
  height: number
  pad: number
  radius: number
  hero: ShareCardRect
  /** Baseline y for the design-name line. */
  nameY: number
  /** Baseline y for the stat line. */
  statsY: number
  /** Top y for the swatch strip. */
  stripTop: number
  /** Baseline y for the wordmark. */
  wordY: number
  /** Max text/strip width (card width minus both margins). */
  maxTextW: number
}

/**
 * Compute the full pixel layout for a format: the hero panel fills the top of
 * the card (same {@link SHARE_CARD_PAD} margin on every side) down to a
 * fixed-height chrome footer (name/stats/strip/wordmark) anchored to the
 * bottom — so a taller format (`story`) just grows the hero, never the
 * footer. `post`'s numbers match the original hardcoded constants exactly
 * (`hero.height` = 900, `nameY` = 1040, `statsY` = 1086, `stripTop` = 1126,
 * `wordY` = 1294).
 */
export function shareCardLayout(format: ShareCardFormat): ShareCardLayout {
  const { width, height } = SHARE_CARD_DIMS[format]
  const pad = SHARE_CARD_PAD
  const heroBottom = height - SHARE_CARD_CHROME_H
  const hero: ShareCardRect = {
    x: pad,
    y: pad,
    width: width - pad * 2,
    height: heroBottom - pad,
  }
  const nameY = heroBottom + SHARE_CARD_NAME_OFFSET
  const statsY = nameY + SHARE_CARD_STATS_OFFSET
  const stripTop = statsY + SHARE_CARD_STRIP_OFFSET
  const wordY = height - pad
  return {
    width,
    height,
    pad,
    radius: SHARE_CARD_RADIUS,
    hero,
    nameY,
    statsY,
    stripTop,
    wordY,
    maxTextW: width - pad * 2,
  }
}
