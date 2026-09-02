/**
 * Render a lighting plan to an SVG string (top-down, world metres as SVG units,
 * matching the floor-plan orientation). Pure + palette-injected so the in-app
 * panel (CSS tokens) and the printable report (print inks) share one renderer.
 * Draws thin wall context, each fixture's coverage circle (its falloff radius)
 * and a light glyph at the bulb position.
 */
import { roomLabelPoint } from '../../floorplan/roomCentroid'
import type { FloorPlan } from '../../floorplan/types'
import { planBounds } from '../../floorplan/types'
import type { PlanLight } from '../../lighting2d/lightingPlan'
import type { LuxStatus, RoomLuxEstimate } from '../../lighting2d/roomLux'
import { formatArea, type UnitSystem } from '../../utils/measurement'

// Full escape (incl. quotes) — these SVGs render via dangerouslySetInnerHTML, so
// keep it attribute-safe even if a user string is ever placed in an attribute.
const esc = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c,
  )

export interface LightingPalette {
  /** Wall context lines. */
  wall: string
  /** Fixture glyph stroke + labels. */
  ink: string
  /** Coverage-circle tint. */
  coverage: string
}

const f = (n: number) => n.toFixed(3)

export interface LightingPlanSvgOptions {
  palette: LightingPalette
  /** Draw each fixture's coverage (falloff) circle. Default true. */
  coverage?: boolean
  /** Outer margin (m). Default 0.4. */
  margin?: number
  /** When set (mm printed per metre of real-world extent, from
   *  `floorplan/drawingScale.ts:pickDrawingScale`), sizes the returned `<svg>`
   *  with explicit `width`/`height` in mm — print-true (TODO G2). */
  printMmPerM?: number
}

/** Build `<svg>…</svg>` for a lighting plan: walls + coverage circles + fixture
 *  glyphs (a filled bulb in the fixture's own warm colour + a 4-ray star). */
export function lightingPlanSvg(
  plan: FloorPlan,
  lights: PlanLight[],
  opts: LightingPlanSvgOptions,
): string {
  const { palette: p, coverage = true, margin = 0.4, printMmPerM } = opts
  const [mx, mz] = planBounds(plan)
  if (mx <= 0 || mz <= 0) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1" role="img" aria-label="empty lighting plan"></svg>`
  }
  const sw = Math.max(0.02, Math.min(mx, mz) * 0.004)
  const parts: string[] = []

  // Wall context (thin lines).
  for (const w of plan.walls) {
    parts.push(
      `<line x1="${f(w.start[0])}" y1="${f(w.start[1])}" x2="${f(w.end[0])}" y2="${f(w.end[1])}" stroke="${p.wall}" stroke-width="${f(sw)}" stroke-linecap="round"/>`,
    )
  }

  // Room name labels (escaped — custom plans carry user-entered names).
  const labelFs = Math.max(0.12, Math.min(mx, mz) * 0.025)
  for (const r of plan.rooms) {
    const [lx, lz] = roomLabelPoint(r)
    parts.push(
      `<text x="${f(lx)}" y="${f(lz)}" font-size="${f(labelFs)}" fill="${p.ink}" fill-opacity="0.5" text-anchor="middle" dominant-baseline="middle">${esc(r.name)}</text>`,
    )
  }

  // Coverage circles first (behind the glyphs).
  if (coverage) {
    for (const l of lights) {
      if (l.distance <= 0) continue
      parts.push(
        `<circle cx="${f(l.x)}" cy="${f(l.z)}" r="${f(l.distance)}" fill="${p.coverage}" fill-opacity="0.08" stroke="${p.coverage}" stroke-opacity="0.4" stroke-width="${f(sw)}" stroke-dasharray="${f(sw * 5)} ${f(sw * 4)}"/>`,
      )
    }
  }

  // Fixture glyphs — a bulb dot in the fixture's warm colour + a 4-ray star.
  const r = Math.max(0.08, Math.min(mx, mz) * 0.02)
  for (const l of lights) {
    parts.push(
      `<g stroke="${p.ink}" stroke-width="${f(sw)}">`,
      `<line x1="${f(l.x - r * 1.6)}" y1="${f(l.z)}" x2="${f(l.x + r * 1.6)}" y2="${f(l.z)}"/>`,
      `<line x1="${f(l.x)}" y1="${f(l.z - r * 1.6)}" x2="${f(l.x)}" y2="${f(l.z + r * 1.6)}"/>`,
      `<circle cx="${f(l.x)}" cy="${f(l.z)}" r="${f(r)}" fill="${l.color}"/>`,
      `</g>`,
    )
  }

  const fullW = mx + 2 * margin
  const fullH = mz + 2 * margin
  const vb = `${f(-margin)} ${f(-margin)} ${f(fullW)} ${f(fullH)}`
  // Print-true sizing (TODO G2): viewBox is already 1 unit = 1 metre. An
  // inline `style` (not a bare `width`/`height` attribute) is required:
  // presentational attributes have the LOWEST CSS priority, so a plain
  // attribute would be silently overridden by `.draw svg { width:100% }`.
  const sizeAttr =
    printMmPerM != null
      ? ` style="width:${(fullW * printMmPerM).toFixed(3)}mm;height:${(fullH * printMmPerM).toFixed(3)}mm"`
      : ''
  return `<svg xmlns="http://www.w3.org/2000/svg"${sizeAttr} viewBox="${vb}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="lighting plan, ${lights.length} fixtures">${parts.join('')}</svg>`
}

