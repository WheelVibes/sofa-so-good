/**
 * Render a {@link WallElevation} to a standalone SVG string (world metres as SVG
 * units, floor at the bottom). Pure + palette-parameterised so the in-app panel
 * (CSS-token colours) and the printable report (print hexes) share one renderer.
 * Used by both `ElevationPanel` and the report's "Wall elevations" section.
 */
import {
  approxTextWidth,
  staggerDimensionRows,
  staggerMountHeightColumns,
} from '../../elevation/dimensionLayout'
import type { WallElevation } from '../../elevation/projectElevation'
import { formatDrawingLength, formatLength, type UnitSystem } from '../../utils/measurement'

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

/** Average glyph advance as a fraction of font size, for fitting a label INSIDE a
 *  silhouette. Deliberately less conservative than `approxTextWidth`'s 0.62,
 *  which exists to reserve space between dimension labels — using that here
 *  rejected names that fit comfortably (a 7-char "Cabinet" in a 1.0m item). */
const LABEL_CHAR_RATIO = 0.52

// Escape for BOTH text and attribute contexts (these SVGs render via
// dangerouslySetInnerHTML in-app) — quotes too, so a user string can never break
// out of an attribute if a future edit places one there.
const esc = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c,
  )

const f = (n: number) => n.toFixed(3)

/** Fraction of box A's area covered by its intersection with box B (0 when
 *  they don't overlap at all). Used to detect a legacy item placement that
 *  now sits substantially inside an opening's box. */
function openingOverlapFraction(
  ax0: number,
  ax1: number,
  ay0: number,
  ay1: number,
  bx0: number,
  bx1: number,
  by0: number,
  by1: number,
): number {
  const iw = Math.max(0, Math.min(ax1, bx1) - Math.max(ax0, bx0))
  const ih = Math.max(0, Math.min(ay1, by1) - Math.max(ay0, by0))
  const areaA = Math.max(1e-9, (ax1 - ax0) * (ay1 - ay0))
  return (iw * ih) / areaA
}

export interface ElevationSvgOptions {
  palette: ElevationPalette
  /** Draw furniture labels (off for tiny thumbnails). Default true. */
  labels?: boolean
  /** Units for any text (currently item labels only carry names; reserved). */
  units?: UnitSystem
  /** Outer margin in metres around the wall rectangle. Default 0.35. */
  margin?: number
  /** Draw dimension lines (overall width/height, opening sill heights, and
   *  mounted-item AFFL heights — H3). Default true. */
  dimensions?: boolean
  /** When set (mm printed per metre of real-world extent, from
   *  `floorplan/drawingScale.ts:pickDrawingScale`), sizes the returned `<svg>`
   *  with explicit `width`/`height` in mm — print-true (TODO G2) — instead of
   *  leaving it unsized to stretch to its container. */
  printMmPerM?: number
}

/**
 * Build the `<svg>…</svg>` markup for one wall elevation. The drawing is the wall
 * rectangle (length × height) with openings cut/marked and furniture silhouettes
 * standing on the floor; everything is in metres so callers size it by setting
 * width/height or letting it scale to its container via the viewBox.
 */
