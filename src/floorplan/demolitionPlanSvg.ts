/**
 * Demolition / hacking plan SVG renderer (feature F30; hardened for SG under
 * TODO G7 — see `docs/research/2026-07-18-contractor-handover-research.md`).
 *
 * Pure `WallDiff → SVG string` step: draws kept walls solid, demolished walls
 * dashed + diagonally hatched (the drafting convention for "to be removed"),
 * and added walls bold (the "new" colour), plus a legend + a concise SG
 * permit-note block. The viewBox is computed from the bounds of ALL walls
 * across the diff. All colours come from the injected palette — nothing is
 * hardcoded.
 *
 * **Structural classification (G7):** `PlanWall.structure` rides straight
 * through from the source plan into `WallDiff.kept/demolished/added` (the diff
 * only matches/buckets wall objects, never clones them), so this module reads
 * it directly off each wall with no extra plumbing. A `'load-bearing'` wall
 * always gets a heavy/solid treatment; if it's ALSO being demolished that
 * escalates to a hard danger treatment + an inline "NOT PERMITTED" label — SG
 * hacking rules make load-bearing demolition absolutely off-limits, never
 * just "needs a permit" like an ordinary partition. An `'unknown'` (or
 * unset — same thing) wall being demolished gets an inline "⚠" — the app has
 * no way to verify a user's classification, and wall type is a **documented SG
 * failure mode**: older HDB beam-and-column + brick infill and newer precast
 * RC / Ferrolite partitions look identical on a plan but are structurally
 * different.
 *
 * Self-contained: imports only `./demolitionPlan` and `./types`.
 */

import type { WallDiff } from './demolitionPlan'
import { permitNotes } from './permitNotes'
import type { HousingType, PlanWall } from './types'

interface DemolitionPalette {
  /** Kept walls (unchanged). */
  kept: string
  /** Demolished / hacked walls. */
  demolished: string
  /** Newly built walls. */
  added: string
  /** Strong foreground for the legend text + swatch outlines. */
  ink: string
  /** Hard-stop danger treatment for a load-bearing wall marked for demolition
   *  (G7). Optional — falls back to `demolished` for callers that haven't
   *  opted into the extra colour (keeps existing palettes valid). */
  danger?: string
}

export interface DemolitionSvgOpts {
  palette: DemolitionPalette
  /** Target SVG width in pixels (height derives from plan aspect). Default 800. */
  widthPx?: number
  /** When set (mm printed per metre of real-world extent, from
   *  `drawingScale.ts:pickDrawingScale`), sizes the returned `<svg>` with
   *  explicit `width`/`height` in mm instead of pixels — print-true (TODO G2). */
  printMmPerM?: number
  /** Plan's housing type (SG1) — branches the permit-note block between the
   *  HDB permit path, the Condominium MCST path, and the Landed BCA-direct
   *  path. Defaults to the HDB text (prior universal behaviour) when unset. */
  housingType?: HousingType
}

/** Padding (metres) around the wall bounds. */
const PAD = 0.5
/** Legend layout, in pixels. */
const LEGEND_PAD = 12
const LEGEND_ROW = 20
const LEGEND_SWATCH = 22
const FONT = 12
/** Permit-note block layout, in pixels. */
const NOTE_ROW = 15
const NOTE_FONT = 10.5

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

const isLoadBearing = (w: PlanWall) => w.structure === 'load-bearing'
/** Absent `structure` means the SAME thing as an explicit `'unknown'`. */
const isUnverified = (w: PlanWall) => (w.structure ?? 'unknown') === 'unknown'

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

  // G7 classification tallies — drive both extra legend rows and the block height.
  const loadBearingAny = all.some(isLoadBearing)
  const loadBearingDemolished = diff.demolished.filter(isLoadBearing)
  const unverifiedDemolished = diff.demolished.filter((w) => isUnverified(w) && !isLoadBearing(w))
  const extraLegendRows =
    (loadBearingAny ? 1 : 0) +
    (loadBearingDemolished.length > 0 ? 1 : 0) +
    (unverifiedDemolished.length > 0 ? 1 : 0)

  const legendH = LEGEND_PAD * 2 + LEGEND_ROW * (3 + extraLegendRows)
  const notes = permitNotes(opts.housingType)
  const noteH = LEGEND_PAD + NOTE_ROW * notes.length
  const heightPx = planH + legendH + noteH

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

  const dangerColor = palette.danger ?? palette.demolished

  // Kept walls — solid, base weight; heavy when load-bearing (G7).
  for (const w of diff.kept) {
    parts.push(wallLine(w, px, py, palette.kept, isLoadBearing(w) ? 5 : 2, undefined))
  }
  // Demolished walls — dashed + diagonally hatched (drafting "to be removed"
  // convention). A load-bearing wall marked for demolition escalates to a
  // hard danger treatment + an inline "NOT PERMITTED" label (G7 — this is
  // never a normal hacking item); an unverified ('unknown'/absent)
  // classification gets an inline "⚠" warning instead.
  for (const w of diff.demolished) {
    const bearing = isLoadBearing(w)
    const color = bearing ? dangerColor : palette.demolished
    parts.push(wallLine(w, px, py, color, bearing ? 5 : 2, '6 4'))
    parts.push(hatchLines(w, px, py, color))
    if (bearing) {
      parts.push(wallLabel(w, px, py, 'NOT PERMITTED', color))
    } else if (isUnverified(w)) {
      parts.push(wallLabel(w, px, py, '⚠', palette.ink))
    }
  }
  // Added walls — bold, the new colour; heavy when load-bearing (rare, but
  // classification can be set on a newly-drawn wall too).
  for (const w of diff.added) {
    parts.push(wallLine(w, px, py, palette.added, isLoadBearing(w) ? 6 : 4, undefined))
  }

  parts.push(
    legend(diff, planH, palette, {
      loadBearingAny,
      loadBearingDemolished: loadBearingDemolished.length,
      unverifiedDemolished: unverifiedDemolished.length,
      dangerColor,
    }),
  )
  parts.push(permitNoteBlock(notes, planH + legendH, palette))

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

