/**
 * Electrical / power & data plan SVG renderer (feature F29).
 *
 * Pure `ElectricalPlan → SVG string` step: draws the plan walls (thin) plus a
 * standard architectural electrical SYMBOL at each point, with a small legend /
 * schedule below. The viewBox is computed from the bounds of ALL walls (full
 * min AND max). Every colour comes from the injected palette — nothing themed
 * is hardcoded. Free-text labels are XML-escaped before they reach the markup.
 *
 * Symbol glyphs (each a circle + marking):
 *   socket        → circle with two short prongs (power outlet)
 *   socket-double → circle with "2"
 *   switch        → circle with "S"
 *   data          → circle with "D"
 *   tv-point      → circle with "TV"
 *   aircon        → circle with "AC"
 *   water-heater  → circle with "WH"
 *
 * Self-contained: imports only `./electricalPlan` and `./types`.
 */

import { buildSocketAdvisory, type SocketAdvisory } from '../analysis/socketAdvisory'
import { symbolPrintScale } from './drawingScale'
import type { ElectricalKind, ElectricalPlan } from './electricalPlan'
import { electricalKindLabel } from './electricalPlan'
import { allPlanRooms } from './levels'
import { layoutMepLabels } from './mepLabelLayout'
import { ROOM_CATEGORY_LABELS } from './roomCategory'
import {
  buildSwitchCircuits,
  type CircuitLightInput,
  type SwitchCircuitPlan,
} from './switchCircuits'
import type { FloorPlan, PlanWall } from './types'
import { pointInRoom, wallLength } from './types'

/** Palette injected by the caller (resolved theme tokens). */
interface ElectricalPalette {
  /** Plan wall stroke. */
  wall: string
  /** Foreground for legend text + glyph markings. */
  ink: string
  /** Symbol circle stroke / accent. */
  symbol: string
}

export interface ElectricalSvgOpts {
  palette: ElectricalPalette
  /** Target SVG width in pixels (height derives from plan aspect). Default 800. */
  widthPx?: number
  /** When set (mm printed per metre of real-world extent, from
   *  `drawingScale.ts:pickDrawingScale`), sizes the returned `<svg>` with
   *  explicit `width`/`height` in mm instead of pixels — print-true (TODO G2). */
  printMmPerM?: number
  /** Light fixtures on this storey (BSJ-3, `switchCircuits` pro flag). When
   *  provided, the sheet draws the lighting-switching schematic: circuit tags
   *  (S1…) on each linked switch AND its controlled lights (L1…), a "Lighting
   *  circuits" legend, and an unswitched-lights / empty-switches advisory line.
   *  Absent (flag off, Simple mode) → no circuit rendering (byte-identical to
   *  the pre-BSJ-3 sheet). The caller passes it only when the flag is on. */
  lights?: CircuitLightInput[]
}

/** Padding (metres) around the wall bounds. */
const PAD = 0.5
/** Base symbol circle radius, pixels (before the small-format print bump). */
const BASE_SYM_R = 9
const BASE_SYM_FONT = 8
/** Current symbol radius/font, pixels — bumped up per-call at small paper
 *  formats so print-scaled symbols stay legible (see `symbolPrintScale`); reset
 *  at the top of every `electricalSvg` call, so a screen render is unaffected. */
let SYM_R = BASE_SYM_R
let SYM_FONT = BASE_SYM_FONT
/** Legend layout, pixels. */
const LEGEND_PAD = 12
const LEGEND_ROW = 22
const FONT = 12
/** Socket-advisory NOTES block layout, pixels. */
const NOTES_PAD = 12
const NOTES_ROW = 16
const NOTES_FONT = 11

/** Full XML-attribute / text escaping for injected strings (5 entities). */
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

/** Bounding box of every (non-zero-length) wall — full min/max. */
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

/** Short marking text drawn inside a symbol circle (empty for plain socket).
 *  Exported (MEP layer, G1 PR3) so the 2D editor's `MepLayer` renders the same
 *  glyph vocabulary as the exported sheet — one symbol set, not two. */
export const ELEC_SYM_TEXT: Record<ElectricalKind, string> = {
  socket: '',
  'socket-double': '2',
  switch: 'S',
  data: 'D',
  'tv-point': 'TV',
  aircon: 'AC',
  'water-heater': 'WH',
}

/**
 * Render the electrical plan as a standalone SVG string. Plan metres map to
 * pixels by a uniform scale; +Z (south) maps to +Y (down) in SVG.
 */