export function elevationSvg(el: WallElevation, opts: ElevationSvgOptions): string {
  const {
    palette: p,
    labels = true,
    margin = 0.35,
    units = 'metric',
    dimensions = true,
    printMmPerM,
  } = opts
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
    // Defensive handling for a corrupt/overlapping legacy placement (an item
    // whose stored geometry no longer makes sense against its wall — e.g. it
    // now sits astride a door/window it predates): when the item's own box
    // overlaps an opening's box by more than 60% of the item's area, render
    // it semi-transparent so the opening cut-out/pane stays readable through
    // it, rather than the two silhouettes muddling into an illegible overlap.
    const overlapsOpening = el.openings.some(
      (o) => openingOverlapFraction(it.x0, it.x1, 0, h, o.x0, o.x1, o.sill, o.head) > 0.6,
    )
    const itemOpacity = overlapsOpening ? 0.3 : 0.85
    parts.push(
      `<rect x="${f(it.x0)}" y="${f(y(h))}" width="${f(w)}" height="${f(h)}" fill="${p.item}" fill-opacity="${itemOpacity}" stroke="${p.stroke}" stroke-width="${f(sw)}"/>`,
    )
    if (labels && w > 0.35) {
      // Label centred in the silhouette, scaled to fit (and never upside down).
      const fs = Math.max(0.12, Math.min(0.22, w * 0.28, h * 0.5))
      // ...clipped to the silhouette. The font size has a 0.12 floor and nothing
      // measured the text against the box, so a long name on a small piece
      // ("Three cushions" ≈ 0.9m of text inside a 0.5m item) spilled across its
      // neighbours and the rotated AFFL dimension labels — the elevation, which
      // is a deliverable drawing, came out illegible (Chrome audit 2026-08).
      // Truncating rather than dropping keeps every piece identified; the full
      // name is still in the item schedule, and the width dimension still sits in
      // the staggered row below.
      const maxChars = Math.floor((w * 0.95) / (fs * LABEL_CHAR_RATIO))
      const label =
        it.label.length > maxChars ? `${it.label.slice(0, Math.max(1, maxChars - 1))}…` : it.label
      if (maxChars >= 3 && fs <= h * 0.95) {
        parts.push(
          `<text x="${f(it.x0 + w / 2)}" y="${f(y(h / 2))}" font-size="${f(fs)}" fill="${p.text}" text-anchor="middle" dominant-baseline="middle">${esc(label)}</text>`,
        )
      }
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
      // Door: a leaf panel (frame + a thin inset reveal + a handle) so it reads
      // as a door in elevation rather than a blank cut-out.
      const inset = Math.min(w, oh) * 0.08
      // Hinge side ('start' = the x0 / wall-start jamb, the projection default).
      const hingeAtStart = (o.hinge ?? 'start') === 'start'
      const xHinge = hingeAtStart ? o.x0 : o.x1
      const xFree = hingeAtStart ? o.x1 : o.x0
      // Handle sits on the free (latch) jamb — opposite the hinge.
      const xHandle = hingeAtStart ? o.x1 - inset * 1.6 : o.x0 + inset * 1.6
      parts.push(
        `<rect x="${f(o.x0)}" y="${f(y(o.head))}" width="${f(w)}" height="${f(oh)}" fill="${p.bg}" stroke="${p.stroke}" stroke-width="${f(sw)}"/>`,
        `<rect x="${f(o.x0 + inset)}" y="${f(y(o.head) + inset)}" width="${f(Math.max(0, w - inset * 2))}" height="${f(Math.max(0, oh - inset * 2))}" fill="none" stroke="${p.stroke}" stroke-width="${f(sw * 0.6)}"/>`,
        // Handle: a knob dot on the latch edge at ~1 m above the floor.
        `<circle cx="${f(xHandle)}" cy="${f(y(Math.min(1.0, oh * 0.45)))}" r="${f(Math.max(0.015, sw * 1.5))}" fill="${p.stroke}"/>`,
      )
      // Swing indication — an ELEVATION concept, not the plan quarter-arc a
      // contractor flagged as unconventional here (re-review P3). The standard
      // elevation symbol is a thin dashed triangle whose APEX sits on the hinge
      // jamb (mid-height) and whose open mouth spans the free (latch) jamb top→
      // bottom — the point marks the hinge, the mouth the swing side. Drawn
      // ONLY for swinging leaves; a SLIDING door translates (no hinge) so it
      // gets none. A DOUBLE door apexes at BOTH jambs, meeting mid-leaf.
      const yTop = y(o.head)
      const yBottom = y(o.sill)
      const swing = `stroke="${p.stroke}" stroke-width="${f(sw * 0.6)}" stroke-dasharray="${f(sw * 4)} ${f(sw * 3)}" fill="none"`
      const swingTriangle = (xApex: number, xMouth: number, yMid: number) =>
        `<path d="M ${f(xMouth)} ${f(yTop)} L ${f(xApex)} ${f(yMid)} L ${f(xMouth)} ${f(yBottom)}" ${swing} data-swing="1"/>`
      if (o.style === 'sliding') {
        // Slider: no swing symbol (a horizontal slide arrow belongs on plan).
      } else if (o.style === 'double') {
        const xMid = (o.x0 + o.x1) / 2
        const yMid = (yTop + yBottom) / 2
        parts.push(swingTriangle(o.x0, xMid, yMid), swingTriangle(o.x1, xMid, yMid))
      } else {
        // Single swinging leaf (panel/flush/glazed/bifold): apex on the hinge.
        parts.push(swingTriangle(xHinge, xFree, (yTop + yBottom) / 2))
      }
    }
  }

  // Dimension lines (architectural read): overall width below, overall height at
  // the left, each opening's sill height, and each mounted item's AFFL mount
  // height (H3) — the key "how high" elevation info.
  // Extra room is reserved on the left + bottom for the dim lines + labels.
  const pad = dimensions ? 0.95 : margin
  // Grows with however many extra label rows the stagger needed (set below).
  let extraDimPad = 0
  if (dimensions) {
    const dfs = Math.max(0.13, Math.min(0.22, Math.min(L, H) * 0.06)) // dim font size
    const tick = sw * 4
    const dimLine = (
      x1: number,
      y1: number,
      x2: number,
      y2: number,
      label: string,
      vertical: boolean,
    ): void => {
      // Line + perpendicular end ticks.
      parts.push(
        `<line x1="${f(x1)}" y1="${f(y1)}" x2="${f(x2)}" y2="${f(y2)}" stroke="${p.text}" stroke-width="${f(sw * 0.8)}"/>`,
      )
      const tx = vertical ? tick : 0
      const ty = vertical ? 0 : tick
      parts.push(
        `<line x1="${f(x1 - tx)}" y1="${f(y1 - ty)}" x2="${f(x1 + tx)}" y2="${f(y1 + ty)}" stroke="${p.text}" stroke-width="${f(sw * 0.8)}"/>`,
        `<line x1="${f(x2 - tx)}" y1="${f(y2 - ty)}" x2="${f(x2 + tx)}" y2="${f(y2 + ty)}" stroke="${p.text}" stroke-width="${f(sw * 0.8)}"/>`,
      )
      const mx = (x1 + x2) / 2
      const my = (y1 + y2) / 2
      const rot = vertical ? ` transform="rotate(-90 ${f(mx)} ${f(my)})"` : ''
      const dy = vertical ? 0 : -dfs * 0.5
      parts.push(
        `<text x="${f(mx)}" y="${f(my + dy)}" font-size="${f(dfs)}" fill="${p.text}" text-anchor="middle" dominant-baseline="${vertical ? 'middle' : 'auto'}"${rot}>${esc(label)}</text>`,
      )
    }
    // Per-item width dimensions, in a row just below the floor (the cabinet/
    // unit widths installers need). Skip narrow pieces to avoid clutter.
    // Adjacent narrow items collide label-on-label, so labels stagger into
    // extra rows (pure dimensionLayout.ts) — drafting-style de-overlap (EL5).
    const dimItems = el.items.filter((it) => it.x1 - it.x0 >= 0.3)
    const rows = staggerDimensionRows(
      dimItems.map((it) => ({
        center: (it.x0 + it.x1) / 2,
        width: approxTextWidth(formatDrawingLength(it.x1 - it.x0, units), dfs),
      })),
    )
    const maxRow = rows.reduce((m, r) => Math.max(m, r), 0)
    extraDimPad = maxRow * (dfs + 0.12)
    dimItems.forEach((it, i) => {
      const yRow = H + 0.22 + rows[i] * (dfs + 0.12)
      dimLine(it.x0, yRow, it.x1, yRow, formatDrawingLength(it.x1 - it.x0, units), false)
    })
    // Overall width clears however many label rows stacked above it.
    const yOverall = Math.max(H + 0.6, H + 0.22 + (maxRow + 1) * (dfs + 0.12) + 0.16)
    dimLine(0, yOverall, L, yOverall, formatDrawingLength(L, units), false)
    dimLine(-0.55, 0, -0.55, H, formatDrawingLength(H, units), true)
    // Opening sill heights (skip floor-level doors).
    for (const o of el.openings) {
      if (o.sill <= 0.01) continue
      const x = Math.max(0.04, o.x0 - 0.18)
      dimLine(x, y(o.sill), x, y(0), formatDrawingLength(o.sill, units), true)
    }
    // Mount heights for wall/ceiling-mounted items (H3) — a plain silhouette
    // can't convey "how high", so every mounted item (TV, sconce, art, cove
    // light, wall cabinet…) gets an AFFL height dimension, floor to mount
    // height, tucked just inside its own footprint's left edge — the
    // opposite side/convention from the per-item WIDTH row below the floor,
    // so the two never collide. Floor-standing items carry no `mountHeight`
    // (projectElevation.ts) and get nothing here (H3 point 2 — no clutter).
    // Millimetres always (contractor AFFL convention), independent of the
    // panel's metric/imperial `units` toggle — matches the carpentry sheets.
    const mounted = el.items.filter((it) => it.mountHeight != null)
    const cols = staggerMountHeightColumns(
      mounted.map((it) => ({ x: it.x0, height: it.mountHeight! })),
    )
    mounted.forEach((it, i) => {
      const h = it.mountHeight!
      const x = Math.max(0.04, it.x0 - 0.12 - cols[i]! * 0.22)
      const mm = Math.round(h * 1000)
      dimLine(x, y(h), x, y(0), `${mm} AFFL`, true)
    })
  }

  const fullW = L + pad + margin
  const fullH = H + margin + pad + extraDimPad
  const vb = `${f(-pad)} ${f(-margin)} ${f(fullW)} ${f(fullH)}`
  // Print-true sizing (TODO G2): the viewBox is already 1 unit = 1 metre, so
  // `fullW`/`fullH` (metres) × `printMmPerM` (mm per metre) is the sheet's
  // exact printed size at the locked scale.
  // An inline `style` (not a bare `width`/`height` attribute) is required:
  // presentational attributes have the LOWEST CSS priority, so a plain
  // attribute would be silently overridden by `.draw svg { width:100% }`.
  const sizeAttr =
    printMmPerM != null
      ? ` style="width:${(fullW * printMmPerM).toFixed(3)}mm;height:${(fullH * printMmPerM).toFixed(3)}mm"`
      : ''
  return `<svg xmlns="http://www.w3.org/2000/svg"${sizeAttr} viewBox="${vb}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="wall elevation, ${f(L)} by ${f(H)} metres">${parts.join('')}</svg>`
}