/** Print inks for the per-room lux status (report + drawing set are fixed-ink
 *  print documents, not themed app UI). */
const LUX_STATUS_PRINT: Record<LuxStatus, { label: string; color: string }> = {
  ok: { label: 'OK', color: '#15803d' },
  low: { label: 'Low', color: '#b45309' },
  high: { label: 'High', color: '#b45309' },
}

/**
 * Per-room illuminance-estimate table for the print surfaces (report + drawing
 * set share it so the two documents stay in lock-step): Room · Area · Est. avg
 * (lx) · Recommended band · Status. Header/numeric cell classes are injected —
 * the two documents use different table class vocabularies.
 */
export function roomLuxTableHtml(
  rows: RoomLuxEstimate[],
  units: UnitSystem,
  cls: { header: string; num: string; table?: string },
  /** Per-room uniformity (`lighting2d/luxGrid.ts:buildRoomUniformity`), keyed by
   *  room id. When supplied, a U0 column is added — a professional lighting spec
   *  states uniformity ALONGSIDE the average, because an average that meets its
   *  band can still be pools of light with dark corners between them. Omitted ⇒
   *  the previous 5-column table, unchanged. */
  uniformity?: Map<string, { u0: number; minU0: number; pass: boolean }>,
): string {
  if (rows.length === 0) return ''
  const showU0 = !!uniformity && uniformity.size > 0
  const body = rows
    .map((r) => {
      const s = LUX_STATUS_PRINT[r.status]
      const u = uniformity?.get(r.roomId)
      const uCell = !showU0
        ? ''
        : u
          ? `<td class="${cls.num}" style="color:${u.pass ? LUX_STATUS_PRINT.ok.color : LUX_STATUS_PRINT.low.color}">${u.u0.toFixed(2)} / ${u.minU0.toFixed(2)}</td>`
          : `<td class="${cls.num}">—</td>`
      return `<tr><td>${esc(r.roomName)}</td><td class="${cls.num}">${esc(formatArea(r.area, units))}</td><td class="${cls.num}">${Math.round(r.lux)} lx</td><td class="${cls.num}">${r.recommended.min}–${r.recommended.max} lx</td>${uCell}<td style="padding-left:14px;color:${s.color};font-weight:600">${s.label}</td></tr>`
    })
    .join('')
  const tableCls = cls.table ? ` class="${cls.table}"` : ''
  const uHead = showU0 ? `<td class="${cls.num}">U0 / min</td>` : ''
  return `<table${tableCls} style="margin-top:12px"><tr class="${cls.header}"><td>Room</td><td class="${cls.num}">Area</td><td class="${cls.num}">Est. avg</td><td class="${cls.num}">Recommended</td>${uHead}<td style="padding-left:14px">Status</td></tr>${body}</table>`
}