export function electricalSvg(
  plan: FloorPlan,
  electrical: ElectricalPlan,
  opts: ElectricalSvgOpts,
): string {
  const { palette } = opts
  const widthPx = opts.widthPx && opts.widthPx > 0 ? opts.widthPx : 800

  const walls = plan && Array.isArray(plan.walls) ? plan.walls : []
  const drawn = walls.filter((w) => wallLength(w) > 0)
  const points = Array.isArray(electrical?.points) ? electrical.points : []
  const schedule = Array.isArray(electrical?.schedule) ? electrical.schedule : []

  const b = wallBounds(drawn)
  const worldW = Math.max(b.maxX - b.minX + PAD * 2, 1)
  const worldH = Math.max(b.maxZ - b.minZ + PAD * 2, 1)
  const scale = widthPx / worldW
  // Small-format legibility bump (P3): grow the fixed-px symbols so they print
  // at least MIN_SYMBOL_PRINT_MM at the locked scale. No-op (factor 1) on
  // screen (no printMmPerM) or when symbols already print large enough.
  const symScale = symbolPrintScale(BASE_SYM_R, scale, opts.printMmPerM)
  SYM_R = BASE_SYM_R * symScale
  SYM_FONT = BASE_SYM_FONT * symScale
  const planH = worldH * scale

  const px = (x: number) => (x - b.minX + PAD) * scale
  const py = (z: number) => (z - b.minZ + PAD) * scale

  // Lighting-switching schematic (BSJ-3): only when the caller passes `lights`
  // (i.e. the `switchCircuits` flag is on). Joins each `switch` point to the
  // light fixtures it controls (`switchCircuits.ts`), producing circuit tags,
  // controlled-light L-marks + a circuit legend. `swId` synthesises a stable
  // id for a heuristic-derived point that has none (it can't carry `controls`,
  // so it never links — but keeps the mapping total).
  const swId = (p: (typeof points)[number], i: number): string => p.id ?? `sw${i}`
  const rooms = plan ? allPlanRooms(plan) : []
  const roomNameAt = (x: number, z: number): string | undefined =>
    rooms.find((r) => pointInRoom(r, x, z))?.name
  const circuitPlan: SwitchCircuitPlan | null = opts.lights
    ? buildSwitchCircuits(
        points
          .map((p, i) => ({ p, i }))
          .filter(({ p }) => p.kind === 'switch')
          .map(({ p, i }) => ({
            id: swId(p, i),
            x: p.x,
            z: p.z,
            controls: p.controls,
            gang: p.gang,
            way: p.way,
          })),
        opts.lights,
        roomNameAt,
      )
    : null
  const controlledLights = opts.lights
    ? opts.lights.filter((l) => circuitPlan?.lightMarkById.has(l.id))
    : []
  const circuitLines = circuitPlan
    ? circuitPlan.circuits.map(
        (c) => `${c.tag} — ${c.roomLabel} — controls ${c.lightMarks.join(', ')}`,
      )
    : []

  const anyHeights = points.some((p) => typeof p.mountHeightMm === 'number')
  // Extra legend rows: the "Lighting circuits" sub-heading + one row per circuit.
  const circuitLegendRows = circuitLines.length > 0 ? circuitLines.length + 1 : 0
  const legendRows = Math.max(schedule.length, 1) + (anyHeights ? 1 : 0) + circuitLegendRows
  const legendH = LEGEND_PAD * 2 + LEGEND_ROW * legendRows

  // Socket-count & DB-load advisory (R4-4): computed INSIDE this pure builder
  // from the plan it already receives, so the sheet's notes never drift from a
  // separately-computed number. Rendered as a NOTES block below the legend.
  const advisory = plan ? buildSocketAdvisory(plan) : null
  const notesLines = advisory ? socketAdvisoryLines(advisory, widthPx) : []
  // Switching advisory (BSJ-3): unswitched lights / empty switches, appended to
  // the same NOTES block.
  if (circuitPlan) {
    if (circuitPlan.unswitchedLightCount > 0)
      notesLines.push(
        `${circuitPlan.unswitchedLightCount} light${circuitPlan.unswitchedLightCount === 1 ? ' has' : 's have'} no switch assigned`,
      )
    if (circuitPlan.emptySwitchCount > 0)
      notesLines.push(
        `${circuitPlan.emptySwitchCount} switch${circuitPlan.emptySwitchCount === 1 ? '' : 'es'} control no lights`,
      )
  }
  const notesH = notesLines.length > 0 ? NOTES_PAD * 2 + NOTES_ROW * notesLines.length : 0
  const heightPx = planH + legendH + notesH

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

  // Plan walls (thin).
  for (const w of drawn) {
    parts.push(
      `<line x1="${n(px(w.start[0]))}" y1="${n(py(w.start[1]))}" x2="${n(px(w.end[0]))}" ` +
        `y2="${n(py(w.end[1]))}" stroke="${esc(palette.wall)}" stroke-width="1.5" ` +
        'stroke-linecap="round" />',
    )
  }

  // Symbols (drawn even when outside the wall bounds). Points whose circles
  // collide (e.g. a WC's soil-pipe + water-point a few cm apart) have BOTH
  // their circle centres nudged apart (with a tick + leader back to the true
  // spot) AND their labels fanned out relative to the nudged circles — see
  // `mepLabelLayout.ts` (H-D1 + the SG-contractor re-review's circle-overlap
  // follow-up).
  // BSJ-3: controlled light fixtures join the SAME declutter pass as the
  // electrical symbols (ids `l:<id>`) so a light marker near a switch never
  // overlaps it. Absent any `lights`, the input is identical to before.
  const labelLayout = layoutMepLabels(
    [
      ...points.map((p, i) => ({ id: String(i), cx: px(p.x), cy: py(p.z) })),
      ...controlledLights.map((l) => ({ id: `l:${l.id}`, cx: px(l.x), cy: py(l.z) })),
    ],
    SYM_R + 2,
  )
  points.forEach((p, i) => {
    const placement = labelLayout.find((l) => l.id === String(i))!
    // Append the circuit tag to a linked switch's side label (BSJ-3) — kept in
    // the SIDE text so it matches the DXF ELECTRICAL layer's suffixed text.
    const tag = p.kind === 'switch' ? circuitPlan?.tagBySwitchId.get(swId(p, i)) : undefined
    parts.push(
      symbol(
        p.kind,
        placement.cx,
        placement.cy,
        palette,
        p.label,
        p.mountHeightMm,
        placement,
        {
          trueCx: placement.trueCx,
          trueCy: placement.trueCy,
          hasCircleNudge: placement.hasCircleNudge,
        },
        tag,
      ),
    )
  })
  // Controlled-light markers (BSJ-3): a small crossed circle (lighting-outlet
  // convention) tagged with its L-mark + the circuit(s) controlling it.
  for (const l of controlledLights) {
    const placement = labelLayout.find((p) => p.id === `l:${l.id}`)!
    const mark = circuitPlan!.lightMarkById.get(l.id)!
    const tags = circuitPlan!.tagsByLightId.get(l.id) ?? []
    parts.push(lightMarker(placement, palette, mark, tags))
  }

  // Legend / schedule — an extra "heights in mm AFFL" line when any point on
  // this sheet carries a persisted mount height (MEP layer, G1 PR5), plus the
  // BSJ-3 "Lighting circuits" rows.
  parts.push(legend(schedule, planH, palette, anyHeights, circuitLines))

  // Socket-count & DB-load advisory NOTES block (R4-4), below the legend.
  if (notesLines.length > 0) parts.push(notes(notesLines, planH + legendH, palette))

  parts.push('</svg>')
  return parts.join('\n')
}

