/**
 * Plumbing plan SVG renderer (PARITY-PLUMBING — mirrors `electricalPlanSvg.ts`).
 *
 * Pure `PlumbingPlan → SVG string` step: draws the plan walls (thin) plus a
 * plumbing SYMBOL at each point, with a small legend / schedule below. The
 * viewBox is computed from the bounds of ALL walls. Every colour comes from the
 * injected palette; free-text labels are XML-escaped.
 *
 * Symbol glyphs (each a circle + short marking):
 *   water-point  → "W"   drainage → "D"   floor-trap → "FT"
 *   soil-pipe    → "SP"  water-heater → "WH"
 *
 * Self-contained: imports only `./plumbingPlan` and `./types`.
 */

import type { PlumbingKind, PlumbingPlan } from './plumbingPlan'
import { plumbingKindLabel } from './plumbingPlan'
import type { FloorPlan, PlanWall } from './types'
import { wallLength } from './types'

/** Palette injected by the caller (resolved theme tokens). */
interface PlumbingPalette {
  /** Plan wall stroke. */
  wall: string
  /** Foreground for legend text + glyph markings. */
  ink: string
  /** Symbol circle stroke / accent. */
  symbol: string
}

export interface PlumbingSvgOpts {
  palette: PlumbingPalette
  /** Target SVG width in pixels (height derives from plan aspect). Default 800. */
  widthPx?: number
}

const PAD = 0.5
const SYM_R = 9
const LEGEND_PAD = 12
const LEGEND_ROW = 22
const FONT = 12
const SYM_FONT = 8

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

/** Short marking text drawn inside a symbol circle. */
const SYM_TEXT: Record<PlumbingKind, string> = {
  'water-point': 'W',
  drainage: 'D',
  'floor-trap': 'FT',
  'soil-pipe': 'SP',
  'water-heater': 'WH',
}

/**
 * Render the plumbing plan as a standalone SVG string. Plan metres map to pixels
 * by a uniform scale; +Z (south) maps to +Y (down) in SVG.
 */
export function plumbingSvg(
  plan: FloorPlan,
  plumbing: PlumbingPlan,
  opts: PlumbingSvgOpts,
): string {
  const { palette } = opts
  const widthPx = opts.widthPx && opts.widthPx > 0 ? opts.widthPx : 800

  const walls = plan && Array.isArray(plan.walls) ? plan.walls : []
  const drawn = walls.filter((w) => wallLength(w) > 0)
  const points = Array.isArray(plumbing?.points) ? plumbing.points : []
  const schedule = Array.isArray(plumbing?.schedule) ? plumbing.schedule : []

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
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${n(widthPx)}" height="${n(
      heightPx,
    )}" viewBox="0 0 ${n(widthPx)} ${n(heightPx)}">`,
  )

  for (const w of drawn) {
    parts.push(
      `<line x1="${n(px(w.start[0]))}" y1="${n(py(w.start[1]))}" x2="${n(px(w.end[0]))}" ` +
        `y2="${n(py(w.end[1]))}" stroke="${esc(palette.wall)}" stroke-width="1.5" ` +
        'stroke-linecap="round" />',
    )
  }

  for (const p of points) {
    parts.push(symbol(p.kind, px(p.x), py(p.z), palette, p.label))
  }

  parts.push(legend(schedule, planH, palette))
  parts.push('</svg>')
  return parts.join('\n')
}

/** A single plumbing symbol glyph centred at (cx,cy). */
function symbol(
  kind: PlumbingKind,
  cx: number,
  cy: number,
  palette: PlumbingPalette,
  label: string | undefined,
): string {
  const out: string[] = [`<g class="plumb-symbol" data-kind="${esc(kind)}">`]
  out.push(
    `<circle cx="${n(cx)}" cy="${n(cy)}" r="${SYM_R}" fill="none" ` +
      `stroke="${esc(palette.symbol)}" stroke-width="1.5" />`,
  )
  out.push(
    `<text x="${n(cx)}" y="${n(cy)}" font-size="${SYM_FONT}" text-anchor="middle" ` +
      `dominant-baseline="central" fill="${esc(palette.ink)}">${esc(SYM_TEXT[kind])}</text>`,
  )
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
  schedule: PlumbingPlan['schedule'],
  planH: number,
  palette: PlumbingPalette,
): string {
  const out: string[] = ['<g class="legend">']
  let y = planH + LEGEND_PAD + LEGEND_ROW / 2
  if (schedule.length === 0) {
    out.push(
      `<text x="${LEGEND_PAD}" y="${n(y)}" font-size="${FONT}" dominant-baseline="middle" ` +
        `fill="${esc(palette.ink)}">No plumbing points</text>`,
    )
  }
  for (const row of schedule) {
    const cx = LEGEND_PAD + SYM_R
    out.push(symbol(row.kind, cx, y, palette, undefined))
    const text = `${plumbingKindLabel(row.kind)} × ${row.count}`
    out.push(
      `<text x="${LEGEND_PAD + SYM_R * 2 + 8}" y="${n(y)}" font-size="${FONT}" ` +
        `dominant-baseline="middle" fill="${esc(palette.ink)}">${esc(text)}</text>`,
    )
    y += LEGEND_ROW
  }
  out.push('</g>')
  return out.join('\n')
}
