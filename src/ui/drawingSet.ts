/**
 * Construction "drawing set" (a.k.a. plan set) — a paginated, title-blocked
 * document with one drawing per sheet: cover, floor plan, each wall elevation,
 * the lighting plan and the FF&E schedule. Distinct from the one-page summary
 * `report.ts`: this is the formal multi-sheet submission designers print/PDF for
 * builders + clients (RoomSketcher / Chief Architect "plan sets"). Reuses every
 * pure renderer built for the report so the two stay in lock-step. Opened in a
 * new window by `openDrawingSet.ts`.
 */
import { obbCorners } from '../collision/obb'
import { itemFootprint } from '../collision/placement'
import { projectAllElevations } from '../elevation/projectElevation'
import { buildFfeSchedule } from '../ffe/ffeSchedule'
import { dimensionSvg } from '../floorplan/autoDimensionSvg'
import { diffWalls, diffWallsByLevel } from '../floorplan/demolitionPlan'
import { demolitionSvg } from '../floorplan/demolitionPlanSvg'
import { buildElectricalPlan, type ElectricalPoint } from '../floorplan/electricalPlan'
import { electricalSvg } from '../floorplan/electricalPlanSvg'
import { buildFinishSchedule } from '../floorplan/finishSchedule'
import {
  allPlanRooms,
  isMultiLevel,
  itemsOnLevel,
  levelAsPlan,
  type PlanLevel,
  planLevels,
} from '../floorplan/levels'
import { buildPlumbingPlan, type PlumbingPoint } from '../floorplan/plumbingPlan'
import { plumbingSvg } from '../floorplan/plumbingPlanSvg'
import type { RoomFinishMaps } from '../floorplan/roomFinishes'
import { buildSection } from '../floorplan/section'
import { sectionSvg } from '../floorplan/sectionSvg'
import type { FloorPlan } from '../floorplan/types'
import { planRoomArea } from '../floorplan/types'
import { CATEGORY_COLORS } from '../furniture/categoryColors'
import type { FurnitureDef, FurnitureItem } from '../furniture/types'
import { buildLightingPlan } from '../lighting2d/lightingPlan'
import { estimateRoomLux } from '../lighting2d/roomLux'
import { BUILTIN_MATERIALS } from '../materials/builtinCatalog'
import type { CalloutSheet, DrawingCallout } from '../state/slices/drawingCalloutsSlice'
import { formatArea, formatLength, type UnitSystem } from '../utils/measurement'
import { type DrawingLayerVisibility, drawingLayerOn as layerOn } from './drawingLayers'
import { type ElevationPalette, elevationCaption, elevationSvg } from './elevation/elevationSvg'
import { sectionSilhouettes } from './elevation/sectionFigure'
import {
  type LightingPalette,
  lightingPlanSvg,
  roomLuxTableHtml,
} from './lighting2d/lightingPlanSvg'
import { reportPlanSvg } from './reportPlanSvg'

const ELEV_PRINT: ElevationPalette = {
  bg: '#f9fafb',
  stroke: '#374151',
  opening: '#93c5fd',
  item: '#d8c8b0',
  text: '#4b5563',
}
const LIGHTING_PRINT: LightingPalette = { wall: '#9ca3af', ink: '#374151', coverage: '#f59e0b' }

const esc = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c,
  )

interface Sheet {
  /** Sheet number, e.g. "A-1" — assigned sequentially once all sheets exist. */
  num?: string
  name: string
  /** Inner HTML for the sheet's drawing area. */
  body: string
  /** Which callout group targets this sheet (used to inject callout SVG). */
  calloutGroup?: CalloutSheet
}

/** Small storey note rendered above a sheet's drawing (print inks). */
const storeyNote = (text: string) =>
  `<div style="color:#b45309;font-weight:600;font-size:12px">${esc(text)}</div>`

