/**
 * Auto-dimension SVG renderer (feature F15) — also hosts the setting-out
 * dimension row (TODO G3, `settingOutDims` flag) on the SAME sheet.
 *
 * Pure `core → SVG string` step: takes a FloorPlan, builds dimensions via the
 * self-contained core, and emits an SVG that draws the plan walls (thin) plus
 * dimension lines with tick marks and centred labels. All colours are injected
 * by the caller (palette) — nothing theme-specific is hardcoded.
 *
 * **Setting-out row (G3):** the dimensioned-plan sheet is the natural host —
 * it already draws the auto-dims + the plan walls at the exact scale/padding
 * a datum-referenced row needs to align with; a brand-new sheet would just
 * duplicate that wall drawing and scale-picking for one extra row. When
 * `opts.settingOut` is set this module additionally draws (via
 * `./settingOut`'s pure `datumPoint`/`settingOutDimensions`): a datum marker
 * (crosshair + triangle) with a "SETTING-OUT DATUM" label, and two running-
 * dimension rows (one along the top for X-axis wall faces, one along the left
 * for Z-axis wall faces) — visually distinct from the existing auto-dims
 * (dashed, in `palette.datum`) and drawn further outside the plan so the two
 * layers don't overlap.
 *
 * Self-contained: imports only `./autoDimension`, `./settingOut` and `./types`.
 */

import { formatDrawingLength, type UnitSystem } from '../utils/measurement'
import { buildDimensions, type Dimension } from './autoDimension'
import { buildFloorTransitions, buildRoomFflTags } from './floorLevels'
import { type SettingOutFace, settingOutDimensions } from './settingOut'
import { type FloorPlan, planBounds, roomPolygon } from './types'
import type { WaterproofingZone } from './waterproofing'

interface DimensionSvgPalette {
  /** Strong foreground (dimension lines, ticks, labels). */
  ink: string
  /** Muted foreground (plan walls). */
  faint: string
  /** Setting-out row + datum marker colour (G3). Falls back to `ink` when
   *  absent, so an existing palette stays valid without opting in. */
  datum?: string
}

export interface DimensionSvgOpts {
  palette: DimensionSvgPalette
  /** Target SVG width in pixels (height derives from plan aspect). Default 800. */
  widthPx?: number
  /** Display unit system for dimension labels. Default 'metric'. */
  units?: UnitSystem
  /** When set (mm printed per metre of real-world extent, from
   *  `drawingScale.ts:pickDrawingScale`), sizes the returned `<svg>` with
   *  explicit `width`/`height` in mm instead of pixels — print-true (TODO G2). */
  printMmPerM?: number
  /** Draw the setting-out datum + running dimension rows (`settingOutDims`
   *  flag, TODO G3). Default false (existing callers are unaffected). */
  settingOut?: boolean
  /** Waterproofing zones (BSJ-7, `waterproofing` flag) to hatch on the plan +
   *  list in a legend. Built by the caller from the plan + placed items. Absent
   *  / empty → no wet-area overlay. */
  waterproofingZones?: readonly WaterproofingZone[]
  /** Draw per-room FFL tags + doorway step/transition markers (BSJ-8,
   *  `floorLevels` flag), derived from `PlanRoom.floorLevelMm`. Default false. */
  floorLevels?: boolean
}

/** Padding (metres) around the plan bounds so offset dimension lines fit. */
const PAD = 1.0
/** Extra padding (metres) when the setting-out row is drawn — it sits further
 *  outside the plan than the existing auto-dims (`ROW_OFFSET_M` below). */
const PAD_SETTING_OUT = 1.8
/** How far outside the plan (metres, world space) the setting-out rows sit —
 *  further out than the auto-dims' own `DIMENSION_OFFSET` (0.6 m) so the two
 *  layers never overlap. */
const ROW_OFFSET_M = 1.3
/** Tick mark half-length, in pixels. */
const TICK = 5
/** Label font size, in pixels. */
const FONT = 12
/** Setting-out datum marker radius, in pixels. */
const DATUM_R = 8

/** Minimal XML-attribute escaping for injected strings/labels. */
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

/**
 * Render a floor plan's auto-dimensions as a standalone SVG string. Plan metres
 * map to pixels by a uniform scale; +Z (south) maps to +Y (down) in SVG.
 */
