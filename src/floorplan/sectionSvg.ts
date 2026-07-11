/**
 * Cross-section SVG renderer (feature F32).
 *
 * Pure `Section → SVG string` step: draws the floor line, ceiling lines,
 * furniture silhouettes standing in the cut's room band (behind the cut), the
 * cut wall columns (filled rectangles), opening gaps (knocked out of the wall
 * fill), room labels, and a height dimension on the side. The horizontal axis
 * is the section's "along" axis (left→right), the vertical axis is height
 * (floor at the bottom, ceiling at the top). All colours come from the injected
 * palette — nothing is hardcoded.
 *
 * Self-contained: imports only `./section` (type-only) — no `./types` needed.
 */

import type { Section } from './section'

interface SectionPalette {
  /** Cut wall column fill. */
  wall: string
  /** Floor line / floor segments. */
  floor: string
  /** Ceiling line. */
  ceil: string
  /** Opening gap outline. */
  opening: string
  /** Strong foreground — labels, dimension, axis. */
  ink: string
  /** Furniture silhouette fill (behind the cut). Defaults to `wall` when unset. */
  item?: string
}

export interface SectionSvgOpts {
  palette: SectionPalette
  /** Target SVG width in pixels (height derives from the section). Default 800. */
  widthPx?: number
}

/** Pixel padding around the drawing (room for the dimension + labels). */
const PAD_L = 56
const PAD_R = 24
const PAD_T = 24
const PAD_B = 40
const FONT = 12

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
 * Render a cross-section as a standalone SVG string. Section metres map to
 * pixels by a uniform scale; height grows upward (floor at the bottom).
 */
