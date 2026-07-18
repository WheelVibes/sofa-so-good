/**
 * Carpentry elevation/section SVG renderer (TODO G8). Pure
 * `CarpentryView → SVG string` step, mirroring `floorplan/sectionSvg.ts` +
 * `floorplan/autoDimensionSvg.ts`'s conventions (tick + centred label
 * dimension lines, print-true `printMmPerM` sizing) so a carpentry sheet
 * reads consistently with the rest of the drawing set. Every dimension label
 * is millimetres (carpentry/joinery is mm-throughout per SG practice —
 * distinct from the plan sheets' metric/imperial `UnitSystem` toggle).
 */

import type { CarpentryDim, CarpentryRect, CarpentryView } from '../furniture/carpentryElevation'

interface CarpentryPalette {
  /** Solid, visible-from-this-view part outline + fill. */
  ink: string
  /** Faint fill for a part. */
  fill: string
  /** Hidden-line (shelf/rail behind a closed front) stroke. */
  hidden: string
}

export interface CarpentrySvgOpts {
  palette: CarpentryPalette
  widthPx?: number
  /** mm printed per metre of real-world extent — print-true sizing (TODO G2),
   *  same mechanism as every other drawing-set sheet builder. */
  printMmPerM?: number
}

// Wide enough for the longest label this module ever prints ("Drawer 2
// height AFF — 1234 mm", ~30 chars at FONT px) to sit fully inside the
// viewBox without clipping — several dims read OUTWARD from their tick
// line (`labelSide`), so the padding must cover a full label width, not
// just a small margin.
const PAD_L = 170
const PAD_R = 170
const PAD_T = 30
const PAD_B = 30
const TICK = 5
const FONT = 11

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function n(v: number): string {
  return (Math.round(v * 100) / 100).toString()
}

/** Bounding box (metres, local frame) of every rect + dimension line the view
 *  draws, so the padding always has room for the outermost dimension row. */
function viewBounds(view: CarpentryView): { x0: number; y0: number; x1: number; y1: number } {
  let x0 = Number.POSITIVE_INFINITY
  let y0 = Number.POSITIVE_INFINITY
  let x1 = Number.NEGATIVE_INFINITY
  let y1 = Number.NEGATIVE_INFINITY
  const note = (x: number, y: number) => {
    if (x < x0) x0 = x
    if (x > x1) x1 = x
    if (y < y0) y0 = y
    if (y > y1) y1 = y
  }
  for (const r of view.rects) {
    note(r.x0, r.y0)
    note(r.x1, r.y1)
  }
  for (const d of view.dims) {
    if (d.axis === 'h') {
      note(d.from, d.at)
      note(d.to, d.at)
    } else {
      note(d.at, d.from)
      note(d.at, d.to)
    }
  }
  if (!Number.isFinite(x0)) return { x0: 0, y0: 0, x1: 1, y1: 1 }
  return { x0, y0, x1, y1 }
}

function rectFill(r: CarpentryRect, palette: CarpentryPalette): string {
  return r.hidden ? 'none' : palette.fill
}

/** Render one `CarpentryView` (elevation or section) as a standalone SVG. */
export function carpentrySvg(view: CarpentryView, opts: CarpentrySvgOpts): string {
  const { palette } = opts
  const widthPx = opts.widthPx && opts.widthPx > 0 ? opts.widthPx : 700
  const b = viewBounds(view)
  const worldW = Math.max(b.x1 - b.x0, 0.001)
  const worldH = Math.max(b.y1 - b.y0, 0.001)

  const drawW = Math.max(widthPx - PAD_L - PAD_R, 1)
  const scale = drawW / worldW
  const drawH = worldH * scale
  const heightPx = drawH + PAD_T + PAD_B

  // metre → pixel. X grows right from b.x0; Y is flipped (local Y grows up,
  // SVG grows down).
  const px = (x: number) => PAD_L + (x - b.x0) * scale
  const py = (y: number) => PAD_T + (b.y1 - y) * scale

  const sizeStyle =
    opts.printMmPerM != null
      ? ` style="width:${n(widthPx * (opts.printMmPerM / scale))}mm;height:${n(heightPx * (opts.printMmPerM / scale))}mm"`
      : ''
  const parts: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${n(widthPx)}" height="${n(heightPx)}"${sizeStyle} viewBox="0 0 ${n(widthPx)} ${n(heightPx)}">`,
  ]

  parts.push('<g class="parts">')
  for (const r of view.rects) {
    const rx = px(r.x0)
    const ry = py(r.y1)
    const rw = Math.max((r.x1 - r.x0) * scale, 0.5)
    const rh = Math.max((r.y1 - r.y0) * scale, 0.5)
    const dash = r.hidden ? ' stroke-dasharray="3 2"' : ''
    parts.push(
      `<rect x="${n(rx)}" y="${n(ry)}" width="${n(rw)}" height="${n(rh)}" ` +
        `fill="${esc(rectFill(r, palette))}" fill-opacity="0.5" ` +
        `stroke="${esc(r.hidden ? palette.hidden : palette.ink)}" stroke-width="1"${dash} />`,
    )
  }
  parts.push('</g>')

  parts.push('<g class="dims">')
  const labelY = declutterLabelY(view.dims, py)
  view.dims.forEach((d, i) => {
    parts.push(dimMarkup(d, px, py, palette.ink, labelY[i]!))
  })
  parts.push('</g>')

  parts.push('</svg>')
  return parts.join('\n')
}

