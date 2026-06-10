/**
 * Builds a printable HTML "design report" — apartment name, per-room areas +
 * total, a furniture shopping list with an approximate budget, and a hero
 * render. Opened in a new window so the user can print / save as PDF.
 */

import { buildAccessibilityReport } from '../analysis/accessibility'
import { buildDesignScore } from '../analysis/designScore'
import { buildComplianceReport } from '../analysis/hdbCompliance'
import { buildRenoTimeline } from '../analysis/renoTimeline'
import { estimateRenovation } from '../analysis/renovationCost'
import { ROOMS } from '../apartment/constants'
import { obbCorners } from '../collision/obb'
import { findItemOverlaps, findWallClips, itemFootprint } from '../collision/placement'
import { buildCollisionWalls } from '../collision/wallsFromState'
import { projectAllElevations } from '../elevation/projectElevation'
import { buildFfeSchedule } from '../ffe/ffeSchedule'
import { isDefaultPlan, planCollisionWalls } from '../floorplan/planGeometry'
import type { FloorPlan } from '../floorplan/types'
import { planRoomArea, planTotalArea } from '../floorplan/types'
import { CATEGORY_COLORS } from '../furniture/categoryColors'
import { itemPrice } from '../furniture/furniturePrices'
import type { FurnitureCategory, FurnitureDef, FurnitureItem } from '../furniture/types'
import { FURNITURE_CATEGORIES } from '../furniture/types'
import { blockedDoorItems } from '../layout/clearance'
import { findNarrowGaps } from '../layout/walkway'
import { buildLightingPlan } from '../lighting2d/lightingPlan'
import { BUILTIN_MATERIALS } from '../materials/builtinCatalog'
import type { MeasurementAnnotation } from '../state/slices/measurementsSlice'
import { formatArea, formatDims, formatLength, type UnitSystem } from '../utils/measurement'
import { type ElevationPalette, elevationCaption, elevationSvg } from './elevation/elevationSvg'
import { type LightingPalette, lightingPlanSvg } from './lighting2d/lightingPlanSvg'
import {
  designPalette,
  floorAreaByFinish,
  furnitureItemsByRoom,
  wallAreaByFinish,
} from './reportData'
import { reportPlanSvg } from './reportPlanSvg'

/** Print palette for elevations — fixed inks (the report window has its own CSS,
 *  not the app's CSS tokens). */
const ELEV_PRINT: ElevationPalette = {
  bg: '#f9fafb',
  stroke: '#374151',
  opening: '#93c5fd',
  item: '#d8c8b0',
  text: '#4b5563',
}
const LIGHTING_PRINT: LightingPalette = { wall: '#9ca3af', ink: '#374151', coverage: '#f59e0b' }

const CAT_LABEL: Record<FurnitureCategory, string> = {
  beds: 'Beds',
  seating: 'Seating',
  tables: 'Tables',
  storage: 'Storage',
  kitchen: 'Kitchen',
  bathroom: 'Bathroom',
  appliances: 'Appliances',
  lighting: 'Lighting',
  decor: 'Decor',
  textiles: 'Textiles',
  outdoor: 'Outdoor',
  electronics: 'Electronics',
  kids: 'Baby & Kids',
  laundry: 'Laundry',
  others: 'Others',
}

// Escapes for BOTH text and attribute contexts (the report embeds names/notes/
// swatches inside style="…" + title="…"), so quotes must be escaped too — a `"`
// in a user-controlled value (a material swatch, a room name) would otherwise
// break out of the attribute and inject markup.
const esc = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c,
  )
const sgd = (n: number) => `$${Math.round(n).toLocaleString('en-SG')}`

/** Per-room floor + wall finish material ids (the store's `finishes` slice). */
export interface ReportFinishes {
  floor: Record<string, string>
  walls: Record<string, string>
}

