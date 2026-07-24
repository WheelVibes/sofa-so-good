/**
 * Reflected Ceiling Plan (RCP) SVG renderer (TODO H4) — mirrors
 * `electricalPlanSvg.ts`'s shape: plan walls (thin) + a symbol per
 * ceiling-mounted fixture/aircon point + a legend/schedule below. Additionally
 * draws each room's ceiling-zone note + (for a tray/dropped/coffered
 * treatment) its inset border/box rect or beam grid, straight from
 * `rcp.ts:buildReflectedCeilingPlan`'s output — geometry lives there, this
 * file is pure presentation.
 *
 * Self-contained: imports only `./rcp`, `./mepLabelLayout`, and `./types`.
 */
import { symbolPrintScale } from './drawingScale'
import { layoutMepLabels } from './mepLabelLayout'
import type { RcpFixture, RcpRect, RcpTrunkingRun, ReflectedCeilingPlan } from './rcp'
import type { FloorPlan, PlanWall } from './types'
import { wallLength } from './types'

/** Palette injected by the caller (resolved theme tokens). */
interface RcpPalette {
  /** Plan wall stroke. */
  wall: string
  /** Legend/label text + symbol markings. */
  ink: string
  /** Symbol circle stroke/accent (fixtures + aircon). */
  symbol: string
  /** Ceiling-zone note text + treatment outline colour. */
  zone: string
  /** Dimension leader lines + distance labels. */
  dim: string
}

export interface RcpSvgOptions {
  palette: RcpPalette
  /** Target SVG width in pixels (height derives from plan aspect). Default 800. */
  widthPx?: number
  /** When set (mm printed per metre of real-world extent, from
   *  `drawingScale.ts:pickDrawingScale`), sizes the returned `<svg>` with
   *  explicit `width`/`height` in mm instead of pixels — print-true. */
  printMmPerM?: number
}

/** Padding (metres) around the wall bounds. */
const PAD = 0.5
/** Base fixture/aircon symbol radius/font, pixels; `SYM_R`/`SYM_FONT` are
 *  bumped per-call at small paper formats for print legibility (P3), reset each
 *  `rcpSvg` call. */
const BASE_SYM_R = 9
const BASE_SYM_FONT = 8
let SYM_R = BASE_SYM_R
let SYM_FONT = BASE_SYM_FONT
const FONT = 12
const ZONE_FONT = 9
const DIM_FONT = 7.5
const LEGEND_PAD = 12
const LEGEND_ROW = 22

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

/** Bounding box of every (non-zero-length) wall — full min/max (mirrors
 *  `electricalPlanSvg.ts`/`plumbingPlanSvg.ts`'s own copy of this helper — kept
 *  local per that same sibling-renderer precedent rather than shared). */
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

/** Short marking inside a ceiling-fixture/aircon symbol circle. */
const FIXTURE_SYM_TEXT: Record<string, string> = {
  'ceiling-light': 'CL',
  'ceiling-fan': 'CF',
  'cove-light': 'CV',
}
const FIXTURE_KIND_LABEL: Record<string, string> = {
  'ceiling-light': 'Ceiling light',
  'ceiling-fan': 'Ceiling fan',
  'cove-light': 'Cove light',
}
const AIRCON_SYM_TEXT = 'AC'

/**
 * Render the reflected ceiling plan as a standalone SVG string. Plan metres
 * map to pixels by a uniform scale; +Z (south) maps to +Y (down).
 */
