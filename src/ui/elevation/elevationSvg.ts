/**
 * Render a {@link WallElevation} to a standalone SVG string (world metres as SVG
 * units, floor at the bottom). Pure + palette-parameterised so the in-app panel
 * (CSS-token colours) and the printable report (print hexes) share one renderer.
 */
import type { WallElevation } from '../../elevation/projectElevation'
import { formatLength, type UnitSystem } from '../../utils/measurement'

export interface ElevationPalette {
  /** Wall fill. */
  bg: string
  /** Wall + item outline. */
  stroke: string
  /** Window pane / door cut-out. */
  opening: string
  /** Furniture silhouette fill. */
  item: string
  /** Label text. */
  text: string
}

const esc = (s: string) =>
  s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c] ?? c)

const f = (n: number) => n.toFixed(3)

export interface ElevationSvgOptions {
  palette: ElevationPalette
  /** Draw furniture labels (off for tiny thumbnails). Default true. */
  labels?: boolean
  /** Units for any text (currently item labels only carry names; reserved). */
  units?: UnitSystem
  /** Outer margin in metres around the wall rectangle. Default 0.35. */
  margin?: number
}

/**
 * Build the `<svg>…</svg>` markup for one wall elevation. The drawing is the wall
 * rectangle (length × height) with openings cut/marked and furniture silhouettes
 * standing on the floor; everything is in metres so callers size it by setting
 * width/height or letting it scale to its container via the viewBox.
 */
export function elevationSvg(el: WallElevation, opts: ElevationSvgOptions): string {
  const { palette: p, labels = true, margin = 0.35 } = opts
  const { length: L, height: H } = el
  if (L <= 0 || H <= 0) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1" role="img" aria-label="empty elevation"></svg>`
  }
  // SVG y grows downward; put the floor (worldY 0) at the bottom.
  const y = (worldY: number) => H - worldY
  const sw = Math.max(0.015, Math.min(L, H) * 0.006) // stroke scales with the drawing
  const parts: string[] = []

  // Wall panel + floor line.
  parts.push(
    `<rect x="0" y="0" width="${f(L)}" height="${f(H)}" fill="${p.bg}" stroke="${p.stroke}" stroke-width="${f(sw)}"/>`,
  )
  parts.push(
    `<line x1="0" y1="${f(H)}" x2="${f(L)}" y2="${f(H)}" stroke="${p.stroke}" stroke-width="${f(sw * 2)}"/>`,
  )

  // Furniture silhouettes (already sorted farthest-first).
  for (const it of el.items) {
    const w = it.x1 - it.x0
    const h = Math.min(it.height, H)
    parts.push(
      `<rect x="${f(it.x0)}" y="${f(y(h))}" width="${f(w)}" height="${f(h)}" fill="${p.item}" fill-opacity="0.85" stroke="${p.stroke}" stroke-width="${f(sw)}"/>`,
    )
    if (labels && w > 0.35) {
      // Label centred in the silhouette, scaled to fit (and never upside down).
      const fs = Math.max(0.12, Math.min(0.22, w * 0.28, h * 0.5))
      parts.push(
        `<text x="${f(it.x0 + w / 2)}" y="${f(y(h / 2))}" font-size="${f(fs)}" fill="${p.text}" text-anchor="middle" dominant-baseline="middle">${esc(it.label)}</text>`,
      )
    }
  }

  // Openings: windows draw a translucent pane, doors a cut-out from the floor.
  for (const o of el.openings) {
    const w = o.x1 - o.x0
    const oh = o.head - o.sill
    if (w <= 0 || oh <= 0) continue
    if (o.kind === 'window') {
      parts.push(
        `<rect x="${f(o.x0)}" y="${f(y(o.head))}" width="${f(w)}" height="${f(oh)}" fill="${p.opening}" fill-opacity="0.5" stroke="${p.stroke}" stroke-width="${f(sw)}"/>`,
      )
      // Mullion cross for a window read.
      parts.push(
        `<line x1="${f(o.x0 + w / 2)}" y1="${f(y(o.head))}" x2="${f(o.x0 + w / 2)}" y2="${f(y(o.sill))}" stroke="${p.stroke}" stroke-width="${f(sw)}"/>`,
        `<line x1="${f(o.x0)}" y1="${f(y((o.head + o.sill) / 2))}" x2="${f(o.x1)}" y2="${f(y((o.head + o.sill) / 2))}" stroke="${p.stroke}" stroke-width="${f(sw)}"/>`,
      )
    } else {
      // Door: a cut-out panel (bg) with a dashed head, opening to the floor.
      parts.push(
        `<rect x="${f(o.x0)}" y="${f(y(o.head))}" width="${f(w)}" height="${f(oh)}" fill="${p.bg}" stroke="${p.stroke}" stroke-width="${f(sw)}" stroke-dasharray="${f(sw * 4)} ${f(sw * 3)}"/>`,
      )
    }
  }

  const vb = `${f(-margin)} ${f(-margin)} ${f(L + 2 * margin)} ${f(H + 2 * margin)}`
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="wall elevation, ${f(L)} by ${f(H)} metres">${parts.join('')}</svg>`
}

/** Short human caption for a wall elevation (panel + report headings). */
export function elevationCaption(el: WallElevation, index: number, units: UnitSystem): string {
  const dims = `${formatLength(el.length, units)} × ${formatLength(el.height, units)}`
  const winN = el.openings.filter((o) => o.kind === 'window').length
  const doorN = el.openings.filter((o) => o.kind === 'door').length
  const bits = [dims]
  if (winN) bits.push(`${winN} window${winN > 1 ? 's' : ''}`)
  if (doorN) bits.push(`${doorN} door${doorN > 1 ? 's' : ''}`)
  if (el.items.length) bits.push(`${el.items.length} item${el.items.length > 1 ? 's' : ''}`)
  return `Wall ${index + 1} · ${bits.join(' · ')}`
}
