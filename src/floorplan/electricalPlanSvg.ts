/**
 * Electrical / power & data plan SVG renderer (feature F29).
 *
 * Pure `ElectricalPlan → SVG string` step: draws the plan walls (thin) plus a
 * standard architectural electrical SYMBOL at each point, with a small legend /
 * schedule below. The viewBox is computed from the bounds of ALL walls (full
 * min AND max). Every colour comes from the injected palette — nothing themed
 * is hardcoded. Free-text labels are XML-escaped before they reach the markup.
 *
 * Symbol glyphs (each a circle + marking):
 *   socket        → circle with two short prongs (power outlet)
 *   socket-double → circle with "2"
 *   switch        → circle with "S"
 *   data          → circle with "D"
 *   tv-point      → circle with "TV"
 *   aircon        → circle with "AC"
 *   water-heater  → circle with "WH"
 *
 * Self-contained: imports only `./electricalPlan` and `./types`.
 */

import type { ElectricalKind, ElectricalPlan } from './electricalPlan'
import { electricalKindLabel } from './electricalPlan'
import type { FloorPlan, PlanWall } from './types'
import { wallLength } from './types'

/** Palette injected by the caller (resolved theme tokens). */
interface ElectricalPalette {
  /** Plan wall stroke. */
  wall: string
  /** Foreground for legend text + glyph markings. */
  ink: string
  /** Symbol circle stroke / accent. */
  symbol: string
}

export interface ElectricalSvgOpts {
  palette: ElectricalPalette
  /** Target SVG width in pixels (height derives from plan aspect). Default 800. */
  widthPx?: number
  /** When set (mm printed per metre of real-world extent, from
   *  `drawingScale.ts:pickDrawingScale`), sizes the returned `<svg>` with
   *  explicit `width`/`height` in mm instead of pixels — print-true (TODO G2). */
  printMmPerM?: number
}

/** Padding (metres) around the wall bounds. */
const PAD = 0.5
/** Symbol circle radius, pixels. */
const SYM_R = 9
/** Legend layout, pixels. */
const LEGEND_PAD = 12
const LEGEND_ROW = 22
const FONT = 12
const SYM_FONT = 8

/** Full XML-attribute / text escaping for injected strings (5 entities). */
function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function n(v: number): string {
  return (Math.round(v * 100) / 100).toString()
}

interface Bounds {
  minX: number
  minZ: number
  maxX: number
  maxZ: number
}

/** Bounding box of every (non-zero-length) wall — full min/max. */
function wallBounds(walls: PlanWall[]): Bounds {
  let minX = Number.POSITIVE_INFINITY
  let minZ = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxZ = Number.NEGATIVE_INFINITY
  for (const w of walls) {
    if (wallLength(w) === 0) continue
    for (const [x, z] of [w.start, w.end]) {
      if (x < minX) minX = x
      if (z < minZ) minZ = z
      if (x > maxX) maxX = x
      if (z > maxZ) maxZ = z
    }
  }
  if (!Number.isFinite(minX)) return { minX: 0, minZ: 0, maxX: 0, maxZ: 0 }
  return { minX, minZ, maxX, maxZ }
}

/** Short marking text drawn inside a symbol circle (empty for plain socket).
 *  Exported (MEP layer, G1 PR3) so the 2D editor's `MepLayer` renders the same
 *  glyph vocabulary as the exported sheet — one symbol set, not two. */
export const ELEC_SYM_TEXT: Record<ElectricalKind, string> = {
  socket: '',
  'socket-double': '2',
  switch: 'S',
  data: 'D',
  'tv-point': 'TV',
  aircon: 'AC',
  'water-heater': 'WH',
}

/**
 * Render the electrical plan as a standalone SVG string. Plan metres map to
 * pixels by a uniform scale; +Z (south) maps to +Y (down) in SVG.
 */