export function rcpSvg(plan: FloorPlan, rcp: ReflectedCeilingPlan, opts: RcpSvgOptions): string {
  const { palette } = opts
  const widthPx = opts.widthPx && opts.widthPx > 0 ? opts.widthPx : 800

  const walls = plan && Array.isArray(plan.walls) ? plan.walls : []
  const drawn = walls.filter((w) => wallLength(w) > 0)
  const zones = Array.isArray(rcp?.zones) ? rcp.zones : []
  const fixtures = Array.isArray(rcp?.fixtures) ? rcp.fixtures : []
  const aircon = Array.isArray(rcp?.aircon) ? rcp.aircon : []
  const trunking = Array.isArray(rcp?.trunking) ? rcp.trunking : []

  const b = wallBounds(drawn)
  const worldW = Math.max(b.maxX - b.minX + PAD * 2, 1)
  const worldH = Math.max(b.maxZ - b.minZ + PAD * 2, 1)
  const scale = widthPx / worldW
  // Small-format legibility bump (P3) — see electricalPlanSvg for the rationale.
  const symScale = symbolPrintScale(BASE_SYM_R, scale, opts.printMmPerM)
  SYM_R = BASE_SYM_R * symScale
  SYM_FONT = BASE_SYM_FONT * symScale
  const planH = worldH * scale

  const px = (x: number) => (x - b.minX + PAD) * scale
  const py = (z: number) => (z - b.minZ + PAD) * scale

  const anyFixtureLabel = fixtures.length > 0
  const anyAircon = aircon.length > 0
  const anyTrunking = trunking.length > 0
  const legendRows =
    (anyFixtureLabel ? new Set(fixtures.map((f) => f.type)).size : 0) +
    (anyAircon ? 1 : 0) +
    (anyTrunking ? 1 : 0)
  const legendH = LEGEND_PAD * 2 + LEGEND_ROW * Math.max(legendRows, 1) + LEGEND_ROW // + convention line
  const heightPx = planH + legendH

  const parts: string[] = []
  const sizeStyle =
    opts.printMmPerM != null
      ? ` style="width:${n(widthPx * (opts.printMmPerM / scale))}mm;height:${n(heightPx * (opts.printMmPerM / scale))}mm"`
      : ''
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${n(widthPx)}" height="${n(heightPx)}"${sizeStyle} viewBox="0 0 ${n(widthPx)} ${n(heightPx)}">`,
  )

  // Plan walls (thin context).
  for (const w of drawn) {
    parts.push(
      `<line x1="${n(px(w.start[0]))}" y1="${n(py(w.start[1]))}" x2="${n(px(w.end[0]))}" ` +
        `y2="${n(py(w.end[1]))}" stroke="${esc(palette.wall)}" stroke-width="1.5" ` +
        'stroke-linecap="round" />',
    )
  }

  // Ceiling-zone treatment outlines (drawn under the fixtures/notes).
  const rectSvg = (r: RcpRect): string => {
    const x0 = px(r.cx - r.w / 2)
    const z0 = py(r.cz - r.d / 2)
    return (
      `<rect x="${n(x0)}" y="${n(z0)}" width="${n(r.w * scale)}" height="${n(r.d * scale)}" ` +
      `fill="none" stroke="${esc(palette.zone)}" stroke-width="1" stroke-dasharray="4 3" />`
    )
  }
  for (const z of zones) {
    if (!z.treatment) continue
    if (z.treatment.rect) parts.push(rectSvg(z.treatment.rect))
    if (z.treatment.beams) for (const beam of z.treatment.beams) parts.push(rectSvg(beam))
  }

  // Per-room zone note (name + note, small italic text at the room centroid —
  // approximated as the outline's own bounding-box centre so a non-rectangular
  // room still gets a sensible anchor without importing `roomCentroid.ts`'s
  // heavier polygon-aware placement here).
  for (const z of zones) {
    if (z.outline.length === 0) continue
    const xs = z.outline.map((p) => p[0])
    const zs = z.outline.map((p) => p[1])
    const cx = px((Math.min(...xs) + Math.max(...xs)) / 2)
    const cz = py((Math.min(...zs) + Math.max(...zs)) / 2)
    // Finished-headroom clearance readout + warning marking (R4-2), only when
    // the `ceilingClearance` flag is on (rcp.ts attaches `z.clearance` then).
    // Uses palette.dim for a passing readout and palette.ink for the warning so
    // it reads as an alert against the dim note — no hardcoded colour.
    const c = z.clearance
    const warnTspan = c
      ? c.warn
        ? `<tspan x="${n(cx)}" dy="11" font-weight="bold" fill="${esc(palette.ink)}">` +
          `⚠ ${c.headroomMm}mm ${c.belowCornice ? 'below 2100mm cornice min' : 'under 2400mm min headroom'}</tspan>`
        : `<tspan x="${n(cx)}" dy="11" fill="${esc(palette.dim)}">` +
          `clearance ${c.headroomMm}mm ≥ 2400mm min</tspan>`
      : ''
    parts.push(
      `<text x="${n(cx)}" y="${n(cz)}" font-size="${ZONE_FONT}" text-anchor="middle" ` +
        `fill="${esc(palette.zone)}"><tspan x="${n(cx)}" dy="-5">${esc(z.roomName)}</tspan>` +
        `<tspan x="${n(cx)}" dy="11" font-style="italic">${esc(z.note)}</tspan>${warnTspan}</text>`,
    )
  }

  // Aircon refrigerant-trunking routes (BSJ-2 follow-up) — a dashed polyline
  // per resolved run + a length label at its midpoint. Drawn under the
  // fixture/aircon symbols so a route passing near a symbol doesn't obscure it.
  for (const run of trunking) {
    parts.push(trunkingSvg(run, px, py, palette))
  }

  // Fixture wall-offset dimensions — a short dashed leader from the fixture to
  // each nearest wall's centreline, with a distance label. Labels that would
  // collide (fixtures clustered a few cm apart — same failure mode the MEP
  // sheets fixed, H-D1) are fanned out via the shared declutter helper.
  const dimLabelInput = fixtures.map((f) => ({ id: f.id, cx: px(f.x), cy: py(f.z) }))
  const dimLayout = layoutMepLabels(dimLabelInput, SYM_R + 2)
  const mm = (metres: number) => `${Math.round(metres * 1000)}mm`
  for (const f of fixtures) {
    const cx = px(f.x)
    const cy = py(f.z)
    if (f.dimX) {
      const fx = px(f.dimX.faceX)
      parts.push(
        `<line x1="${n(fx)}" y1="${n(cy)}" x2="${n(cx)}" y2="${n(cy)}" stroke="${esc(palette.dim)}" ` +
          `stroke-width="0.75" stroke-dasharray="3 2" />`,
      )
      parts.push(
        `<text x="${n((fx + cx) / 2)}" y="${n(cy - 3)}" font-size="${DIM_FONT}" text-anchor="middle" ` +
          `fill="${esc(palette.dim)}">${mm(f.dimX.distance)}</text>`,
      )
    }
    if (f.dimZ) {
      const fz = py(f.dimZ.faceZ)
      parts.push(
        `<line x1="${n(cx)}" y1="${n(fz)}" x2="${n(cx)}" y2="${n(cy)}" stroke="${esc(palette.dim)}" ` +
          `stroke-width="0.75" stroke-dasharray="3 2" />`,
      )
      parts.push(
        `<text x="${n(cx + 3)}" y="${n((fz + cy) / 2)}" font-size="${DIM_FONT}" ` +
          `fill="${esc(palette.dim)}">${mm(f.dimZ.distance)}</text>`,
      )
    }
  }

  // Fixture + aircon symbols (drawn last so they sit above dimension lines).
  fixtures.forEach((f) => {
    const placement = dimLayout.find((l) => l.id === f.id)!
    parts.push(fixtureSymbol(f, placement.cx, placement.cy, palette, placement))
  })
  aircon.forEach((p) => {
    parts.push(airconSymbol(px(p.x), py(p.z), p, palette))
  })

  parts.push(legend(fixtures, aircon, trunking, planH, palette))

  parts.push('</svg>')
  return parts.join('\n')
}