/** Word-wrap a string to lines of at most `maxChars` characters (greedy). A
 *  single over-long word is left on its own line rather than split. */
function wrapWords(text: string, maxChars: number): string[] {
  const words = text.split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let cur = ''
  for (const w of words) {
    if (cur.length === 0) cur = w
    else if (cur.length + 1 + w.length <= maxChars) cur += ` ${w}`
    else {
      lines.push(cur)
      cur = w
    }
  }
  if (cur) lines.push(cur)
  return lines
}

/** The display lines of the socket advisory NOTES block: a heading, one line
 *  per under-provisioned room ("Living: 3/8 sockets — under target"), or an
 *  all-clear line, then the wrapped DB-load note. Returns `[]` only when there
 *  is nothing at all to say (no rooms with a target AND no DB note — which never
 *  happens since the DB note is static, so the block always shows). */
function socketAdvisoryLines(advisory: SocketAdvisory, widthPx: number): string[] {
  const maxChars = Math.max(24, Math.floor(widthPx / (NOTES_FONT * 0.55)))
  const lines: string[] = ['Socket advisory (indicative)']
  const under = advisory.rooms.filter((r) => r.underProvisioned)
  if (advisory.rooms.length === 0) {
    lines.push('No rooms with a socket target.')
  } else if (under.length === 0) {
    lines.push('All rooms meet their socket target.')
  } else {
    for (const r of under) {
      const cat = ROOM_CATEGORY_LABELS[r.category]
      lines.push(`${r.roomName} (${cat}): ${r.placed}/${r.target} sockets — under target`)
    }
  }
  lines.push(...wrapWords(`DB load: ${advisory.dbNote}`, maxChars))
  return lines
}