export function electricalSvg(
  plan: FloorPlan,
  electrical: ElectricalPlan,
  opts: ElectricalSvgOpts,
): string {
  const { palette } = opts
  const widthPx = opts.widthPx && opts.widthPx > 0 ? opts.widthPx : 800

  const walls = plan && Array.isArray(plan.walls) ? plan.walls : []
  const drawn = walls.filter((w) => wallLength(w) > 0)
  const points = Array.isArray(electrical?.points) ? electrical.points : []
  const schedule = Array.isArray(electrical?.schedule) ? electrical.schedule : []

  const b = wallBounds(drawn)
  const worldW = Math.max(b.maxX - b.minX + PAD * 2, 1)
  const worldH = Math.max(b.maxZ - b.minZ + PAD * 2, 1)
  const scale = widthPx / worldW
  const planH = worldH * scale

  const px = (x: number) => (x - b.minX + PAD) * scale
  const py = (z: number) => (z - b.minZ + PAD) * scale

  const legendRows = Math.max(schedule.length, 1)
  const legendH = LEGEND_PAD * 2 + LEGEND_ROW * legendRows
  const heightPx = planH + legendH

  const parts: string[] = []
  // Print-true sizing (TODO G2): 1 viewBox unit already equals `1/scale`
  // metres, so `width/height px × (mmPerM / scale)` mm is the sheet's exact
  // printed size at the locked scale. An inline `style` (not the plain
  // `width`/`height` attribute) is required: presentational attributes have
  // the LOWEST CSS priority, so a plain attribute would be silently
  // overridden by the drawing-set's `.draw svg { width:100% }` rule.
  const sizeStyle =
    opts.printMmPerM != null
      ? ` style="width:${n(widthPx * (opts.printMmPerM / scale))}mm;height:${n(heightPx * (opts.printMmPerM / scale))}mm"`
      : ''
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${n(widthPx)}" height="${n(heightPx)}"${sizeStyle} viewBox="0 0 ${n(widthPx)} ${n(heightPx)}">`,
  )

  // Plan walls (thin).
  for (const w of drawn) {
    parts.push(
      `<line x1="${n(px(w.start[0]))}" y1="${n(py(w.start[1]))}" x2="${n(px(w.end[0]))}" ` +
        `y2="${n(py(w.end[1]))}" stroke="${esc(palette.wall)}" stroke-width="1.5" ` +
        'stroke-linecap="round" />',
    )
  }

  // Symbols (drawn even when outside the wall bounds).
  for (const p of points) {
    parts.push(symbol(p.kind, px(p.x), py(p.z), palette, p.label))
  }

  // Legend / schedule.
  parts.push(legend(schedule, planH, palette))

  parts.push('</svg>')
  return parts.join('\n')
}

/** A single electrical symbol glyph centred at (cx,cy). */
function symbol(
  kind: ElectricalKind,
  cx: number,
  cy: number,
  palette: ElectricalPalette,
  label: string | undefined,
): string {
  const out: string[] = [`<g class="elec-symbol" data-kind="${esc(kind)}">`]
  out.push(
    `<circle cx="${n(cx)}" cy="${n(cy)}" r="${SYM_R}" fill="none" ` +
      `stroke="${esc(palette.symbol)}" stroke-width="1.5" />`,
  )
  if (kind === 'socket') {
    // Two short prongs (vertical lines) inside the circle.
    const half = SYM_R * 0.45
    out.push(
      `<line x1="${n(cx - 3)}" y1="${n(cy - half)}" x2="${n(cx - 3)}" y2="${n(cy + half)}" ` +
        `stroke="${esc(palette.ink)}" stroke-width="1.5" stroke-linecap="round" />`,
    )
    out.push(
      `<line x1="${n(cx + 3)}" y1="${n(cy - half)}" x2="${n(cx + 3)}" y2="${n(cy + half)}" ` +
        `stroke="${esc(palette.ink)}" stroke-width="1.5" stroke-linecap="round" />`,
    )
  } else {
    out.push(
      `<text x="${n(cx)}" y="${n(cy)}" font-size="${SYM_FONT}" text-anchor="middle" ` +
        `dominant-baseline="central" fill="${esc(palette.ink)}">${esc(ELEC_SYM_TEXT[kind])}</text>`,
    )
  }
  if (label) {
    out.push(
      `<text x="${n(cx + SYM_R + 2)}" y="${n(cy)}" font-size="${SYM_FONT}" ` +
        `dominant-baseline="central" fill="${esc(palette.ink)}">${esc(label)}</text>`,
    )
  }
  out.push('</g>')
  return out.join('\n')
}

/** Schedule legend: one row per kind, with a miniature symbol + count + label. */
function legend(
  schedule: ElectricalPlan['schedule'],
  planH: number,
  palette: ElectricalPalette,
): string {
  const out: string[] = ['<g class="legend">']
  let y = planH + LEGEND_PAD + LEGEND_ROW / 2
  if (schedule.length === 0) {
    out.push(
      `<text x="${LEGEND_PAD}" y="${n(y)}" font-size="${FONT}" dominant-baseline="middle" ` +
        `fill="${esc(palette.ink)}">No electrical points</text>`,
    )
  }
  for (const row of schedule) {
    const cx = LEGEND_PAD + SYM_R
    out.push(symbol(row.kind, cx, y, palette, undefined))
    const text = `${electricalKindLabel(row.kind)} × ${row.count}`
    out.push(
      `<text x="${LEGEND_PAD + SYM_R * 2 + 8}" y="${n(y)}" font-size="${FONT}" ` +
        `dominant-baseline="middle" fill="${esc(palette.ink)}">${esc(text)}</text>`,
    )
    y += LEGEND_ROW
  }
  out.push('</g>')
  return out.join('\n')
}
