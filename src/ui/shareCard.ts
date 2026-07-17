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
import type { FloorPlan } from '../floorplan/types'
import { planTotalArea } from '../floorplan/types'
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
  const rooms = plan.rooms.length
  const itemsText = `${n} ${n === 1 ? 'item' : 'items'}`
  const areaText = formatArea(planTotalArea(plan), units)
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
export interface SwatchRect {
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
 * Build the download filename for the hero card: `sofa-hero-<slug>-<date>.png`.
 * The design name is slugified (lowercase, non-alphanumerics → single dashes,
 * trimmed); a blank/emoji-only name degrades to `design`. `date` defaults to
 * today (ISO `YYYY-MM-DD`) — passed in for deterministic tests.
 */
export function shareCardFilename(name: string, date: Date = new Date()): string {
  const slug = String(name ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
  const stamp = date.toISOString().slice(0, 10)
  return `sofa-hero-${slug || 'design'}-${stamp}.png`
}