/** Render the socket-advisory NOTES block starting at `startY` (px). The first
 *  line is a bold heading; the rest are plain notes — all in `palette.ink`. */
function notes(lines: string[], startY: number, palette: ElectricalPalette): string {
  const out: string[] = ['<g class="socket-advisory">']
  let y = startY + NOTES_PAD + NOTES_ROW / 2
  lines.forEach((line, i) => {
    const weight = i === 0 ? ' font-weight="700"' : ''
    out.push(
      `<text x="${LEGEND_PAD}" y="${n(y)}" font-size="${NOTES_FONT}"${weight} ` +
        `dominant-baseline="middle" fill="${esc(palette.ink)}">${esc(line)}</text>`,
    )
    y += NOTES_ROW
  })
  out.push('</g>')
  return out.join('\n')
}

/** A single electrical symbol glyph centred at (cx,cy) — the circle's
 *  RENDERED position, already nudged off `truePos` when it collided with
 *  another circle in its cluster (`layoutMepLabels`'s circle-nudge pass, SG-
 *  contractor re-review follow-up to H-D1). When `truePos` is given, a small
 *  × tick is drawn at the true position + a thin solid leader from it to the
 *  rendered circle, so the actual location stays readable (drafting
 *  convention: symbol displaced for clarity, tick marks the real spot). When
 *  `labelPlacement` carries a nudged label position (`hasLeader`), the side
 *  label is drawn there instead of the default `(cx + SYM_R + 2, cy)`, with a
 *  short dashed leader back to the (possibly nudged) circle centre. */