/** One ceiling-fixture symbol: a circle + short kind marking, with a side
 *  label (decluttered per `mepLabelLayout.ts`, same as the electrical/plumbing
 *  sheets). */
function fixtureSymbol(
  f: RcpFixture,
  cx: number,
  cy: number,
  palette: RcpPalette,
  labelPlacement?: { labelX: number; labelY: number; hasLeader: boolean },
): string {
  const out: string[] = [`<g class="rcp-fixture" data-kind="${esc(f.type)}">`]
  out.push(
    `<circle cx="${n(cx)}" cy="${n(cy)}" r="${SYM_R}" fill="none" ` +
      `stroke="${esc(palette.symbol)}" stroke-width="1.5" />`,
  )
  out.push(
    `<text x="${n(cx)}" y="${n(cy)}" font-size="${SYM_FONT}" text-anchor="middle" ` +
      `dominant-baseline="central" fill="${esc(palette.ink)}">${esc(FIXTURE_SYM_TEXT[f.type] ?? '?')}</text>`,
  )
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
      `dominant-baseline="central" fill="${esc(palette.ink)}">${esc(f.label)}</text>`,
  )
  out.push('</g>')
  return out.join('\n')
}

function airconSymbol(
  cx: number,
  cy: number,
  p: { mountHeightMm: number; label?: string },
  palette: RcpPalette,
): string {
  const out: string[] = ['<g class="rcp-aircon">']
  out.push(
    `<circle cx="${n(cx)}" cy="${n(cy)}" r="${SYM_R}" fill="none" ` +
      `stroke="${esc(palette.symbol)}" stroke-width="1.5" stroke-dasharray="1 1.5" />`,
  )
  out.push(
    `<text x="${n(cx)}" y="${n(cy)}" font-size="${SYM_FONT}" text-anchor="middle" ` +
      `dominant-baseline="central" fill="${esc(palette.ink)}">${AIRCON_SYM_TEXT}</text>`,
  )
  const sideText = [p.label, `@${Math.round(p.mountHeightMm)}`].filter(Boolean).join(' ')
  out.push(
    `<text x="${n(cx + SYM_R + 2)}" y="${n(cy)}" font-size="${SYM_FONT}" ` +
      `dominant-baseline="central" fill="${esc(palette.ink)}">${esc(sideText)}</text>`,
  )
  out.push('</g>')
  return out.join('\n')
}

