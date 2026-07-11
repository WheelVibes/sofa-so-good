/**
 * Demolition / hacking plan SVG renderer (feature F30).
 *
 * Pure `WallDiff → SVG string` step: draws kept walls solid, demolished walls
 * dashed (the "hacking" colour), and added walls bold (the "new" colour), plus
 * a small legend. The viewBox is computed from the bounds of ALL walls across
 * the diff. All colours come from the injected palette — nothing is hardcoded.
 *
 * Self-contained: imports only `./demolitionPlan` and `./types`.
 */

import type { WallDiff } from './demolitionPlan'
import type { PlanWall } from './types'

interface DemolitionPalette {
  /** Kept walls (unchanged). */
  kept: string
  /** Demolished / hacked walls. */
  demolished: string
  /** Newly built walls. */
  added: string
  /** Strong foreground for the legend text + swatch outlines. */
  ink: string
}

export interface DemolitionSvgOpts {
  palette: DemolitionPalette
  /** Target SVG width in pixels (height derives from plan aspect). Default 800. */
  widthPx?: number
}

/** Padding (metres) around the wall bounds. */
const PAD = 0.5
/** Legend layout, in pixels. */
const LEGEND_PAD = 12
const LEGEND_ROW = 20
const LEGEND_SWATCH = 22
const FONT = 12

/** Minimal XML-attribute escaping for injected strings. */
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

interface Bounds {
  minX: number
  minZ: number
  maxX: number
  maxZ: number
}

/** Bounding box of every wall in the diff (full min/max, not just max). */
function wallBounds(walls: PlanWall[]): Bounds {
  let minX = Number.POSITIVE_INFINITY
  let minZ = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxZ = Number.NEGATIVE_INFINITY
  for (const w of walls) {
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

/**
 * Render a hacking plan as a standalone SVG string. Plan metres map to pixels
 * by a uniform scale; +Z (south) maps to +Y (down) in SVG.
 */
export function demolitionSvg(diff: WallDiff, opts: DemolitionSvgOpts): string {
  const { palette } = opts
  const widthPx = opts.widthPx && opts.widthPx > 0 ? opts.widthPx : 800

  const all = [...diff.kept, ...diff.demolished, ...diff.added]
  const b = wallBounds(all)

  const worldW = Math.max(b.maxX - b.minX + PAD * 2, 1)
  const worldH = Math.max(b.maxZ - b.minZ + PAD * 2, 1)
  const scale = widthPx / worldW
  const planH = worldH * scale

  // Metre→pixel transform (origin shifted to (minX,minZ) less padding).
  const px = (x: number) => (x - b.minX + PAD) * scale
  const py = (z: number) => (z - b.minZ + PAD) * scale

  const legendH = LEGEND_PAD * 2 + LEGEND_ROW * 3
  const heightPx = planH + legendH

  const parts: string[] = []
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${n(widthPx)}" height="${n(
      heightPx,
    )}" viewBox="0 0 ${n(widthPx)} ${n(heightPx)}">`,
  )

  // Kept walls (solid, base weight).
  for (const w of diff.kept) {
    parts.push(wallLine(w, px, py, palette.kept, 2, undefined))
  }
  // Demolished walls (dashed, the hacking colour).
  for (const w of diff.demolished) {
    parts.push(wallLine(w, px, py, palette.demolished, 2, '6 4'))
  }
  // Added walls (bold, the new colour).
  for (const w of diff.added) {
    parts.push(wallLine(w, px, py, palette.added, 4, undefined))
  }

  parts.push(legend(diff, planH, palette))

  parts.push('</svg>')
  return parts.join('\n')
}

function wallLine(
  w: PlanWall,
  px: (x: number) => number,
  py: (z: number) => number,
  stroke: string,
  width: number,
  dash: string | undefined,
): string {
  const dashAttr = dash ? ` stroke-dasharray="${dash}"` : ''
  return (
    `<line x1="${n(px(w.start[0]))}" y1="${n(py(w.start[1]))}" x2="${n(px(w.end[0]))}" ` +
    `y2="${n(py(w.end[1]))}" stroke="${esc(stroke)}" stroke-width="${width}"${dashAttr} ` +
    'stroke-linecap="round" />'
  )
}

/** A 3-row legend (kept / demolished / added) with counts + totals. */
function legend(diff: WallDiff, planH: number, palette: DemolitionPalette): string {
  const rows: Array<{ color: string; dash: string | undefined; width: number; label: string }> = [
    { color: palette.kept, dash: undefined, width: 2, label: `Kept (${diff.kept.length})` },
    {
      color: palette.demolished,
      dash: '6 4',
      width: 2,
      label: `Demolished (${diff.demolished.length}) — ${n(diff.hackedLengthM)} m`,
    },
    {
      color: palette.added,
      dash: undefined,
      width: 4,
      label: `Added (${diff.added.length}) — ${n(diff.addedLengthM)} m`,
    },
  ]

  const out: string[] = ['<g class="legend">']
  let y = planH + LEGEND_PAD + LEGEND_ROW / 2
  for (const r of rows) {
    const dashAttr = r.dash ? ` stroke-dasharray="${r.dash}"` : ''
    out.push(
      `<line x1="${LEGEND_PAD}" y1="${n(y)}" x2="${LEGEND_PAD + LEGEND_SWATCH}" y2="${n(y)}" ` +
        `stroke="${esc(r.color)}" stroke-width="${r.width}"${dashAttr} stroke-linecap="round" />`,
    )
    out.push(
      `<text x="${LEGEND_PAD + LEGEND_SWATCH + 8}" y="${n(y)}" font-size="${FONT}" ` +
        `dominant-baseline="middle" fill="${esc(palette.ink)}">${esc(r.label)}</text>`,
    )
    y += LEGEND_ROW
  }
  out.push('</g>')
  return out.join('\n')
}