/**
 * Build an SVG overlay `<div>` that renders the callouts targeting a specific
 * sheet group.  The overlay is absolutely positioned over the `.draw` area at
 * 100 × 100 user-units (normalised) so `x`/`y` [0,1] map directly to percent.
 * The element is transparent to pointer events and sits above the drawing SVG
 * but below the title block (z-index set explicitly).
 *
 * Text is word-wrapped by the browser (the print renderer has `word-break:
 * break-word`).  Special characters are XML-escaped.  An optional leader line
 * is drawn from the callout anchor to the `leaderX`/`leaderY` tip as a thin
 * dashed black line inside the same SVG.
 *
 * Returns an empty string when there are no matching callouts (zero footprint).
 */
function buildCalloutsSvg(callouts: DrawingCallout[], sheet: CalloutSheet): string {
  if (!callouts.length) return ''
  const matching = callouts.filter((c) => c.sheet === sheet)
  if (!matching.length) return ''

  // The SVG viewBox is 100×100 so normalised coords [0,1] × 100 = percentages.
  const VB = 100

  const elements: string[] = []

  for (const c of matching) {
    const ax = c.x * VB
    const ay = c.y * VB

    // Leader line (dashed thin, drawn first so text renders on top).
    if (c.leaderX !== undefined && c.leaderY !== undefined) {
      const lx = c.leaderX * VB
      const ly = c.leaderY * VB
      elements.push(
        `<line x1="${ax.toFixed(2)}" y1="${ay.toFixed(2)}" x2="${lx.toFixed(2)}" y2="${ly.toFixed(2)}" ` +
          `stroke="#374151" stroke-width="0.4" stroke-dasharray="1.2 0.8" opacity="0.8"/>`,
      )
      // Small circle at the leader tip.
      elements.push(
        `<circle cx="${lx.toFixed(2)}" cy="${ly.toFixed(2)}" r="0.5" fill="#374151" opacity="0.8"/>`,
      )
    }

    // Background rect for legibility (white, slight opacity).
    const lines = c.text.split('\n')
    const lineCount = lines.length
    // Approximate char width in VB units at font-size 2.8.
    const maxLen = Math.max(...lines.map((l) => l.length))
    const rectW = Math.min(Math.max(maxLen * 1.45 + 2, 8), 45)
    const rectH = lineCount * 3.4 + 1.2
    elements.push(
      `<rect x="${(ax - 0.5).toFixed(2)}" y="${(ay - 2.8).toFixed(2)}" ` +
        `width="${rectW.toFixed(2)}" height="${rectH.toFixed(2)}" ` +
        `fill="white" fill-opacity="0.88" rx="0.6" ry="0.6"/>`,
    )

    // Text lines (multi-line via tspan).
    const tspans = lines
      .map(
        (line, i) =>
          `<tspan x="${ax.toFixed(2)}" dy="${i === 0 ? '0' : '3.4'}">${esc(line)}</tspan>`,
      )
      .join('')
    elements.push(
      `<text x="${ax.toFixed(2)}" y="${ay.toFixed(2)}" ` +
        `font-family="-apple-system,Segoe UI,Roboto,sans-serif" ` +
        `font-size="2.8" fill="#111827" font-weight="500">${tspans}</text>`,
    )
  }

  return (
    `<div style="position:absolute;inset:0;pointer-events:none;overflow:hidden">` +
    `<svg viewBox="0 0 ${VB} ${VB}" width="100%" height="100%" ` +
    `xmlns="http://www.w3.org/2000/svg" style="position:absolute;inset:0">` +
    elements.join('') +
    `</svg></div>`
  )
}

/** Build the full drawing-set HTML document. `layers` hides individual sheet
 *  groups (default: all included). `callouts` are free-text annotations that
 *  render onto their target sheet as crisp SVG text (optional, default: none). */