/** Spacing/size (px) of the demolition diagonal-hatch ticks. */
const HATCH_SPACING = 10
const HATCH_HALF = 5

/**
 * Diagonal hatch ticks along a demolished wall (real drafting "to be removed"
 * hatch convention — short 45°-diagonal strokes crossing the wall run, spaced
 * evenly along its length) rather than just a dashed centreline colour.
 */
function hatchLines(
  w: PlanWall,
  px: (x: number) => number,
  py: (z: number) => number,
  color: string,
): string {
  const x1 = px(w.start[0])
  const y1 = py(w.start[1])
  const x2 = px(w.end[0])
  const y2 = py(w.end[1])
  const dx = x2 - x1
  const dy = y2 - y1
  const len = Math.hypot(dx, dy)
  if (len < 1e-6) return ''
  const ux = dx / len
  const uy = dy / len
  // Perpendicular unit vector.
  const nx = -uy
  const ny = ux
  const diag = HATCH_HALF * Math.SQRT1_2
  const steps = Math.max(1, Math.round(len / HATCH_SPACING))
  const out: string[] = ['<g class="hatch">']
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const cx = x1 + dx * t
    const cy = y1 + dy * t
    // 45°-diagonal tick: half along the wall run, half across it.
    const ax = (ux + nx) * diag
    const ay = (uy + ny) * diag
    out.push(
      `<line x1="${n(cx - ax)}" y1="${n(cy - ay)}" x2="${n(cx + ax)}" y2="${n(cy + ay)}" ` +
        `stroke="${esc(color)}" stroke-width="1" />`,
    )
  }
  out.push('</g>')
  return out.join('\n')
}

/** An inline text marker (⚠ / NOT PERMITTED) at a wall's midpoint (G7). */
function wallLabel(
  w: PlanWall,
  px: (x: number) => number,
  py: (z: number) => number,
  text: string,
  color: string,
): string {
  const mx = (px(w.start[0]) + px(w.end[0])) / 2
  const my = (py(w.start[1]) + py(w.end[1])) / 2 - 6
  return (
    `<text x="${n(mx)}" y="${n(my)}" font-size="${FONT}" font-weight="700" ` +
    `text-anchor="middle" fill="${esc(color)}">${esc(text)}</text>`
  )
}

interface ClassificationTallies {
  loadBearingAny: boolean
  loadBearingDemolished: number
  unverifiedDemolished: number
  dangerColor: string
}

/** A base 3-row legend (kept / demolished / added) plus, when relevant, extra
 *  G7 classification rows — with counts + totals. */
function legend(
  diff: WallDiff,
  planH: number,
  palette: DemolitionPalette,
  tallies: ClassificationTallies,
): string {
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
  if (tallies.loadBearingAny) {
    rows.push({ color: palette.ink, dash: undefined, width: 5, label: 'Load-bearing (heavy line)' })
  }
  if (tallies.loadBearingDemolished > 0) {
    rows.push({
      color: tallies.dangerColor,
      dash: '6 4',
      width: 5,
      label: `NOT PERMITTED — load-bearing (${tallies.loadBearingDemolished})`,
    })
  }
  if (tallies.unverifiedDemolished > 0) {
    rows.push({
      color: palette.demolished,
      dash: '6 4',
      width: 2,
      label: `⚠ Structure unverified — confirm with HDB/PE before hacking (${tallies.unverifiedDemolished})`,
    })
  }

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

/** Concise SG permit-note block (G7/SG1), rendered below the legend. `lines`
 *  is the housing-type-branched note text from `permitNotes()` — line 0 is
 *  the bold title, the rest render as bullets. */
function permitNoteBlock(lines: string[], topY: number, palette: DemolitionPalette): string {
  const out: string[] = ['<g class="permit-notes">']
  let y = topY + LEGEND_PAD + NOTE_ROW / 2
  lines.forEach((line, i) => {
    const text = i === 0 ? line : `• ${line}`
    out.push(
      `<text x="${LEGEND_PAD}" y="${n(y)}" font-size="${NOTE_FONT}"${i === 0 ? ' font-weight="700"' : ''} ` +
        `dominant-baseline="middle" fill="${esc(palette.ink)}">${esc(text)}</text>`,
    )
    y += NOTE_ROW
  })
  out.push('</g>')
  return out.join('\n')
}