export function buildReportHtml(
  plan: FloorPlan,
  items: FurnitureItem[],
  catalog: Record<string, FurnitureDef>,
  heroDataUrl: string | null,
  units: UnitSystem = 'metric',
  finishes?: ReportFinishes,
  note?: string,
  annotations: MeasurementAnnotation[] = [],
  budgetTarget?: number | null,
): string {
  // Finishes-by-room section: floor + wall material names per non-external room.
  // Material ids resolve to friendly names via the builtin catalog (DLC/custom
  // ids fall back to the raw id). Only rendered when finishes are supplied.
  const matName = (id: string | undefined): string =>
    id ? (BUILTIN_MATERIALS[id]?.name ?? id) : '—'
  // Chip colour for a finish id (custom colour → itself; builtin → its swatch;
  // unknown/unset → none). Lets the finishes table read at a glance like the
  // palette chips do.
  const matSwatch = (id: string | undefined): string | null => {
    if (!id) return null
    if (id.startsWith('#')) return id
    return BUILTIN_MATERIALS[id]?.swatch ?? null
  }
  const matCell = (id: string | undefined): string => {
    const sw = matSwatch(id)
    const chip = sw ? `<span class="msw" style="background:${esc(sw)}"></span>` : ''
    return `${chip}${esc(matName(id))}`
  }
  // Iterate the ACTIVE plan's rooms (not the default ROOMS constant) so custom
  // floor plans show their own rooms + finishes; skip only the default plan's
  // external (non-finishable) ledges. Finishes are keyed by room id.
  const floorOf = finishes?.floor as Record<string, string> | undefined
  const wallOf = finishes?.walls as Record<string, string> | undefined
  const finishRows = finishes
    ? plan.rooms
        .filter((r) => !ROOMS[r.id as keyof typeof ROOMS]?.external)
        .map(
          (r) =>
            `<tr><td>${esc(r.name)}</td><td>${matCell(floorOf?.[r.id])}</td><td>${matCell(wallOf?.[r.id])}</td></tr>`,
        )
        .join('')
    : ''
  // Per-finish floor + wall areas — shared by the flooring/wall schedules AND the
  // renovation estimate below (computed once).
  const floorAreas = finishes ? floorAreaByFinish(plan, floorOf) : []
  const wallAreas = finishes ? wallAreaByFinish(plan, wallOf, plan.ceilingHeight) : []
  // Flooring schedule: total floor area per finish — the "how much to order"
  // procurement view (only when finishes are supplied + at least one finish set).
  const flooringRows = floorAreas
    .map(
      (f) =>
        `<tr><td>${matCell(f.id)}</td><td class="num">${esc(formatArea(f.area, units))}</td></tr>`,
    )
    .join('')
  // Wall-finish schedule: gross wall area per finish (perimeter × ceiling height),
  // the paint/tile procurement counterpart to the flooring schedule.
  const wallRows = wallAreas
    .map(
      (f) =>
        `<tr><td>${matCell(f.id)}</td><td class="num">${esc(formatArea(f.area, units))}</td></tr>`,
    )
    .join('')
  // Rooms (skip external ledges with ~0 interior use are still listed). Plain
  // rectangular rooms show their W×D dimensions (a room schedule detail); L-shape
  // / polygon rooms omit them (a bounding box would mislead) — area only.
  const roomHeader =
    '<tr class="cat"><td>Room</td><td class="dim">Size</td><td class="num">Ceiling</td><td class="num">Area</td></tr>'
  const roomRows =
    roomHeader +
    plan.rooms
      .map((r) => {
        const dims = !r.polygon && !r.extension ? formatDims(r.width, r.depth, units) : ''
        const height = formatLength(r.ceilingHeight ?? plan.ceilingHeight, units)
        return `<tr><td>${esc(r.name)}</td><td class="dim">${dims}</td><td class="num">${esc(height)}</td><td class="num">${formatArea(planRoomArea(r), units)}</td></tr>`
      })
      .join('')
  const totalArea = planTotalArea(plan)

  // Furniture grouped by category.
  const byCat = new Map<
    FurnitureCategory,
    Map<string, { name: string; count: number; each: number }>
  >()
  let budget = 0
  for (const it of items) {
    const def = catalog[it.defId]
    if (!def) continue
    const variant = typeof it.props['variant'] === 'string' ? it.props['variant'] : undefined
    const each = itemPrice(def, def.category, variant)
    budget += each
    if (!byCat.has(def.category)) byCat.set(def.category, new Map())
    const m = byCat.get(def.category)!
    const lineKey = variant ? `${it.defId}::${variant}` : it.defId
    const ex = m.get(lineKey)
    if (ex) ex.count += 1
    else m.set(lineKey, { name: def.name, count: 1, each })
  }
  const furnitureRows = FURNITURE_CATEGORIES.filter((c) => byCat.has(c))
    .map((c) => {
      const lines = [...byCat.get(c)!.values()].sort((a, b) => b.each * b.count - a.each * a.count)
      const sub = lines.reduce((s, l) => s + l.each * l.count, 0)
      return (
        `<tr class="cat"><td>${CAT_LABEL[c]}</td><td class="num">${sgd(sub)}</td></tr>` +
        lines
          .map(
            (l) =>
              `<tr><td class="indent">${esc(l.name)}${l.count > 1 ? ` ×${l.count}` : ''}</td><td class="num">${sgd(l.each * l.count)}</td></tr>`,
          )
          .join('')
      )
    })
    .join('')

  // Furniture by room — each room's pieces (grouped + priced), attributed to the
  // room containing each item's footprint centre. The room-by-room furnishing
  // list a client/installer handoff wants.
  const roomBreakdown = furnitureItemsByRoom(plan, items, catalog)
  const roomCostRows = roomBreakdown
    .map(
      (r) =>
        `<tr class="cat"><td>${esc(r.name)} · ${r.count} item${r.count === 1 ? '' : 's'}${r.area > 0 ? ` · ${formatArea(r.area, units)}` : ''}</td><td class="num">${sgd(r.total)}</td></tr>` +
        r.lines
          .map(
            (l) =>
              `<tr><td class="indent">${esc(l.name)}${l.count > 1 ? ` ×${l.count}` : ''}</td><td class="num">${sgd(l.each * l.count)}</td></tr>`,
          )
          .join(''),
    )
    .join('')

  // Material palette ("style board"): the distinct floor + wall finishes in use,
  // as colour chips. A quick at-a-glance read of the scheme for a client.
  const palette = designPalette(finishes)
  const paletteChips = palette
    .map(
      (p) =>
        `<div class="chip"><span class="sw" style="background:${esc(p.swatch)}"></span><span class="cn">${esc(p.name)}</span></div>`,
    )
    .join('')

  // Furniture footprints (top-down OBB corners) for the plan diagram, so the
  // report's floor plan shows a furnished layout — "where everything goes".
  const planFootprints = items
    .map((it) => {
      const def = catalog[it.defId]
      // Guard defaultFootprint: a malformed def shouldn't crash the whole report.
      if (!def?.defaultFootprint) return null
      return { corners: obbCorners(itemFootprint(it, def)), fill: CATEGORY_COLORS[def.category] }
    })
    .filter((f): f is { corners: [number, number][]; fill: string } => f != null)
  const planSvg = reportPlanSvg(plan, annotations, units, planFootprints)
  // Legend: the furniture categories actually present, colour-keyed to the plan.
  const presentCats = FURNITURE_CATEGORIES.filter((c) =>
    items.some((it) => catalog[it.defId]?.category === c),
  )
  const planLegend =
    planSvg && presentCats.length > 0
      ? `<div class="plan-legend">${presentCats
          .map(
            (c) =>
              `<span class="lg-item"><span class="lg-sw" style="background:${CATEGORY_COLORS[c]}"></span>${CAT_LABEL[c]}</span>`,
          )
          .join('')}</div>`
      : ''

  // Clearance & fit: flag furniture sitting in a doorway path, two pieces
  // overlapping, or a piece embedded in a wall — the same checks the in-app
  // "Checks" overlay runs. A handoff report should say plainly whether the
  // layout is buildable.
  const hasItems = items.length > 0
  const hasDoors = (plan.openings ?? []).some((o) => o.kind === 'door')
  const itemName = (id: string) => {
    const it = items.find((i) => i.id === id)
    return it?.label ?? (it && catalog[it.defId]?.name) ?? 'Item'
  }
  const countByName = (ids: string[]) => {
    const m = new Map<string, number>()
    for (const id of ids) m.set(itemName(id), (m.get(itemName(id)) ?? 0) + 1)
    return m
  }
  const blockedCounts = countByName(
    hasDoors && hasItems ? blockedDoorItems(items, catalog, plan) : [],
  )
  const overlaps = hasItems ? findItemOverlaps(items, catalog) : []
  // Whole-plan collision walls; default door states are fine for a static report.
  // Guard a partial/hand-built plan with no `walls` array (skips the wall-clip check).
  const clipWalls = isDefaultPlan(plan)
    ? buildCollisionWalls({})
    : Array.isArray(plan.walls)
      ? planCollisionWalls(plan, {})
      : []
  const wallClipCounts = countByName(
    hasItems && clipWalls.length > 0 ? findWallClips(items, catalog, clipWalls) : [],
  )
  const narrowGaps = hasItems ? findNarrowGaps(items, catalog, plan) : []
  const gapPartner = (b: string) => (b.startsWith('wall:') ? 'a wall' : itemName(b))
  const anyIssue =
    blockedCounts.size > 0 ||
    overlaps.length > 0 ||
    wallClipCounts.size > 0 ||
    narrowGaps.length > 0
  const countRows = (m: Map<string, number>) =>
    [...m.entries()]
      .map(([name, n]) => `<tr><td class="indent">${esc(name)}${n > 1 ? ` ×${n}` : ''}</td></tr>`)
      .join('')
  const clearanceSection = !hasItems
    ? ''
    : !anyIssue
      ? `<div class="room-cost"><h2>Clearance &amp; fit</h2><div class="ok">✓ Everything fits — no blocked doorways, overlaps, pieces in a wall, or tight walkways.</div></div>`
      : `<div class="room-cost"><h2>Clearance &amp; fit</h2>${
          blockedCounts.size > 0
            ? `<div class="warn">${blockedCounts.size} item${blockedCounts.size === 1 ? '' : 's'} block a doorway:</div><table>${countRows(blockedCounts)}</table>`
            : ''
        }${
          overlaps.length > 0
            ? `<div class="warn">${overlaps.length} pair${overlaps.length === 1 ? '' : 's'} of items overlap:</div><table>${overlaps
                .map(
                  (o) =>
                    `<tr><td class="indent">${esc(itemName(o.a))} ↔ ${esc(itemName(o.b))}</td></tr>`,
                )
                .join('')}</table>`
            : ''
        }${
          wallClipCounts.size > 0
            ? `<div class="warn">${wallClipCounts.size} item${wallClipCounts.size === 1 ? '' : 's'} sit inside a wall:</div><table>${countRows(wallClipCounts)}</table>`
            : ''
        }${
          narrowGaps.length > 0
            ? `<div class="warn">${narrowGaps.length} narrow walkway${narrowGaps.length === 1 ? '' : 's'} (under 90 cm):</div><table>${narrowGaps
                .map(
                  (g) =>
                    `<tr><td class="indent">${esc(itemName(g.a))} ↔ ${esc(gapPartner(g.b))} · ${(g.gap * 100).toFixed(0)} cm</td></tr>`,
                )
                .join('')}</table>`
            : ''
        }</div>`

  // Design score — the aggregate 0–100 quality read (clearance / furnishing /
  // circulation / daylight / lighting) the in-app panel shows, so the handoff
  // report carries the same at-a-glance verdict + the actionable fixes.
  const score = hasItems ? buildDesignScore(items, catalog, plan) : null
  const gradeColor = (g: string) =>
    g === 'A' || g === 'B' ? '#047857' : g === 'C' ? '#b45309' : '#b91c1c'
  const barColor = (n: number) => (n >= 80 ? '#047857' : n >= 60 ? '#b45309' : '#b91c1c')
  const issueColor = (s: string) =>
    s === 'critical' ? '#b91c1c' : s === 'warning' ? '#b45309' : '#6b7280'
  const designScoreSection = !score
    ? ''
    : `<div class="room-cost ds">
      <h2>Design score</h2>
      <div class="ds-head">
        <span class="ds-grade" style="background:${gradeColor(score.grade)}">${score.grade}</span>
        <span class="ds-num">${score.overall}<span class="ds-den">/100</span></span>
        <span class="ds-meta">${score.itemCount} pieces · ${score.roomCount} ${score.roomCount === 1 ? 'room' : 'rooms'}</span>
      </div>
      ${score.categories
        .map(
          (c) =>
            `<div class="ds-cat">
        <div class="ds-cat-row"><span>${esc(c.label)}</span><span class="ds-cat-score">${c.score}</span></div>
        <div class="score-bar"><div class="score-fill" style="width:${c.score}%;background:${barColor(c.score)}"></div></div>
        ${c.issues
          .map(
            (i) =>
              `<div class="ds-issue" style="color:${issueColor(i.severity)}">${esc(i.message)}</div>`,
          )
          .join('')}
      </div>`,
        )
        .join('')}
    </div>`

  // Accessibility / universal-design — plan-level door-width + turning-circle
  // check (BCA Code on Accessibility rule of thumb). Plan-only, so it shows even
  // for an unfurnished shell; skipped when the plan has no doors or rooms.
  const a11y = buildAccessibilityReport(plan)
  const a11yFailDoors = a11y.doors.filter((d) => !d.pass)
  const a11yFailRooms = a11y.rooms.filter((r) => !r.pass)
  const doorName = (id: string) => {
    const it = plan.openings?.find((o) => o.id === id)
    return it ? `Door (${(it.width * 100).toFixed(0)} cm)` : id
  }
  const accessibilitySection =
    a11y.doors.length === 0 && a11y.rooms.length === 0
      ? ''
      : `<div class="room-cost">
      <h2>Accessibility</h2>
      <div class="${a11y.allPass ? 'ok' : 'warn'}">
        ${a11y.doorPassCount}/${a11y.doors.length} doors ≥ ${Math.round(a11y.thresholds.door * 100)} cm clear ·
        ${a11y.turnPassCount}/${a11y.rooms.length} rooms fit a ${a11y.thresholds.turn} m turning circle
      </div>${
        a11yFailDoors.length > 0
          ? `<div class="warn">Doorways below the accessible clear width:</div><table>${a11yFailDoors
              .map(
                (d) =>
                  `<tr><td class="indent">${esc(doorName(d.id))} — widen to ≥ ${Math.round(a11y.thresholds.door * 100)} cm</td></tr>`,
              )
              .join('')}</table>`
          : ''
      }${
        a11yFailRooms.length > 0
          ? `<div class="warn">Rooms too tight for a wheelchair turn:</div><table>${a11yFailRooms
              .map(
                (r) =>
                  `<tr><td class="indent">${esc(r.roomName)} — ${r.minDim.toFixed(2)} m min span</td></tr>`,
              )
              .join('')}</table>`
          : ''
      }${
        a11y.allPass
          ? '<div class="ok">✓ Step-free routes, accessible doors and turning space throughout.</div>'
          : ''
      }</div>`

  // Renovation estimate — the finishes counterpart to the furniture budget:
  // flooring + painting/wall supply+install over the per-finish areas, at
  // indicative SG rates. Only when finishes are supplied + something to cost.
  const reno = estimateRenovation(floorAreas, wallAreas)
  const renoLineRows = (rows: ReturnType<typeof estimateRenovation>['floors']) =>
    rows
      .map(
        (l) =>
          `<tr><td>${matCell(l.id)}</td><td class="num">${esc(formatArea(l.area, units))}</td><td class="num">${sgd(l.rate)}/m²</td><td class="num">${sgd(l.cost)}</td></tr>`,
      )
      .join('')
  const renovationSection =
    reno.floors.length === 0 && reno.walls.length === 0
      ? ''
      : `<div class="room-cost">
      <h2>Renovation estimate</h2>
      <table>
        <tr class="cat"><td>Finish</td><td class="num">Area</td><td class="num">Rate</td><td class="num">Est. cost</td></tr>
        ${renoLineRows(reno.floors)}${renoLineRows(reno.walls)}
      </table>
      <div class="total"><span>Finishes subtotal</span><span>${sgd(reno.subtotal)}</span></div>
      <div class="subtotal"><span>Furniture + finishes</span><span>${sgd(budget + reno.subtotal)}</span></div>
      <div class="foot" style="margin-top:6px">Indicative supply &amp; install only — excludes hacking/disposal, false ceilings, carpentry, M&amp;E and contractor margin.</div>
    </div>`

  // Renovation timeline — an estimated phase schedule (hacking → … → handover)
  // scaled by floor area + room count, the way SG IDs present a project plan.
  const timeline = buildRenoTimeline(plan)
  const timelineSection =
    timeline.phases.length === 0
      ? ''
      : `<div class="room-cost">
      <h2>Renovation timeline</h2>
      <div class="subtotal"><span>Estimated duration</span><span>${timeline.totalWeeks} weeks (${timeline.totalDays} working days)</span></div>
      <table>
        <tr class="cat"><td>Phase</td><td class="num">Days</td><td style="width:45%">Schedule</td></tr>
        ${timeline.phases
          .map((p) => {
            const left = (p.startDay / timeline.totalDays) * 100
            const w = Math.max(2, (p.days / timeline.totalDays) * 100)
            return `<tr><td>${esc(p.name)}</td><td class="num">${p.days}</td><td><div style="position:relative;height:10px;background:#eef2f7;border-radius:3px"><div style="position:absolute;left:${left}%;width:${w}%;top:0;bottom:0;background:#6b7f9e;border-radius:3px"></div></div></td></tr>`
          })
          .join('')}
      </table>
      <div class="foot" style="margin-top:6px">Indicative schedule (SG 6-day work week); phases shown sequential — actual trades may overlap.</div>
    </div>`

  // HDB renovation compliance hints — rule-based advisories (permit / caution /
  // info) over the plan; a trust feature for the SG renovation workflow.
  const compliance = buildComplianceReport(plan)
  const compBadge = (sev: string) =>
    sev === 'permit' ? '#b91c1c' : sev === 'caution' ? '#b45309' : '#6b7280'
  const complianceSection =
    compliance.advisories.length === 0
      ? ''
      : `<div class="room-cost">
      <h2>HDB compliance hints</h2>
      <div class="${compliance.permitCount > 0 ? 'warn' : 'ok'}">
        ${compliance.permitCount} permit-sensitive · ${compliance.cautionCount} caution — guidance only, confirm with HDB / your contractor.
      </div>
      ${compliance.advisories
        .map(
          (a) =>
            `<div class="ci-detail" style="margin-top:6px"><span class="badge" style="background:${compBadge(a.severity)};color:#fff">${esc(a.severity)}</span> <strong>${esc(a.title)}</strong><br>${esc(a.detail)} <span style="color:#9ca3af">(${esc(a.cite)})</span></div>`,
        )
        .join('')}
    </div>`

  // Wall elevations — the vertical drawings, only for walls that actually carry
  // furniture or openings (skip the many bare structural segments).
  const elevations = hasItems
    ? projectAllElevations(plan, items, catalog).filter(
        (e) => e.length > 0 && e.height > 0 && (e.items.length > 0 || e.openings.length > 0),
      )
    : []
  const elevationsSection = elevations.length
    ? `<div class="elev-section"><h2>Wall elevations</h2><div class="elev-grid">${elevations
        .map(
          (e, i) =>
            `<figure class="elev-fig"><figcaption>${esc(elevationCaption(e, i, units))}</figcaption>${elevationSvg(
              e,
              { palette: ELEV_PRINT, units },
            )}</figure>`,
        )
        .join('')}</div></div>`
    : ''

  // Lighting plan — fixtures (from the light-emitter registry) plotted over the
  // walls + a schedule. Only when the design actually has lights.
  const lighting = hasItems ? buildLightingPlan(items, catalog) : { lights: [], schedule: [] }
  const lightingSection = lighting.lights.length
    ? `<div class="elev-section"><h2>Lighting plan</h2>
        <div class="plan-wrap">${lightingPlanSvg(plan, lighting.lights, { palette: LIGHTING_PRINT })}</div>
        <table style="margin-top:12px"><tr class="cat"><td>Fixture</td><td class="num">Qty</td><td class="num">Height</td><td class="num">Intensity</td></tr>${lighting.schedule
          .map(
            (r) =>
              `<tr><td>${esc(r.label)}</td><td class="num">×${r.count}</td><td class="num">${esc(formatLength(r.height, units))}</td><td class="num">${r.intensity} cd</td></tr>`,
          )
          .join('')}</table></div>`
    : ''

  // FF&E schedule — the item-level procurement table (room · item · source · SKU
  // · size · qty · pricing), the central designer hand-off. Full width.
  const ffe = hasItems ? buildFfeSchedule(plan, items, catalog) : []
  const dim = (n: number) => esc(formatLength(n, units))
  const ffeSection = ffe.length
    ? `<div class="elev-section"><h2>FF&amp;E schedule</h2>
        <table class="ffe"><tr class="cat"><td>Room</td><td>Item</td><td>Source</td><td>SKU</td><td>Size (W×D×H)</td><td class="num">Qty</td><td class="num">Unit</td><td class="num">Total</td></tr>${ffe
          .map(
            (r) =>
              `<tr><td>${esc(r.room)}</td><td>${esc(r.name)}</td><td>${esc(r.source)}</td><td>${esc(r.sku || '—')}</td><td>${dim(r.w)} × ${dim(r.d)} × ${dim(r.h)}</td><td class="num">${r.qty}</td><td class="num">${sgd(r.unit)}</td><td class="num">${sgd(r.total)}</td></tr>`,
          )
          .join('')}<tr class="cat"><td colspan="7">Total</td><td class="num">${sgd(
          ffe.reduce((s, r) => s + r.total, 0),
        )}</td></tr></table></div>`
    : ''

  const hero = heroDataUrl ? `<img class="hero" src="${heroDataUrl}" alt="render"/>` : ''
  const date = new Date().toLocaleDateString('en-SG', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(plan.name)} — Design Report</title>
<style>
  * { box-sizing: border-box; }
  body { font: 13px/1.5 -apple-system, Segoe UI, Roboto, sans-serif; color: #1f2937; margin: 0; padding: 32px; }
  h1 { font-size: 22px; margin: 0 0 2px; }
  .sub { color: #6b7280; margin-bottom: 18px; }
  .hero { width: 100%; max-height: 360px; object-fit: cover; border-radius: 8px; margin-bottom: 20px; border: 1px solid #e5e7eb; }
  .cols { display: flex; gap: 28px; align-items: flex-start; }
  .col { flex: 1; }
  h2 { font-size: 13px; text-transform: uppercase; letter-spacing: .05em; color: #6b7280; border-bottom: 1px solid #e5e7eb; padding-bottom: 4px; }
  table { width: 100%; border-collapse: collapse; }
  td { padding: 2px 0; }
  td.num { text-align: right; font-variant-numeric: tabular-nums; color: #374151; }
  td.dim { color: #9ca3af; font-variant-numeric: tabular-nums; font-size: 12px; padding-left: 12px; }
  .msw { display: inline-block; width: 10px; height: 10px; border-radius: 2px; margin-right: 6px; vertical-align: middle; border: 1px solid rgba(0,0,0,.12); }
  tr.cat td { font-weight: 600; padding-top: 8px; }
  td.indent { padding-left: 12px; color: #4b5563; }
  .total { display: flex; justify-content: space-between; font-weight: 700; font-size: 15px; border-top: 2px solid #1f2937; margin-top: 8px; padding-top: 6px; }
  .subtotal { display: flex; justify-content: space-between; font-size: 12px; color: #6b7280; margin-top: 3px; }
  .note { background: #f9fafb; border-left: 3px solid #d1d5db; padding: 8px 12px; border-radius: 4px; margin-bottom: 16px; color: #374151; white-space: pre-wrap; }
  .room-cost { margin-top: 24px; max-width: 360px; }
  .plan-wrap { margin-top: 16px; border: 1px solid #e5e7eb; border-radius: 6px; padding: 10px; background: #fff; }
  .palette { margin-top: 24px; }
  .chips { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 8px; }
  .chip { display: flex; align-items: center; gap: 7px; border: 1px solid #e5e7eb; border-radius: 999px; padding: 4px 10px 4px 4px; }
  .chip .sw { width: 20px; height: 20px; border-radius: 50%; border: 1px solid rgba(0,0,0,.12); flex: none; }
  .chip .cn { font-size: 12px; color: #374151; }
  .plan-svg { width: 100%; height: auto; max-height: 280px; display: block; }
  .plan-legend { display: flex; flex-wrap: wrap; gap: 4px 12px; margin-top: 8px; font-size: 11px; color: #6b7280; }
  .lg-item { display: inline-flex; align-items: center; gap: 5px; }
  .lg-sw { width: 10px; height: 10px; border-radius: 2px; display: inline-block; opacity: 0.7; }
  .ok { color: #047857; font-weight: 600; margin-top: 6px; }
  .warn { color: #b45309; font-weight: 600; margin-top: 6px; }
  .badge { display: inline-block; padding: 1px 6px; border-radius: 4px; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.02em; }
  .ds-head { display: flex; align-items: center; gap: 10px; margin: 6px 0 10px; }
  .ds-grade { display: inline-flex; align-items: center; justify-content: center; width: 34px; height: 34px; border-radius: 50%; color: #fff; font-weight: 700; flex: none; }
  .ds-num { font-size: 20px; font-weight: 700; }
  .ds-den { font-size: 12px; color: #9ca3af; font-weight: 400; }
  .ds-meta { font-size: 11px; color: #9ca3af; margin-left: auto; }
  .ds-cat { margin-top: 8px; break-inside: avoid; }
  .ds-cat-row { display: flex; justify-content: space-between; font-size: 12px; font-weight: 600; color: #374151; }
  .ds-cat-score { font-variant-numeric: tabular-nums; }
  .score-bar { height: 5px; background: #eef2f7; border-radius: 3px; overflow: hidden; margin: 3px 0; }
  .score-fill { height: 100%; }
  .ds-issue { font-size: 11px; margin-top: 2px; }
  .foot { margin-top: 24px; color: #9ca3af; font-size: 11px; }
  /* Keep sections + tables whole across PDF pages, and never strand a heading. */
  .room-cost, .palette, .plan-wrap, .note { break-inside: avoid; }
  .elev-section { margin-top: 24px; }
  .elev-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-top: 12px; }
  .elev-fig { margin: 0; border: 1px solid #e5e7eb; border-radius: 6px; padding: 8px; background: #fff; break-inside: avoid; }
  .elev-fig figcaption { font-size: 11px; color: #6b7280; margin-bottom: 4px; }
  .elev-fig svg { width: 100%; height: auto; display: block; max-height: 220px; }
  table.ffe { font-size: 11px; }
  table.ffe td { padding: 3px 8px 3px 0; border-bottom: 1px solid #f1f5f9; vertical-align: top; }
  table.ffe tr.cat td { font-weight: 600; border-bottom: 1px solid #e5e7eb; }
  tr, .chip, .lg-item, .total { break-inside: avoid; }
  h2 { break-after: avoid; }
  @media print {
    body { padding: 0; }
    .hero { max-height: 300px; break-inside: avoid; }
    .cols { gap: 20px; }
  }
</style></head>
<body>
  <h1>${esc(plan.name)}</h1>
  <div class="sub">Interior design report · ${date} · ${plan.rooms.length} ${plan.rooms.length === 1 ? 'room' : 'rooms'} · ${formatArea(totalArea, units)} · ${items.length} furniture pieces</div>
  ${note?.trim() ? `<div class="note">${esc(note.trim())}</div>` : ''}
  ${hero}
  <div class="cols">
    <div class="col">
      <h2>Rooms &amp; areas</h2>
      <table>${roomRows}</table>
      <div class="total"><span>Total interior</span><span>${formatArea(totalArea, units)}</span></div>
      ${planSvg ? `<div class="plan-wrap">${planSvg}</div>${planLegend}` : ''}
    </div>
    <div class="col">
      <h2>Furniture &amp; budget</h2>
      <table>${furnitureRows || '<tr><td>No furniture placed.</td></tr>'}</table>
      <div class="total"><span>Estimated total</span><span>${sgd(budget)}</span></div>
      ${
        budgetTarget != null && budgetTarget > 0
          ? `<div class="subtotal"><span>Budget target</span><span>${sgd(budgetTarget)} · ${
              budget > budgetTarget
                ? `${sgd(budget - budgetTarget)} over`
                : `${sgd(budgetTarget - budget)} under`
            }</span></div>`
          : ''
      }
      ${
        totalArea > 0.01 && budget > 0
          ? `<div class="subtotal"><span>Furnishing per ${units === 'imperial' ? 'ft²' : 'm²'}</span><span>${sgd(
              budget / (units === 'imperial' ? totalArea * 10.7639 : totalArea),
            )}</span></div>`
          : ''
      }
    </div>
  </div>
  ${
    roomCostRows
      ? `<div class="room-cost">
      <h2>Furniture by room</h2>
      <table><tr class="cat"><td>Room</td><td class="num">Estimated</td></tr>${roomCostRows}</table>
    </div>`
      : ''
  }
  ${
    finishRows
      ? `<div class="room-cost">
      <h2>Finishes by room</h2>
      <table><tr class="cat"><td>Room</td><td>Floor</td><td>Walls</td></tr>${finishRows}</table>
    </div>`
      : ''
  }
  ${
    flooringRows
      ? `<div class="room-cost">
      <h2>Flooring schedule</h2>
      <table><tr class="cat"><td>Finish</td><td class="num">Floor area</td></tr>${flooringRows}</table>
    </div>`
      : ''
  }
  ${
    wallRows
      ? `<div class="room-cost">
      <h2>Wall finish schedule</h2>
      <table><tr class="cat"><td>Finish</td><td class="num">Wall area</td></tr>${wallRows}</table>
    </div>`
      : ''
  }
  ${renovationSection}
  ${timelineSection}
  ${ffeSection}
  ${clearanceSection}
  ${designScoreSection}
  ${accessibilitySection}
  ${complianceSection}
  ${elevationsSection}
  ${lightingSection}
  ${
    paletteChips
      ? `<div class="palette">
      <h2>Material palette</h2>
      <div class="chips">${paletteChips}</div>
    </div>`
      : ''
  }
  <div class="foot">Areas are interior floor area. Costs are an approximate mid-market retail estimate (SGD); finishes, renovation and labour are not included. Generated by the HDB design sandbox.</div>
</body></html>`
}