/** Millimetre dimension label — carpentry sheets are always mm (SG practice). */
function mmLabel(d: CarpentryDim): string {
  return `${esc(d.label)} — ${d.valueMm} mm`
}

/** Minimum vertical gap (px) between two 'v'-dim labels sharing a `labelSide`
 *  column — a touch more than one text line, so two close-together AFF
 *  heights (e.g. a wardrobe's top shelf + the rail just under it) never read
 *  as overlapping text. */
const LABEL_MIN_GAP = FONT + 5

/**
 * Declutter every `'v'`-axis dim's label Y position, per `labelSide` column
 * (a 'left' and a 'right' column never interact — they're on opposite sides
 * of the drawing). Two labels whose TRUE tick midpoints would read within
 * `LABEL_MIN_GAP` px of each other (e.g. a wardrobe's shelf + the rail just
 * below it) are pushed apart, processed top-to-bottom so the nudge only ever
 * cascades downward. The tick lines themselves stay at their true height —
 * only the text position is adjusted, returned as one Y per dim (same index
 * as `view.dims`; `NaN` for 'h' dims, unused by the caller).
 */
function declutterLabelY(dims: CarpentryDim[], py: (y: number) => number): number[] {
  const out = new Array<number>(dims.length).fill(Number.NaN)
  for (const side of ['left', 'right'] as const) {
    const idxs = dims
      .map((d, i) => ({ d, i }))
      .filter(({ d }) => d.axis === 'v' && d.labelSide === side)
      .map(({ d, i }) => ({ i, trueY: (py(d.from) + py(d.to)) / 2 }))
      .sort((a, b) => a.trueY - b.trueY)
    let prevY = Number.NEGATIVE_INFINITY
    for (const { i, trueY } of idxs) {
      const y = Math.max(trueY, prevY + LABEL_MIN_GAP)
      out[i] = y
      prevY = y
    }
  }
  return out
}

function dimMarkup(
  d: CarpentryDim,
  px: (x: number) => number,
  py: (y: number) => number,
  ink: string,
  labelY: number,
): string {
  if (d.axis === 'h') {
    const x1 = px(d.from)
    const x2 = px(d.to)
    const y = py(d.at)
    const midX = (x1 + x2) / 2
    return [
      `<line x1="${n(x1)}" y1="${n(y)}" x2="${n(x2)}" y2="${n(y)}" stroke="${esc(ink)}" stroke-width="1" />`,
      `<line x1="${n(x1)}" y1="${n(y - TICK)}" x2="${n(x1)}" y2="${n(y + TICK)}" stroke="${esc(ink)}" stroke-width="1" />`,
      `<line x1="${n(x2)}" y1="${n(y - TICK)}" x2="${n(x2)}" y2="${n(y + TICK)}" stroke="${esc(ink)}" stroke-width="1" />`,
      `<text x="${n(midX)}" y="${n(y - TICK - 3)}" font-size="${FONT}" text-anchor="middle" fill="${esc(ink)}">${mmLabel(d)}</text>`,
    ].join('\n')
  }
  const y1 = py(d.from)
  const y2 = py(d.to)
  const x = px(d.at)
  const trueMidY = (y1 + y2) / 2
  // Label extends AWAY from the geometry: a left-side dim's text reads
  // further left (anchor "end", ending at the tick), a right-side dim's text
  // reads further right (anchor "start") — never back toward the drawing.
  const textX = d.labelSide === 'left' ? x - TICK - 3 : x + TICK + 3
  const anchor = d.labelSide === 'left' ? 'end' : 'start'
  // When decluttering nudged this label away from its tick's true height, a
  // short leader dash ties the two together so the value still reads back to
  // the right tick unambiguously.
  const leader =
    Math.abs(labelY - trueMidY) > 0.5
      ? `<line x1="${n(x)}" y1="${n(trueMidY)}" x2="${n(textX)}" y2="${n(labelY)}" stroke="${esc(ink)}" stroke-width="0.5" stroke-dasharray="2 1.5" />`
      : ''
  return [
    `<line x1="${n(x)}" y1="${n(y1)}" x2="${n(x)}" y2="${n(y2)}" stroke="${esc(ink)}" stroke-width="1" />`,
    `<line x1="${n(x - TICK)}" y1="${n(y1)}" x2="${n(x + TICK)}" y2="${n(y1)}" stroke="${esc(ink)}" stroke-width="1" />`,
    `<line x1="${n(x - TICK)}" y1="${n(y2)}" x2="${n(x + TICK)}" y2="${n(y2)}" stroke="${esc(ink)}" stroke-width="1" />`,
    leader,
    `<text x="${n(textX)}" y="${n(labelY)}" font-size="${FONT}" text-anchor="${anchor}" dominant-baseline="middle" fill="${esc(ink)}">${mmLabel(d)}</text>`,
  ].join('\n')
}
