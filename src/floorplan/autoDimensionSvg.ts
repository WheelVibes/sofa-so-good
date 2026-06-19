/**
 * Auto-dimension SVG renderer (feature F15).
 *
 * Pure `core → SVG string` step: takes a FloorPlan, builds dimensions via the
 * self-contained core, and emits an SVG that draws the plan walls (thin) plus
 * dimension lines with tick marks and centred labels. All colours are injected
 * by the caller (palette) — nothing theme-specific is hardcoded.
 *
 * Self-contained: imports only `./autoDimension` and `./types`.
 */

import type { UnitSystem } from '../utils/measurement'
import { buildDimensions, type Dimension } from './autoDimension'
import { type FloorPlan, planBounds } from './types'

export interface DimensionSvgPalette {
  /** Strong foreground (dimension lines, ticks, labels). */
  ink: string
  /** Muted foreground (plan walls). */
  faint: string
}

export interface DimensionSvgOpts {
  palette: DimensionSvgPalette
  /** Target SVG width in pixels (height derives from plan aspect). Default 800. */
  widthPx?: number
  /** Display unit system for dimension labels. Default 'metric'. */
  units?: UnitSystem
}

/** Padding (metres) around the plan bounds so offset dimension lines fit. */
const PAD = 1.0
/** Tick mark half-length, in pixels. */
const TICK = 5
/** Label font size, in pixels. */
const FONT = 12

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
  const dims = buildDimensions(plan, opts.units ?? 'metric')

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
  const worldW = Math.max(maxX + PAD * 2, 1)
  const worldH = Math.max(maxZ + PAD * 2, 1)
  const scale = widthPx / worldW
  const heightPx = worldH * scale

  // Metre→pixel transform (shift by PAD so the negative-offset lines stay in view).
  const px = (x: number) => (x + PAD) * scale
  const py = (z: number) => (z + PAD) * scale

  const walls = Array.isArray(plan?.walls) ? plan.walls : []

  const parts: string[] = []
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${n(widthPx)}" height="${n(
      heightPx,
    )}" viewBox="0 0 ${n(widthPx)} ${n(heightPx)}">`,
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

  parts.push('</svg>')
  return parts.join('\n')
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