function symbol(
  kind: ElectricalKind,
  cx: number,
  cy: number,
  palette: ElectricalPalette,
  label: string | undefined,
  mountHeightMm?: number,
  labelPlacement?: { labelX: number; labelY: number; hasLeader: boolean },
  truePos?: { trueCx: number; trueCy: number; hasCircleNudge: boolean },
  circuitTag?: string,
): string {
  const out: string[] = [`<g class="elec-symbol" data-kind="${esc(kind)}">`]
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
  if (kind === 'socket') {
    // Two short prongs (vertical lines) inside the circle (offset scales with
    // the symbol so the prongs stay centred when the radius is bumped).
    const half = SYM_R * 0.45
    const prong = SYM_R / 3
    out.push(
      `<line x1="${n(cx - prong)}" y1="${n(cy - half)}" x2="${n(cx - prong)}" y2="${n(cy + half)}" ` +
        `stroke="${esc(palette.ink)}" stroke-width="1.5" stroke-linecap="round" />`,
    )
    out.push(
      `<line x1="${n(cx + prong)}" y1="${n(cy - half)}" x2="${n(cx + prong)}" y2="${n(cy + half)}" ` +
        `stroke="${esc(palette.ink)}" stroke-width="1.5" stroke-linecap="round" />`,
    )
  } else {
    out.push(
      `<text x="${n(cx)}" y="${n(cy)}" font-size="${SYM_FONT}" text-anchor="middle" ` +
        `dominant-baseline="central" fill="${esc(palette.ink)}">${esc(ELEC_SYM_TEXT[kind])}</text>`,
    )
  }
  // "@1200" mount-height suffix beside the label (MEP layer, G1 PR5) — omitted
  // for heuristic-derived points (no persisted `mountHeightMm`).
  const heightSuffix = typeof mountHeightMm === 'number' ? `@${Math.round(mountHeightMm)}` : ''
  // BSJ-3 circuit tag (e.g. "[S1]") suffixed onto the switch's side label — kept
  // consistent with the DXF ELECTRICAL layer's suffixed symbol text.
  const tagSuffix = circuitTag ? `[${circuitTag}]` : ''
  const sideText = [label, heightSuffix, tagSuffix].filter(Boolean).join(' ')
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

/** A controlled-light marker (BSJ-3): a small crossed circle at the declutter
 *  placement (drafting lighting-outlet convention), tagged with its L-mark and
 *  the circuit(s) that control it (e.g. "L1 [S1]"). A dashed leader + true-spot
 *  tick are drawn exactly like `symbol` when the circle was nudged for clarity. */
function lightMarker(
  placement: {
    cx: number
    cy: number
    trueCx: number
    trueCy: number
    hasCircleNudge: boolean
    labelX: number
    labelY: number
    hasLeader: boolean
  },
  palette: ElectricalPalette,
  mark: string,
  tags: string[],
): string {
  const { cx, cy } = placement
  const r = SYM_R * 0.8
  const out: string[] = ['<g class="light-marker">']
  if (placement.hasCircleNudge) {
    const { trueCx, trueCy } = placement
    const tick = SYM_R * 0.3
    out.push(
      `<line x1="${n(trueCx)}" y1="${n(trueCy)}" x2="${n(cx)}" y2="${n(cy)}" stroke="${esc(palette.symbol)}" stroke-width="0.75" />`,
      `<line x1="${n(trueCx - tick)}" y1="${n(trueCy - tick)}" x2="${n(trueCx + tick)}" y2="${n(trueCy + tick)}" stroke="${esc(palette.symbol)}" stroke-width="1" />`,
      `<line x1="${n(trueCx - tick)}" y1="${n(trueCy + tick)}" x2="${n(trueCx + tick)}" y2="${n(trueCy - tick)}" stroke="${esc(palette.symbol)}" stroke-width="1" />`,
    )
  }
  const d = r * 0.72
  out.push(
    `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r)}" fill="none" stroke="${esc(palette.symbol)}" stroke-width="1.25" />`,
    `<line x1="${n(cx - d)}" y1="${n(cy)}" x2="${n(cx + d)}" y2="${n(cy)}" stroke="${esc(palette.symbol)}" stroke-width="1" />`,
    `<line x1="${n(cx)}" y1="${n(cy - d)}" x2="${n(cx)}" y2="${n(cy + d)}" stroke="${esc(palette.symbol)}" stroke-width="1" />`,
  )
  const text = tags.length ? `${mark} [${tags.join('/')}]` : mark
  if (placement.hasLeader)
    out.push(
      `<line x1="${n(cx)}" y1="${n(cy)}" x2="${n(placement.labelX)}" y2="${n(placement.labelY)}" stroke="${esc(palette.symbol)}" stroke-width="0.5" stroke-dasharray="2 1.5" />`,
    )
  out.push(
    `<text x="${n(placement.labelX)}" y="${n(placement.labelY)}" font-size="${SYM_FONT}" dominant-baseline="central" fill="${esc(palette.ink)}">${esc(text)}</text>`,
  )
  out.push('</g>')
  return out.join('\n')
}

/** Schedule legend: one row per kind, with a miniature symbol + count + label,
 *  plus (when any point on the sheet carries a persisted mount height) a
 *  trailing "Heights in mm AFFL" line explaining the `@mm` suffix, and (BSJ-3)
 *  a "Lighting circuits" sub-heading + one row per circuit. */
function legend(
  schedule: ElectricalPlan['schedule'],
  planH: number,
  palette: ElectricalPalette,
  anyHeights = false,
  circuitLines: string[] = [],
): string {
  const out: string[] = ['<g class="legend">']
  let y = planH + LEGEND_PAD + LEGEND_ROW / 2
  if (schedule.length === 0) {
    out.push(
      `<text x="${LEGEND_PAD}" y="${n(y)}" font-size="${FONT}" dominant-baseline="middle" ` +
        `fill="${esc(palette.ink)}">No electrical points</text>`,
    )
  }
  for (const row of schedule) {
    const cx = LEGEND_PAD + SYM_R
    out.push(symbol(row.kind, cx, y, palette, undefined))
    const text = `${electricalKindLabel(row.kind)} × ${row.count}`
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
    y += LEGEND_ROW
  }
  if (circuitLines.length > 0) {
    out.push(
      `<text x="${LEGEND_PAD}" y="${n(y)}" font-size="${FONT}" font-weight="700" ` +
        `dominant-baseline="middle" fill="${esc(palette.ink)}">Lighting circuits</text>`,
    )
    y += LEGEND_ROW
    for (const line of circuitLines) {
      out.push(
        `<text x="${LEGEND_PAD}" y="${n(y)}" font-size="${SYM_FONT}" ` +
          `dominant-baseline="middle" fill="${esc(palette.ink)}">${esc(line)}</text>`,
      )
      y += LEGEND_ROW
    }
  }
  out.push('</g>')
  return out.join('\n')
}