export function dimensionSvg(plan: FloorPlan, opts: DimensionSvgOpts): string {
  const { palette } = opts
  const widthPx = opts.widthPx && opts.widthPx > 0 ? opts.widthPx : 800
  const units = opts.units ?? 'metric'
  const dims = buildDimensions(plan, units)
  const showSettingOut = opts.settingOut === true
  const pad = showSettingOut ? PAD_SETTING_OUT : PAD

  const [maxX, maxZ] = planBounds(
    plan && typeof plan === 'object'
      ? {
          ...plan,
          walls: Array.isArray(plan.walls) ? plan.walls : [],
          rooms: Array.isArray(plan.rooms) ? plan.rooms : [],
        }
      : ({ extent: [0, 0], walls: [], rooms: [] } as unknown as FloorPlan),
  )

  // World extent including padding for the outside dimension lines.
  const worldW = Math.max(maxX + pad * 2, 1)
  const worldH = Math.max(maxZ + pad * 2, 1)
  const scale = widthPx / worldW
  const heightPx = worldH * scale

  // Metre→pixel transform (shift by `pad` so the negative-offset lines stay in view).
  const px = (x: number) => (x + pad) * scale
  const py = (z: number) => (z + pad) * scale

  const walls = Array.isArray(plan?.walls) ? plan.walls : []

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

  // Plan walls (thin, faint).
  for (const w of walls) {
    parts.push(
      `<line x1="${n(px(w.start[0]))}" y1="${n(py(w.start[1]))}" x2="${n(
        px(w.end[0]),
      )}" y2="${n(py(w.end[1]))}" stroke="${esc(palette.faint)}" stroke-width="1.5" />`,
    )
  }

  // Dimension lines (overall + per-room) with tick marks + centred labels.
  for (const d of [...dims.overall, ...dims.rooms]) {
    parts.push(dimensionMarkup(d, px, py, palette))
  }

  // Setting-out datum + running dimension rows (G3) — a distinct row outside
  // the auto-dims above, sharing this sheet's exact scale/transform.
  if (showSettingOut) {
    parts.push(settingOutMarkup(plan, px, py, palette, units))
  }

  // Waterproofing hatch (BSJ-7) + floor-level FFL tags & step markers (BSJ-8) —
  // a documentation overlay for the tiler, sharing this sheet's scale/transform.
  const zones = opts.waterproofingZones ?? []
  if (zones.length > 0 || opts.floorLevels) {
    parts.push(wetAndLevelsOverlay(plan, zones, opts.floorLevels === true, px, py, heightPx))
  }

  parts.push('</svg>')
  return parts.join('\n')
}

/** Datum marker + the two running-dimension rows (G3). Drawn in
 *  `palette.datum` (falls back to `palette.ink`), dashed, further outside the
 *  plan than the auto-dims so the two layers read distinctly. */
function settingOutMarkup(
  plan: FloorPlan,
  px: (x: number) => number,
  py: (z: number) => number,
  palette: DimensionSvgPalette,
  units: UnitSystem,
): string {
  const color = palette.datum ?? palette.ink
  const set = settingOutDimensions(plan)
  const parts: string[] = []

  const dx = px(set.datum[0])
  const dy = py(set.datum[1])
  parts.push(
    `<g class="setting-out-datum">` +
      `<line x1="${n(dx - DATUM_R)}" y1="${n(dy)}" x2="${n(dx + DATUM_R)}" y2="${n(dy)}" stroke="${esc(color)}" stroke-width="1.5"/>` +
      `<line x1="${n(dx)}" y1="${n(dy - DATUM_R)}" x2="${n(dx)}" y2="${n(dy + DATUM_R)}" stroke="${esc(color)}" stroke-width="1.5"/>` +
      `<path d="M ${n(dx)} ${n(dy + DATUM_R + 2)} L ${n(dx - 5)} ${n(dy + DATUM_R + 10)} L ${n(dx + 5)} ${n(dy + DATUM_R + 10)} Z" fill="${esc(color)}"/>` +
      `<text x="${n(dx)}" y="${n(dy + DATUM_R + 24)}" font-size="${FONT}" font-weight="700" text-anchor="middle" fill="${esc(color)}">SETTING-OUT DATUM</text>` +
      `</g>`,
  )

  // X-axis row: horizontal running row above the plan (world z = datum.z − ROW_OFFSET_M).
  if (set.x.length > 0) {
    parts.push(settingOutRow(set.x, 'x', set.datum, px, py, color, units))
  }
  // Z-axis row: vertical running row left of the plan (world x = datum.x − ROW_OFFSET_M).
  if (set.z.length > 0) {
    parts.push(settingOutRow(set.z, 'z', set.datum, px, py, color, units))
  }

  return parts.join('\n')
}