export function sectionSvg(section: Section, opts: SectionSvgOpts): string {
  const { palette } = opts
  const widthPx = opts.widthPx && opts.widthPx > 0 ? opts.widthPx : 800

  // World span: prefer the actual along-range of content, fall back to length.
  const along = alongRange(section)
  const worldW = Math.max(along.max - along.min, section.length, 0.001)
  const worldH = Math.max(section.height, 0.001)

  const drawW = Math.max(widthPx - PAD_L - PAD_R, 1)
  const scale = drawW / worldW
  const drawH = worldH * scale
  const heightPx = drawH + PAD_T + PAD_B

  // metre → pixel. X: along-axis from its min. Y: height flipped (floor low).
  const x = (a: number) => PAD_L + (a - along.min) * scale
  const y = (h: number) => PAD_T + (worldH - h) * scale

  const floorPx = y(section.floorY)
  const parts: string[] = []
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${n(widthPx)}" height="${n(
      heightPx,
    )}" viewBox="0 0 ${n(widthPx)} ${n(heightPx)}">`,
  )

  // --- Floor line + room floor segments -----------------------------------
  parts.push('<g class="floor">')
  parts.push(
    `<line x1="${n(x(along.min))}" y1="${n(floorPx)}" x2="${n(x(along.max))}" y2="${n(
      floorPx,
    )}" stroke="${esc(palette.floor)}" stroke-width="2" />`,
  )
  for (const r of section.rooms) {
    parts.push(
      `<line x1="${n(x(r.start))}" y1="${n(floorPx + 3)}" x2="${n(x(r.end))}" y2="${n(
        floorPx + 3,
      )}" stroke="${esc(palette.floor)}" stroke-width="3" />`,
    )
  }
  parts.push('</g>')

  // --- Ceiling lines -------------------------------------------------------
  parts.push('<g class="ceiling">')
  if (section.ceil.length === 0) {
    const cy = y(section.height)
    parts.push(
      `<line x1="${n(x(along.min))}" y1="${n(cy)}" x2="${n(x(along.max))}" y2="${n(
        cy,
      )}" stroke="${esc(palette.ceil)}" stroke-width="2" />`,
    )
  } else {
    for (const c of section.ceil) {
      const cy = y(c.y)
      parts.push(
        `<line x1="${n(x(c.start))}" y1="${n(cy)}" x2="${n(x(c.end))}" y2="${n(
          cy,
        )}" stroke="${esc(palette.ceil)}" stroke-width="2" />`,
      )
    }
  }
  parts.push('</g>')

  // --- Furniture silhouettes (behind the cut, drawn before the walls) ------
  if (section.items.length > 0) {
    const itemFill = palette.item ?? palette.wall
    parts.push('<g class="items">')
    for (const it of section.items) {
      const ix = x(it.start)
      const iw = Math.max((it.end - it.start) * scale, 1)
      const ih = Math.min(it.height, section.height)
      const iy = y(ih)
      const ihPx = Math.max(ih * scale, 1)
      parts.push(
        `<rect x="${n(ix)}" y="${n(iy)}" width="${n(iw)}" height="${n(ihPx)}" fill="${esc(
          itemFill,
        )}" fill-opacity="0.55" stroke="${esc(palette.ink)}" stroke-width="0.75" />`,
      )
      if (it.label && it.end - it.start > 0.35) {
        parts.push(
          `<text x="${n(ix + iw / 2)}" y="${n(iy + ihPx / 2)}" font-size="${FONT - 1}" ` +
            `text-anchor="middle" dominant-baseline="middle" fill="${esc(palette.ink)}">${esc(
              it.label,
            )}</text>`,
        )
      }
    }
    parts.push('</g>')
  }

  // --- Cut wall columns ----------------------------------------------------
  parts.push('<g class="walls">')
  for (const w of section.walls) {
    const wx = x(w.pos - w.thickness / 2)
    const ww = Math.max(w.thickness * scale, 1)
    const wy = y(w.top)
    const wh = Math.max((w.top - w.base) * scale, 1)
    parts.push(
      `<rect x="${n(wx)}" y="${n(wy)}" width="${n(ww)}" height="${n(wh)}" fill="${esc(
        palette.wall,
      )}" stroke="${esc(palette.ink)}" stroke-width="1" />`,
    )
  }
  parts.push('</g>')

  // --- Opening gaps (outlined holes punched in the wall fill) --------------
  parts.push('<g class="openings">')
  for (const o of section.openings) {
    const ox = x(o.pos - o.width / 2)
    const ow = Math.max(o.width * scale, 1)
    const oTop = y(o.head)
    const oh = Math.max((o.head - o.sill) * scale, 1)
    parts.push(
      `<rect x="${n(ox)}" y="${n(oTop)}" width="${n(ow)}" height="${n(oh)}" fill="none" ` +
        `stroke="${esc(palette.opening)}" stroke-width="1.5" stroke-dasharray="4 3" />`,
    )
  }
  parts.push('</g>')

  // --- Room labels ---------------------------------------------------------
  parts.push('<g class="labels">')
  for (const r of section.rooms) {
    if (!r.name) continue
    const cx = x((r.start + r.end) / 2)
    parts.push(
      `<text x="${n(cx)}" y="${n(floorPx + FONT + 6)}" font-size="${FONT}" ` +
        `text-anchor="middle" fill="${esc(palette.ink)}">${esc(r.name)}</text>`,
    )
  }
  parts.push('</g>')

  // --- Height dimension (left side) ----------------------------------------
  const dimX = PAD_L - 16
  const topPx = y(section.height)
  parts.push('<g class="dimension">')
  parts.push(
    `<line x1="${n(dimX)}" y1="${n(topPx)}" x2="${n(dimX)}" y2="${n(floorPx)}" stroke="${esc(
      palette.ink,
    )}" stroke-width="1" />`,
  )
  parts.push(
    `<text x="${n(dimX - 4)}" y="${n((topPx + floorPx) / 2)}" font-size="${FONT}" ` +
      `text-anchor="end" dominant-baseline="middle" fill="${esc(palette.ink)}">${n(
        section.height,
      )} m</text>`,
  )
  parts.push('</g>')

  parts.push('</svg>')
  return parts.join('\n')
}

/** Along-axis pixel range of all content (walls + room spans), with a fallback. */
function alongRange(section: Section): { min: number; max: number } {
  let min = Number.POSITIVE_INFINITY
  let max = Number.NEGATIVE_INFINITY
  const note = (v: number) => {
    if (v < min) min = v
    if (v > max) max = v
  }
  for (const w of section.walls) {
    note(w.pos - w.thickness / 2)
    note(w.pos + w.thickness / 2)
  }
  for (const r of section.rooms) {
    note(r.start)
    note(r.end)
  }
  for (const it of section.items) {
    note(it.start)
    note(it.end)
  }
  if (!Number.isFinite(min) || !Number.isFinite(max) || max - min < 1e-6) {
    return { min: 0, max: Math.max(section.length, 0.001) }
  }
  return { min, max }
}