/** One trunking route: dashed polyline + a length label at its midpoint
 *  segment. Uses `palette.symbol` (the same accent as the aircon marking) so
 *  it visually pairs with the AC symbol it originates from. */
function trunkingSvg(
  run: RcpTrunkingRun,
  px: (x: number) => number,
  py: (z: number) => number,
  palette: RcpPalette,
): string {
  if (run.points.length < 2) return ''
  const pts = run.points.map(([x, z]) => `${n(px(x))},${n(py(z))}`).join(' ')
  const mid = run.points[Math.floor(run.points.length / 2)]!
  const [mx, mz] = [px(mid[0]), py(mid[1])]
  return (
    `<g class="rcp-trunking">` +
    `<polyline points="${pts}" fill="none" stroke="${esc(palette.symbol)}" stroke-width="1.25" ` +
    `stroke-dasharray="5 3" stroke-linejoin="round" />` +
    `<text x="${n(mx)}" y="${n(mz - 4)}" font-size="${DIM_FONT}" text-anchor="middle" ` +
    `fill="${esc(palette.symbol)}">~${Math.round(run.lengthM)}m</text>` +
    `</g>`
  )
}

/** Legend: one row per fixture kind present + (when any) an aircon row + (when
 *  any resolved run) a trunking row, plus a trailing convention line
 *  explaining the dimension convention. */
function legend(
  fixtures: RcpFixture[],
  aircon: { mountHeightMm: number }[],
  trunking: RcpTrunkingRun[],
  planH: number,
  palette: RcpPalette,
): string {
  const out: string[] = ['<g class="legend">']
  let y = planH + LEGEND_PAD + LEGEND_ROW / 2
  const kinds = [...new Set(fixtures.map((f) => f.type))]
  if (kinds.length === 0 && aircon.length === 0) {
    out.push(
      `<text x="${LEGEND_PAD}" y="${n(y)}" font-size="${FONT}" dominant-baseline="middle" ` +
        `fill="${esc(palette.ink)}">No ceiling fixtures or aircon points</text>`,
    )
    y += LEGEND_ROW
  }
  for (const kind of kinds) {
    const count = fixtures.filter((f) => f.type === kind).length
    const cx = LEGEND_PAD + SYM_R
    out.push(
      fixtureSymbol({ id: '', type: kind, label: '', x: 0, z: 0, dimX: null, dimZ: null }, cx, y, {
        ...palette,
      }),
    )
    out.push(
      `<text x="${LEGEND_PAD + SYM_R * 2 + 8}" y="${n(y)}" font-size="${FONT}" ` +
        `dominant-baseline="middle" fill="${esc(palette.ink)}">${esc(FIXTURE_KIND_LABEL[kind] ?? kind)} × ${count}</text>`,
    )
    y += LEGEND_ROW
  }
  if (aircon.length > 0) {
    const cx = LEGEND_PAD + SYM_R
    out.push(airconSymbol(cx, y, { mountHeightMm: 0 }, palette))
    out.push(
      `<text x="${LEGEND_PAD + SYM_R * 2 + 8}" y="${n(y)}" font-size="${FONT}" ` +
        `dominant-baseline="middle" fill="${esc(palette.ink)}">Aircon point × ${aircon.length} — see Electrical plan for full schedule</text>`,
    )
    y += LEGEND_ROW
  }
  if (trunking.length > 0) {
    const totalM = Math.round(trunking.reduce((s, r) => s + r.lengthM, 0))
    out.push(
      `<line x1="${LEGEND_PAD}" y1="${n(y)}" x2="${LEGEND_PAD + SYM_R * 2}" y2="${n(y)}" ` +
        `stroke="${esc(palette.symbol)}" stroke-width="1.25" stroke-dasharray="5 3" />`,
    )
    out.push(
      `<text x="${LEGEND_PAD + SYM_R * 2 + 8}" y="${n(y)}" font-size="${FONT}" ` +
        `dominant-baseline="middle" fill="${esc(palette.ink)}">Aircon trunking route × ${trunking.length} runs ≈ ${totalM}m total (modeled — confirm with installer)</text>`,
    )
    y += LEGEND_ROW
  }
  out.push(
    `<text x="${LEGEND_PAD}" y="${n(y)}" font-size="${SYM_FONT}" font-style="italic" ` +
      `dominant-baseline="middle" fill="${esc(palette.ink)}">Fixture positions dimensioned off the nearest wall centreline on each axis (mm). Zone notes: FFL = finished floor level.</text>`,
  )
  out.push('</g>')
  return out.join('\n')
}
