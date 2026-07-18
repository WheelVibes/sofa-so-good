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

import { layoutMepLabels } from './mepLabelLayout'
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
  /** When set (mm printed per metre of real-world extent, from
   *  `drawingScale.ts:pickDrawingScale`), sizes the returned `<svg>` with
   *  explicit `width`/`height` in mm instead of pixels — print-true (TODO G2). */
  printMmPerM?: number
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

/** Short marking text drawn inside a symbol circle. Exported (MEP layer, G1
 *  PR3) so the 2D editor's `MepLayer` renders the same glyph vocabulary as
 *  the exported sheet — one symbol set, not two. */
export const PLUMB_SYM_TEXT: Record<PlumbingKind, string> = {
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

  const anyHeights = points.some((p) => typeof p.mountHeightMm === 'number')
  const legendRows = Math.max(schedule.length, 1) + (anyHeights ? 1 : 0)
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

  for (const w of drawn) {
    parts.push(
      `<line x1="${n(px(w.start[0]))}" y1="${n(py(w.start[1]))}" x2="${n(px(w.end[0]))}" ` +
        `y2="${n(py(w.end[1]))}" stroke="${esc(palette.wall)}" stroke-width="1.5" ` +
        'stroke-linecap="round" />',
    )
  }

  // Points whose circles collide (e.g. a WC's soil-pipe + water-point a few cm
  // apart) have BOTH their circle centres nudged apart (with a tick + leader
  // back to the true spot) AND their labels fanned out relative to the
  // nudged circles — see `mepLabelLayout.ts` (H-D1 + the SG-contractor
  // re-review's circle-overlap follow-up).
  const labelLayout = layoutMepLabels(
    points.map((p, i) => ({ id: String(i), cx: px(p.x), cy: py(p.z) })),
    SYM_R + 2,
  )
  points.forEach((p, i) => {
    const placement = labelLayout.find((l) => l.id === String(i))!
    parts.push(
      symbol(p.kind, placement.cx, placement.cy, palette, p.label, p.mountHeightMm, placement, {
        trueCx: placement.trueCx,
        trueCy: placement.trueCy,
        hasCircleNudge: placement.hasCircleNudge,
      }),
    )
  })

  // Legend / schedule — an extra "heights in mm AFFL" line when any point on
  // this sheet carries a persisted mount height (MEP layer, G1 PR5).
  parts.push(legend(schedule, planH, palette, anyHeights))
  parts.push('</svg>')
  return parts.join('\n')
}

/** A single plumbing symbol glyph centred at (cx,cy) — the circle's RENDERED
 *  position, already nudged off `truePos` when it collided with another
 *  circle in its cluster (`layoutMepLabels`'s circle-nudge pass, SG-
 *  contractor re-review follow-up to H-D1). When `truePos` is given, a small
 *  × tick is drawn at the true position + a thin solid leader from it to the
 *  rendered circle, so the actual location stays readable (drafting
 *  convention: symbol displaced for clarity, tick marks the real spot). When
 *  `labelPlacement` carries a nudged label position (`hasLeader`), the side
 *  label is drawn there instead of the default `(cx + SYM_R + 2, cy)`, with a
 *  short dashed leader back to the (possibly nudged) circle centre. */
function symbol(
  kind: PlumbingKind,
  cx: number,
  cy: number,
  palette: PlumbingPalette,
  label: string | undefined,
  mountHeightMm?: number,
  labelPlacement?: { labelX: number; labelY: number; hasLeader: boolean },
  truePos?: { trueCx: number; trueCy: number; hasCircleNudge: boolean },
): string {
  const out: string[] = [`<g class="plumb-symbol" data-kind="${esc(kind)}">`]
  if (truePos?.hasCircleNudge) {
    const { trueCx, trueCy } = truePos
    const tick = SYM_R * 0.3
    out.push(
      `<line x1="${n(trueCx)}" y1="${n(trueCy)}" x2="${n(cx)}" y2="${n(cy)}" ` +
        `stroke="${esc(palette.symbol)}" stroke-width="0.75" />`,
      `<line x1="${n(trueCx - tick)}" y1="${n(trueCy - tick)}" x2="${n(trueCx + tick)}" y2="${n(trueCy + tick)}" ` +
        `stroke="${esc(palette.symbol)}" stroke-width="1" />`,
      `<line x1="${n(trueCx - tick)}" y1="${n(trueCy + tick)}" x2="${n(trueCx + tick)}" y2="${n(trueCy - tick)}" ` +
        `stroke="${esc(palette.symbol)}" stroke-width="1" />`,
    )
  }
  out.push(
    `<circle cx="${n(cx)}" cy="${n(cy)}" r="${SYM_R}" fill="none" ` +
      `stroke="${esc(palette.symbol)}" stroke-width="1.5" />`,
  )
  out.push(
    `<text x="${n(cx)}" y="${n(cy)}" font-size="${SYM_FONT}" text-anchor="middle" ` +
      `dominant-baseline="central" fill="${esc(palette.ink)}">${esc(PLUMB_SYM_TEXT[kind])}</text>`,
  )
  // "@1050" mount-height suffix beside the label (MEP layer, G1 PR5) — omitted
  // for heuristic-derived points (no persisted `mountHeightMm`).
  const heightSuffix = typeof mountHeightMm === 'number' ? `@${Math.round(mountHeightMm)}` : ''
  const sideText = [label, heightSuffix].filter(Boolean).join(' ')
  if (sideText) {
    const labelX = labelPlacement?.labelX ?? cx + SYM_R + 2
    const labelY = labelPlacement?.labelY ?? cy
    if (labelPlacement?.hasLeader) {
      out.push(
        `<line x1="${n(cx)}" y1="${n(cy)}" x2="${n(labelX)}" y2="${n(labelY)}" ` +
          `stroke="${esc(palette.symbol)}" stroke-width="0.5" stroke-dasharray="2 1.5" />`,
      )
    }
    out.push(
      `<text x="${n(labelX)}" y="${n(labelY)}" font-size="${SYM_FONT}" ` +
        `dominant-baseline="central" fill="${esc(palette.ink)}">${esc(sideText)}</text>`,
    )
  }
  out.push('</g>')
  return out.join('\n')
}

/** Schedule legend: one row per kind, with a miniature symbol + count + label,
 *  plus (when any point on the sheet carries a persisted mount height) a
 *  trailing "Heights in mm AFFL" line explaining the `@mm` suffix. */
function legend(
  schedule: PlumbingPlan['schedule'],
  planH: number,
  palette: PlumbingPalette,
  anyHeights = false,
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
  if (anyHeights) {
    out.push(
      `<text x="${LEGEND_PAD}" y="${n(y)}" font-size="${SYM_FONT}" font-style="italic" ` +
        `dominant-baseline="middle" fill="${esc(palette.ink)}">Heights in mm AFFL</text>`,
    )
  }
  out.push('</g>')
  return out.join('\n')
}