/** One running-dimension row (all faces along a single axis): a dashed
 *  baseline spanning the datum → furthest face, a tick + running-distance
 *  label at the datum ("0") and at every face. */
function settingOutRow(
  faces: SettingOutFace[],
  axis: 'x' | 'z',
  datum: readonly [number, number],
  px: (x: number) => number,
  py: (z: number) => number,
  color: string,
  units: UnitSystem,
): string {
  const parts: string[] = []
  if (axis === 'x') {
    const rowY = py(datum[1] - ROW_OFFSET_M)
    const xs = [px(datum[0]), ...faces.map((f) => px(f.point[0]))]
    parts.push(
      `<line x1="${n(Math.min(...xs))}" y1="${n(rowY)}" x2="${n(Math.max(...xs))}" y2="${n(rowY)}" stroke="${esc(color)}" stroke-width="1" stroke-dasharray="4 3"/>`,
    )
    const labels = ['0', ...faces.map((f) => formatDrawingLength(f.distance, units))]
    const rows = staggerLabelRows(xs, labels)
    xs.forEach((cx, i) => {
      parts.push(vTickLabel(cx, rowY, labels[i]!, color, rows[i]!))
    })
  } else {
    const rowX = px(datum[0] - ROW_OFFSET_M)
    const ys = [py(datum[1]), ...faces.map((f) => py(f.point[1]))]
    parts.push(
      `<line x1="${n(rowX)}" y1="${n(Math.min(...ys))}" x2="${n(rowX)}" y2="${n(Math.max(...ys))}" stroke="${esc(color)}" stroke-width="1" stroke-dasharray="4 3"/>`,
    )
    const labels = ['0', ...faces.map((f) => formatDrawingLength(f.distance, units))]
    const rows = staggerLabelRows(ys, labels)
    ys.forEach((cy, i) => {
      parts.push(hTickLabel(rowX, cy, labels[i]!, color, rows[i]!))
    })
  }
  return parts.join('\n')
}

/** Estimated glyph width (px) for the small setting-out label font — rough
 *  text-metrics stand-in (real-metric measurement needs a DOM/canvas this
 *  module deliberately stays free of), just enough to detect "these two
 *  labels would visually collide/concatenate". */
const LABEL_CHAR_W = (FONT - 2) * 0.58

/**
 * Two datum/running labels along the SAME baseline row can land within a
 * font-width of each other (e.g. two wall faces 0.1 m apart) and print
 * concatenated ("4.854.95 m") with no gap. Assigns each label a row index
 * (0 or 1, two-row alternation, same convention as `dimensionChain`'s running
 * rows) — a label overlapping the nearest still-open row-0 slot escalates to
 * row 1, leapfrogging back to row 0 once clear again — so close labels stack
 * onto alternating offsets instead of colliding. Positions need not be sorted;
 * pairs are compared by estimated label bounding-box overlap regardless of
 * input order.
 */
function staggerLabelRows(positions: number[], labels: string[]): number[] {
  const order = positions.map((_, i) => i).sort((a, b) => positions[a]! - positions[b]!)
  // Each row's rightmost occupied edge so far — checked against BOTH rows
  // (not just "does row 0 fit, else row 1"), so a cluster of 3+ close labels
  // doesn't dump two colliding labels into row 1 together.
  const rowRight: [number, number] = [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY]
  const rows = new Array<number>(positions.length).fill(0)
  for (const i of order) {
    const halfW = (labels[i]!.length * LABEL_CHAR_W) / 2
    const left = positions[i]! - halfW
    const right = positions[i]! + halfW
    const fits0 = left >= rowRight[0]
    const fits1 = left >= rowRight[1]
    let row: number
    if (fits0 && fits1) {
      // Both clear — pack tightest (the row whose edge sits closer behind).
      row = rowRight[0] >= rowRight[1] ? 0 : 1
    } else if (fits0) {
      row = 0
    } else if (fits1) {
      row = 1
    } else {
      // Neither clears (a 3rd+ label crowded into an already-tight cluster) —
      // fall back to whichever row has the least residual overlap.
      row = rowRight[0] <= rowRight[1] ? 0 : 1
    }
    rows[i] = row
    rowRight[row] = right
  }
  return rows
}

/** Extra offset (px) applied per stagger row so a row-1 label clears row 0. */
const LABEL_ROW_GAP = 11