/** Short human caption for a wall elevation (panel + report headings). */
export function elevationCaption(
  el: WallElevation,
  index: number,
  units: UnitSystem,
  /** Room-derived wall name, e.g. "Kitchen wall 04". Falls back to the index so
   *  callers without the plan's naming (and unmatched walls) still read fine. */
  name?: string,
): string {
  const dims = `${formatLength(el.length, units)} × ${formatLength(el.height, units)}`
  const winN = el.openings.filter((o) => o.kind === 'window').length
  const doorN = el.openings.filter((o) => o.kind === 'door').length
  const bits = [dims]
  if (winN) bits.push(`${winN} window${winN > 1 ? 's' : ''}`)
  if (doorN) bits.push(`${doorN} door${doorN > 1 ? 's' : ''}`)
  if (el.items.length) bits.push(`${el.items.length} item${el.items.length > 1 ? 's' : ''}`)
  // Tag the storey for any NON-ground level (F13). Only non-ground: this
  // function cannot see whether the plan is multi-storey, and stamping
  // "Ground floor" on every caption of a single-storey home would be noise on
  // the overwhelmingly common case. So an untagged caption means ground.
  const storey = el.levelId && el.levelId !== 'ground' && el.levelName ? ` — ${el.levelName}` : ''
  return `${name ?? `Wall ${index + 1}`}${storey} · ${bits.join(' · ')}`
}