export function buildDrawingSetHtml(
  plan: FloorPlan,
  items: FurnitureItem[],
  catalog: Record<string, FurnitureDef>,
  units: UnitSystem = 'metric',
  baselinePlan?: FloorPlan,
  electricalPoints?: ElectricalPoint[],
  plumbingPoints?: PlumbingPoint[],
  finishes?: RoomFinishMaps,
  layers?: DrawingLayerVisibility,
  callouts?: DrawingCallout[],
): string {
  const date = new Date().toLocaleDateString('en-SG', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
  const sheets: Sheet[] = []

  // Per-storey fan-out (F13): on a multi-level plan every plan-derived sheet
  // renders once per storey ("… — Ground floor", "… — Upper storey"), with the
  // items/points filtered to that storey. Single-storey plans keep the plain
  // sheet names + whole-plan path so their output is unchanged.
  const levels = planLevels(plan)
  const multi = isMultiLevel(plan)
  const cap = (base: string, level: PlanLevel) => (multi ? `${base} — ${level.name}` : base)

  // A-1 · Floor plan (furnished footprints under the walls, like the report).
  const footprintsOf = (list: FurnitureItem[]) =>
    list
      .map((it) => {
        const def = catalog[it.defId]
        if (!def?.defaultFootprint) return null
        return { corners: obbCorners(itemFootprint(it, def)), fill: CATEGORY_COLORS[def.category] }
      })
      .filter((f): f is { corners: [number, number][]; fill: string } => f != null)
  for (const level of levels) {
    const planSvg = reportPlanSvg(
      levelAsPlan(plan, level),
      [],
      units,
      footprintsOf(itemsOnLevel(items, level.id)),
    )
    sheets.push({
      name: cap('Floor plan', level),
      body: `<div class="draw">${planSvg}</div>`,
      calloutGroup: 'floor-plan',
    })
  }

  // One elevation per wall that carries furniture or openings.
  if (layerOn(layers, 'elevations')) {
    const elevations = projectAllElevations(plan, items, catalog).filter(
      (e) => e.length > 0 && e.height > 0 && (e.items.length > 0 || e.openings.length > 0),
    )
    elevations.forEach((e, i) => {
      sheets.push({
        name: elevationCaption(e, i, units),
        body: `<div class="draw">${elevationSvg(e, { palette: ELEV_PRINT, units })}</div>`,
        calloutGroup: 'elevations',
      })
    })
  }

  // Lighting plan (+ per-room lux estimate vs recommended residential bands) —
  // one diagram sheet per lit storey; the fixture schedule + lux table stay
  // unified (whole home) and ride on the last lighting sheet.
  const lighting = buildLightingPlan(items, catalog)
  if (layerOn(layers, 'lighting') && lighting.lights.length) {
    const lightSched = `<table class="sched"><tr class="h"><td>Fixture</td><td class="n">Qty</td><td class="n">Height</td><td class="n">Intensity</td></tr>${lighting.schedule
      .map(
        (r) =>
          `<tr><td>${esc(r.label)}</td><td class="n">×${r.count}</td><td class="n">${esc(formatLength(r.height, units))}</td><td class="n">${r.intensity} cd</td></tr>`,
      )
      .join('')}</table>
        ${roomLuxTableHtml(estimateRoomLux(plan, lighting.lights), units, { header: 'h', num: 'n', table: 'sched' })}`
    const lit = levels.filter((l) => itemsOnLevel(lighting.lights, l.id).length > 0)
    lit.forEach((level, i) => {
      const svg = lightingPlanSvg(
        levelAsPlan(plan, level),
        itemsOnLevel(lighting.lights, level.id),
        {
          palette: LIGHTING_PRINT,
        },
      )
      sheets.push({
        name: cap('Lighting plan', level),
        body: `<div class="draw">${svg}</div>
        ${i === lit.length - 1 ? lightSched : ''}`,
        calloutGroup: 'lighting',
      })
    })
  }

  // Dimensioned plan — overall + per-room running dimensions, per storey.
  if (layerOn(layers, 'dimensions')) {
    for (const level of levels) {
      if (!Array.isArray(level.walls) || level.walls.length === 0) continue
      sheets.push({
        name: cap('Dimensioned plan', level),
        body: `<div class="draw">${dimensionSvg(levelAsPlan(plan, level), {
          palette: { ink: '#374151', faint: '#cbd5e1' },
          widthPx: 900,
          units,
        })}</div>`,
        calloutGroup: 'dimensions',
      })
    }
  }

  // Cross-section — a vertical cut through the middle of the plan (along Z),
  // with ground-floor furniture in the cut's room band shown in elevation.
  const section = buildSection(
    plan,
    { axis: 'z', at: plan.extent[1] / 2 },
    sectionSilhouettes(itemsOnLevel(items, levels[0]!.id), catalog),
  )
  if (layerOn(layers, 'section') && section.walls.length > 0) {
    sheets.push({
      name: 'Section A–A',
      body: `<div class="draw">${sectionSvg(section, {
        palette: {
          wall: '#9ca3af',
          floor: '#374151',
          ceil: '#9ca3af',
          opening: '#93c5fd',
          ink: '#4b5563',
          item: '#d8c8b0',
        },
        widthPx: 900,
      })}</div>`,
      calloutGroup: 'section',
    })
  }

  // Electrical / power & data plan (points derived from appliances + doors) —
  // one diagram sheet per wired storey; the unified point schedule rides on the
  // last electrical sheet.
  if (layerOn(layers, 'electrical') && electricalPoints && electricalPoints.length > 0) {
    const elec = buildElectricalPlan(plan, electricalPoints)
    const elecSched = `<table class="sched"><tr class="h"><td>Point</td><td class="n">Qty</td></tr>${elec.schedule
      .map((r) => `<tr><td>${esc(r.label)}</td><td class="n">×${r.count}</td></tr>`)
      .join('')}</table>`
    const wired = levels.filter((l) => itemsOnLevel(elec.points, l.id).length > 0)
    wired.forEach((level, i) => {
      const levelPlan = levelAsPlan(plan, level)
      const levelElec = buildElectricalPlan(levelPlan, itemsOnLevel(elec.points, level.id))
      sheets.push({
        name: cap('Electrical plan', level),
        body: `<div class="draw">${electricalSvg(levelPlan, levelElec, {
          palette: { wall: '#9ca3af', ink: '#374151', symbol: '#2563eb' },
          widthPx: 900,
        })}</div>
        ${i === wired.length - 1 ? elecSched : ''}`,
        calloutGroup: 'electrical',
      })
    })
  }

  // Plumbing plan (points derived from bathroom / kitchen fixtures) — one
  // diagram sheet per plumbed storey; the unified schedule rides on the last.
  if (layerOn(layers, 'plumbing') && plumbingPoints && plumbingPoints.length > 0) {
    const plumb = buildPlumbingPlan(plan, plumbingPoints)
    const plumbSched = `<table class="sched"><tr class="h"><td>Point</td><td class="n">Qty</td></tr>${plumb.schedule
      .map((r) => `<tr><td>${esc(r.label)}</td><td class="n">×${r.count}</td></tr>`)
      .join('')}</table>`
    const plumbed = levels.filter((l) => itemsOnLevel(plumb.points, l.id).length > 0)
    plumbed.forEach((level, i) => {
      const levelPlan = levelAsPlan(plan, level)
      const levelPlumb = buildPlumbingPlan(levelPlan, itemsOnLevel(plumb.points, level.id))
      sheets.push({
        name: cap('Plumbing plan', level),
        body: `<div class="draw">${plumbingSvg(levelPlan, levelPlumb, {
          palette: { wall: '#9ca3af', ink: '#374151', symbol: '#0891b2' },
          widthPx: 900,
        })}</div>
        ${i === plumbed.length - 1 ? plumbSched : ''}`,
        calloutGroup: 'plumbing',
      })
    })
  }

  // Finishes schedule — per-room floor + wall material callouts (whole home),
  // the spec a builder needs alongside the plan (Coohom material callouts).
  if (layerOn(layers, 'finishes') && finishes) {
    const nameOf = (id: string) => BUILTIN_MATERIALS[id]?.name ?? id
    const rows = buildFinishSchedule(plan, finishes, nameOf)
    if (rows.length > 0) {
      const table = `<table class="sched"><tr class="h"><td>Room</td><td>Floor</td><td>Wall</td></tr>${rows
        .map(
          (r) => `<tr><td>${esc(r.room)}</td><td>${esc(r.floor)}</td><td>${esc(r.wall)}</td></tr>`,
        )
        .join('')}</table>`
      sheets.push({ name: 'Finishes schedule', body: table, calloutGroup: 'finishes' })
    }
  }

  // Demolition / hacking plan — only when walls changed vs the as-loaded
  // baseline. Multi-storey: each storey diffs against the SAME storey of the
  // baseline; a storey existing on only one side gets a whole-storey callout.
  if (layerOn(layers, 'demolition') && baselinePlan) {
    if (multi || isMultiLevel(baselinePlan)) {
      for (const row of diffWallsByLevel(baselinePlan, plan)) {
        if (row.diff.demolished.length === 0 && row.diff.added.length === 0) continue
        const note = row.wholeStorey
          ? storeyNote(
              row.wholeStorey === 'added'
                ? `Entire storey added — ${row.levelName} does not exist in the original layout.`
                : `Entire storey removed — ${row.levelName} existed only in the original layout.`,
            )
          : ''
        sheets.push({
          name: `Demolition & new walls — ${row.levelName}`,
          body: `${note}<div class="draw">${demolitionSvg(row.diff, {
            palette: { kept: '#9ca3af', demolished: '#dc2626', added: '#16a34a', ink: '#374151' },
            widthPx: 900,
          })}</div>`,
          calloutGroup: 'demolition',
        })
      }
    } else {
      const wallDiff = diffWalls(baselinePlan, plan)
      if (wallDiff.demolished.length > 0 || wallDiff.added.length > 0) {
        sheets.push({
          name: 'Demolition & new walls',
          body: `<div class="draw">${demolitionSvg(wallDiff, {
            palette: { kept: '#9ca3af', demolished: '#dc2626', added: '#16a34a', ink: '#374151' },
            widthPx: 900,
          })}</div>`,
          calloutGroup: 'demolition',
        })
      }
    }
  }

  // FF&E schedule.
  const ffe = layerOn(layers, 'ffe') ? buildFfeSchedule(plan, items, catalog) : []
  if (ffe.length) {
    const dim = (n: number) => esc(formatLength(n, units))
    sheets.push({
      name: 'FF&E schedule',
      body: `<table class="sched"><tr class="h"><td>Room</td><td>Item</td><td>Source</td><td>SKU</td><td>Size (W×D×H)</td><td class="n">Qty</td></tr>${ffe
        .map(
          (r) =>
            `<tr><td>${esc(r.room)}</td><td>${esc(r.name)}</td><td>${esc(r.source)}</td><td>${esc(r.sku || '—')}</td><td>${dim(r.w)} × ${dim(r.d)} × ${dim(r.h)}</td><td class="n">${r.qty}</td></tr>`,
        )
        .join('')}</table>`,
      calloutGroup: 'ffe',
    })
  }

  // Sheet numbers are sequential over the final sheet list (A-1, A-2, …).
  sheets.forEach((s, i) => {
    s.num = `A-${i + 1}`
  })

  // Cover sheet (A-0) — built last so it can index the rest. Multi-storey
  // plans group the room schedule by storey.
  const roomRow = (r: (typeof plan.rooms)[number]) =>
    `<tr><td>${esc(r.name)}</td><td class="n">${esc(formatArea(planRoomArea(r), units))}</td></tr>`
  const roomRows = multi
    ? levels
        .map(
          (l) =>
            `<tr class="h"><td colspan="2">${esc(l.name)}</td></tr>${l.rooms.map(roomRow).join('')}`,
        )
        .join('')
    : plan.rooms.map(roomRow).join('')
  const totalArea = allPlanRooms(plan).reduce((s, r) => s + planRoomArea(r), 0)
  const indexRows = sheets.map((s) => `<tr><td>${s.num}</td><td>${esc(s.name)}</td></tr>`).join('')
  const cover: Sheet = {
    num: 'A-0',
    name: 'Cover',
    calloutGroup: 'cover',
    body: `<div class="cover">
      <h1>${esc(plan.name)}</h1>
      <div class="cover-sub">Interior design drawing set · ${date}</div>
      <div class="cover-cols">
        <div><h3>Rooms &amp; areas</h3><table class="sched"><tr class="h"><td>Room</td><td class="n">Area</td></tr>${roomRows}<tr class="h"><td>Total</td><td class="n">${esc(formatArea(totalArea, units))}</td></tr></table></div>
        <div><h3>Sheet index</h3><table class="sched"><tr class="h"><td>No.</td><td>Sheet</td></tr><tr><td>A-0</td><td>Cover</td></tr>${indexRows}</table></div>
      </div>
    </div>`,
  }
  const ordered = [cover, ...sheets]
  // Normalise callout array (empty when none provided).
  const activeCallouts = callouts ?? []

  const sheetHtml = ordered
    .map((s) => {
      // Inject callout SVG overlay into the sheet-area for the matching group.
      // The overlay is absolutely-positioned over the `.draw` area; the wrapper
      // needs `position:relative` (added per-sheet below via inline style).
      const calloutsHtml =
        s.calloutGroup && activeCallouts.length
          ? buildCalloutsSvg(activeCallouts, s.calloutGroup)
          : ''
      const sheetAreaStyle = calloutsHtml ? ' style="position:relative"' : ''
      return (
        `<section class="sheet"><div class="sheet-area"${sheetAreaStyle}>${s.body}${calloutsHtml}</div>` +
        `\n        <div class="title-block"><span class="tb-proj">${esc(plan.name)}</span>` +
        `<span class="tb-name">${esc(s.name)}</span>` +
        `<span class="tb-meta">${esc(date)} · ${s.num}</span></div>\n      </section>`
      )
    })
    .join('')

  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(plan.name)} — Drawing set</title>
<style>
  @page { size: A4 landscape; margin: 10mm; }
  * { box-sizing: border-box; }
  body { font: 12px/1.5 -apple-system, Segoe UI, Roboto, sans-serif; color: #1f2937; margin: 0; }
  .sheet { width: 277mm; min-height: 190mm; margin: 0 auto 10mm; padding: 8mm; border: 1px solid #e5e7eb;
    display: flex; flex-direction: column; page-break-after: always; background: #fff; }
  .sheet:last-child { page-break-after: auto; }
  .sheet-area { flex: 1; min-height: 0; display: flex; flex-direction: column; gap: 10px; }
  .draw { flex: 1; min-height: 0; display: flex; align-items: center; justify-content: center; }
  .draw svg { width: 100%; height: 100%; max-height: 150mm; }
  .title-block { display: flex; justify-content: space-between; align-items: baseline; border-top: 2px solid #1f2937;
    margin-top: 8px; padding-top: 6px; font-size: 11px; }
  .tb-proj { font-weight: 700; }
  .tb-name { color: #4b5563; }
  .tb-meta { font-family: ui-monospace, monospace; color: #6b7280; }
  h1 { font-size: 30px; margin: 0 0 2px; }
  .cover { padding: 6mm 0; }
  .cover-sub { color: #6b7280; margin-bottom: 24px; }
  .cover-cols { display: flex; gap: 40px; }
  h3 { font-size: 12px; text-transform: uppercase; letter-spacing: .05em; color: #6b7280; }
  table.sched { width: 100%; border-collapse: collapse; font-size: 11px; }
  table.sched td { padding: 3px 8px 3px 0; border-bottom: 1px solid #f1f5f9; }
  table.sched td.n { text-align: right; font-variant-numeric: tabular-nums; }
  table.sched tr.h td { font-weight: 600; border-bottom: 1px solid #e5e7eb; }
</style></head><body>${sheetHtml}</body></html>`
}