/** A short vertical tick on a horizontal baseline, with its label above it —
 *  `row` (0 or 1, see `staggerLabelRows`) pushes the label further out to
 *  clear a close neighbour still occupying row 0. */
function vTickLabel(cx: number, cy: number, label: string, color: string, row = 0): string {
  return (
    `<line x1="${n(cx)}" y1="${n(cy - TICK)}" x2="${n(cx)}" y2="${n(cy + TICK)}" stroke="${esc(color)}" stroke-width="1"/>` +
    `<text x="${n(cx)}" y="${n(cy - TICK - 3 - row * LABEL_ROW_GAP)}" font-size="${FONT - 2}" text-anchor="middle" fill="${esc(color)}">${esc(label)}</text>`
  )
}

/** A short horizontal tick on a vertical baseline, with its label to the left
 *  — `row` (0 or 1, see `staggerLabelRows`) pushes the label further out to
 *  clear a close neighbour still occupying row 0. */
function hTickLabel(cx: number, cy: number, label: string, color: string, row = 0): string {
  return (
    `<line x1="${n(cx - TICK)}" y1="${n(cy)}" x2="${n(cx + TICK)}" y2="${n(cy)}" stroke="${esc(color)}" stroke-width="1"/>` +
    `<text x="${n(cx - TICK - 3 - row * LABEL_ROW_GAP)}" y="${n(cy)}" font-size="${FONT - 2}" text-anchor="end" dominant-baseline="middle" fill="${esc(color)}">${esc(label)}</text>`
  )
}

// --- Waterproofing + floor-level overlay (BSJ-7 / BSJ-8) --------------------
/** Waterproofing hatch colour (print sheet, not a themed DOM surface). */
const WP_COLOR = '#0891b2'
/** Floor-level step / FFL tag colour. */
const FFL_COLOR = '#b45309'

/**
 * Wet-area waterproofing hatch (BSJ-7) + per-room FFL tags and doorway step
 * markers (BSJ-8), drawn in the SAME pixel transform as the dimensioned plan.
 * A small bottom-left legend explains the symbols. Pure string generation.
 */
