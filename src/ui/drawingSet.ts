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
import { diffWalls } from '../floorplan/demolitionPlan'
import { demolitionSvg } from '../floorplan/demolitionPlanSvg'
import { buildSection } from '../floorplan/section'
import { sectionSvg } from '../floorplan/sectionSvg'
import type { FloorPlan } from '../floorplan/types'
import { planRoomArea, planTotalArea } from '../floorplan/types'
import { CATEGORY_COLORS } from '../furniture/categoryColors'
import type { FurnitureDef, FurnitureItem } from '../furniture/types'
import { buildLightingPlan } from '../lighting2d/lightingPlan'
import { formatArea, formatLength, type UnitSystem } from '../utils/measurement'
import { type ElevationPalette, elevationCaption, elevationSvg } from './elevation/elevationSvg'
import { type LightingPalette, lightingPlanSvg } from './lighting2d/lightingPlanSvg'
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
  /** Sheet number, e.g. "A-1". */
  num: string
  name: string
  /** Inner HTML for the sheet's drawing area. */
  body: string
}

/** Build the full drawing-set HTML document. */
export function buildDrawingSetHtml(
  plan: FloorPlan,
  items: FurnitureItem[],
  catalog: Record<string, FurnitureDef>,
  units: UnitSystem = 'metric',
  baselinePlan?: FloorPlan,
): string {
  const date = new Date().toLocaleDateString('en-SG', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
  const sheets: Sheet[] = []

  // A-1 · Floor plan (furnished footprints under the walls, like the report).
  const planFootprints = items
    .map((it) => {
      const def = catalog[it.defId]
      if (!def?.defaultFootprint) return null
      return { corners: obbCorners(itemFootprint(it, def)), fill: CATEGORY_COLORS[def.category] }
    })
    .filter((f): f is { corners: [number, number][]; fill: string } => f != null)
  const planSvg = reportPlanSvg(plan, [], units, planFootprints)
  sheets.push({ num: 'A-1', name: 'Floor plan', body: `<div class="draw">${planSvg}</div>` })

  // A-2… · One elevation per wall that carries furniture or openings.
  const elevations = projectAllElevations(plan, items, catalog).filter(
    (e) => e.length > 0 && e.height > 0 && (e.items.length > 0 || e.openings.length > 0),
  )
  elevations.forEach((e, i) => {
    sheets.push({
      num: `A-${2 + i}`,
      name: elevationCaption(e, i, units),
      body: `<div class="draw">${elevationSvg(e, { palette: ELEV_PRINT, units })}</div>`,
    })
  })

  // Lighting plan.
  const lighting = buildLightingPlan(items, catalog)
  let next = 2 + elevations.length
  if (lighting.lights.length) {
    sheets.push({
      num: `A-${next}`,
      name: 'Lighting plan',
      body: `<div class="draw">${lightingPlanSvg(plan, lighting.lights, { palette: LIGHTING_PRINT })}</div>
        <table class="sched"><tr class="h"><td>Fixture</td><td class="n">Qty</td><td class="n">Height</td><td class="n">Intensity</td></tr>${lighting.schedule
          .map(
            (r) =>
              `<tr><td>${esc(r.label)}</td><td class="n">×${r.count}</td><td class="n">${esc(formatLength(r.height, units))}</td><td class="n">${r.intensity} cd</td></tr>`,
          )
          .join('')}</table>`,
    })
    next += 1
  }

  // Dimensioned plan — overall + per-room running dimensions.
  if (Array.isArray(plan.walls) && plan.walls.length > 0) {
    sheets.push({
      num: `A-${next}`,
      name: 'Dimensioned plan',
      body: `<div class="draw">${dimensionSvg(plan, {
        palette: { ink: '#374151', faint: '#cbd5e1' },
        widthPx: 900,
      })}</div>`,
    })
    next += 1
  }

  // Cross-section — a vertical cut through the middle of the plan (along Z).
  const section = buildSection(plan, { axis: 'z', at: plan.extent[1] / 2 })
  if (section.walls.length > 0) {
    sheets.push({
      num: `A-${next}`,
      name: 'Section A–A',
      body: `<div class="draw">${sectionSvg(section, {
        palette: {
          wall: '#9ca3af',
          floor: '#374151',
          ceil: '#9ca3af',
          opening: '#93c5fd',
          ink: '#4b5563',
        },
        widthPx: 900,
      })}</div>`,
    })
    next += 1
  }

  // Demolition / hacking plan — only when walls changed vs the as-loaded baseline.
  if (baselinePlan) {
    const wallDiff = diffWalls(baselinePlan, plan)
    if (wallDiff.demolished.length > 0 || wallDiff.added.length > 0) {
      sheets.push({
        num: `A-${next}`,
        name: 'Demolition & new walls',
        body: `<div class="draw">${demolitionSvg(wallDiff, {
          palette: { kept: '#9ca3af', demolished: '#dc2626', added: '#16a34a', ink: '#374151' },
          widthPx: 900,
        })}</div>`,
      })
      next += 1
    }
  }

  // FF&E schedule.
  const ffe = buildFfeSchedule(plan, items, catalog)
  if (ffe.length) {
    const dim = (n: number) => esc(formatLength(n, units))
    sheets.push({
      num: `A-${next}`,
      name: 'FF&E schedule',
      body: `<table class="sched"><tr class="h"><td>Room</td><td>Item</td><td>Source</td><td>SKU</td><td>Size (W×D×H)</td><td class="n">Qty</td></tr>${ffe
        .map(
          (r) =>
            `<tr><td>${esc(r.room)}</td><td>${esc(r.name)}</td><td>${esc(r.source)}</td><td>${esc(r.sku || '—')}</td><td>${dim(r.w)} × ${dim(r.d)} × ${dim(r.h)}</td><td class="n">${r.qty}</td></tr>`,
        )
        .join('')}</table>`,
    })
    next += 1
  }

  // Cover sheet (A-0) — built last so it can index the rest.
  const roomRows = plan.rooms
    .map(
      (r) =>
        `<tr><td>${esc(r.name)}</td><td class="n">${esc(formatArea(planRoomArea(r), units))}</td></tr>`,
    )
    .join('')
  const indexRows = sheets.map((s) => `<tr><td>${s.num}</td><td>${esc(s.name)}</td></tr>`).join('')
  const cover: Sheet = {
    num: 'A-0',
    name: 'Cover',
    body: `<div class="cover">
      <h1>${esc(plan.name)}</h1>
      <div class="cover-sub">Interior design drawing set · ${date}</div>
      <div class="cover-cols">
        <div><h3>Rooms &amp; areas</h3><table class="sched"><tr class="h"><td>Room</td><td class="n">Area</td></tr>${roomRows}<tr class="h"><td>Total</td><td class="n">${esc(formatArea(planTotalArea(plan), units))}</td></tr></table></div>
        <div><h3>Sheet index</h3><table class="sched"><tr class="h"><td>No.</td><td>Sheet</td></tr><tr><td>A-0</td><td>Cover</td></tr>${indexRows}</table></div>
      </div>
    </div>`,
  }
  const ordered = [cover, ...sheets]

  const sheetHtml = ordered
    .map(
      (s) =>
        `<section class="sheet"><div class="sheet-area">${s.body}</div>
        <div class="title-block"><span class="tb-proj">${esc(plan.name)}</span><span class="tb-name">${esc(s.name)}</span><span class="tb-meta">${esc(date)} · ${s.num}</span></div>
      </section>`,
    )
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