function wetAndLevelsOverlay(
  plan: FloorPlan,
  zones: readonly WaterproofingZone[],
  floorLevels: boolean,
  px: (x: number) => number,
  py: (z: number) => number,
  heightPx: number,
): string {
  const parts: string[] = []
  const legend: { swatch: string; text: string }[] = []

  // --- Waterproofing zone hatch (BSJ-7) ---
  if (zones.length > 0) {
    parts.push(
      `<defs><pattern id="wp-hatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">` +
        `<line x1="0" y1="0" x2="0" y2="8" stroke="${WP_COLOR}" stroke-width="1.1" stroke-opacity="0.5"/></pattern></defs>`,
    )
    const roomById = new Map(plan.rooms.map((r) => [r.id, r] as const))
    for (const z of zones) {
      const room = roomById.get(z.roomId)
      if (!room) continue
      const poly = roomPolygon(room)
      if (poly.length < 3) continue
      const pts = poly.map(([x, zz]) => `${n(px(x))},${n(py(zz))}`).join(' ')
      parts.push(
        `<polygon points="${pts}" fill="url(#wp-hatch)" stroke="${WP_COLOR}" stroke-width="0.8" stroke-opacity="0.6"/>`,
      )
    }
    legend.push({ swatch: 'hatch', text: 'Waterproofing zone (floor + wall upturn)' })
  }

  // --- Floor-level FFL tags + doorway step markers (BSJ-8) ---
  if (floorLevels) {
    for (const t of buildRoomFflTags(plan)) {
      const cx = px(t.labelPos[0])
      const cy = py(t.labelPos[1]) + FONT + 4 // just below the room centre
      const w = t.tag.length * (FONT - 2) * 0.62 + 8
      parts.push(
        `<g class="ffl-tag">` +
          `<rect x="${n(cx - w / 2)}" y="${n(cy - FONT + 1)}" width="${n(w)}" height="${n(FONT + 4)}" rx="3" fill="#ffffff" fill-opacity="0.9" stroke="${FFL_COLOR}" stroke-width="0.8"/>` +
          `<text x="${n(cx)}" y="${n(cy)}" font-size="${FONT - 1}" font-weight="700" text-anchor="middle" dominant-baseline="middle" fill="${FFL_COLOR}">${esc(t.tag)}</text>` +
          `</g>`,
      )
    }
    let anyStep = false
    for (const tr of buildFloorTransitions(plan)) {
      anyStep = true
      const cx = px(tr.center[0])
      const cy = py(tr.center[1])
      const r = 6
      // A filled diamond at the doorway + a white-backed caption above it.
      parts.push(
        `<g class="ffl-step">` +
          `<path d="M ${n(cx)} ${n(cy - r)} L ${n(cx + r)} ${n(cy)} L ${n(cx)} ${n(cy + r)} L ${n(cx - r)} ${n(cy)} Z" fill="${FFL_COLOR}" stroke="#ffffff" stroke-width="1"/>`,
      )
      const cap = tr.note
      const cw = cap.length * (FONT - 3) * 0.56 + 6
      parts.push(
        `<rect x="${n(cx - cw / 2)}" y="${n(cy - r - FONT - 3)}" width="${n(cw)}" height="${n(FONT + 2)}" rx="2" fill="#ffffff" fill-opacity="0.9"/>` +
          `<text x="${n(cx)}" y="${n(cy - r - 4)}" font-size="${FONT - 3}" font-weight="600" text-anchor="middle" fill="${FFL_COLOR}">${esc(cap)}</text>` +
          `</g>`,
      )
    }
    legend.push({ swatch: 'ffl', text: 'FFL n = finished floor level vs datum (mm)' })
    if (anyStep) legend.push({ swatch: 'step', text: 'Floor-level step at doorway' })
  }

  // --- Legend (bottom-left) ---
  if (legend.length > 0) {
    const lineH = 14
    const baseY = heightPx - 6 - (legend.length - 1) * lineH
    legend.forEach((row, i) => {
      const y = baseY + i * lineH
      let mark: string
      if (row.swatch === 'hatch') {
        mark = `<rect x="4" y="${n(y - 8)}" width="12" height="10" fill="url(#wp-hatch)" stroke="${WP_COLOR}" stroke-width="0.8"/>`
      } else if (row.swatch === 'step') {
        mark = `<path d="M 10 ${n(y - 8)} L 16 ${n(y - 3)} L 10 ${n(y + 2)} L 4 ${n(y - 3)} Z" fill="${FFL_COLOR}"/>`
      } else {
        mark = `<rect x="4" y="${n(y - 8)}" width="12" height="10" rx="2" fill="#ffffff" stroke="${FFL_COLOR}" stroke-width="0.8"/>`
      }
      const color = row.swatch === 'hatch' ? WP_COLOR : FFL_COLOR
      parts.push(
        `${mark}<text x="20" y="${n(y)}" font-size="${FONT - 2}" fill="${color}">${esc(row.text)}</text>`,
      )
    })
  }

  return `<g class="wp-levels-overlay">${parts.join('')}</g>`
}

/** SVG for a single dimension: the line, two end ticks, and a centred label. */
function dimensionMarkup(
  d: Dimension,
  px: (x: number) => number,
  py: (z: number) => number,
  palette: DimensionSvgPalette,
): string {
  const ax = px(d.x1)
  const ay = py(d.y1)
  const bx = px(d.x2)
  const by = py(d.y2)

  // Unit perpendicular (in pixel space) for the tick marks.
  const dx = bx - ax
  const dy = by - ay
  const len = Math.hypot(dx, dy) || 1
  const nx = -dy / len
  const ny = dx / len

  const tick = (cx: number, cy: number) =>
    `<line x1="${n(cx - nx * TICK)}" y1="${n(cy - ny * TICK)}" x2="${n(
      cx + nx * TICK,
    )}" y2="${n(cy + ny * TICK)}" stroke="${esc(palette.ink)}" stroke-width="1" />`

  const midX = (ax + bx) / 2
  const midY = (ay + by) / 2
  // Nudge the label off the line along the perpendicular so it reads clearly.
  const lx = midX + nx * (FONT * 0.7)
  const ly = midY + ny * (FONT * 0.7)

  return [
    `<line x1="${n(ax)}" y1="${n(ay)}" x2="${n(bx)}" y2="${n(
      by,
    )}" stroke="${esc(palette.ink)}" stroke-width="1" />`,
    tick(ax, ay),
    tick(bx, by),
    `<text x="${n(lx)}" y="${n(ly)}" font-size="${FONT}" text-anchor="middle" ` +
      `dominant-baseline="middle" fill="${esc(palette.ink)}">${esc(d.label)}</text>`,
  ].join('\n')
}
