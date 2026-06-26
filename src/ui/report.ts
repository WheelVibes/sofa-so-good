/**
 * Builds a printable HTML "design report" — apartment name, per-room areas +
 * total, a furniture shopping list with an approximate budget, and a hero
 * render. Opened in a new window so the user can print / save as PDF.
 */

import { buildAccessibilityReport } from '../analysis/accessibility'
import { buildDesignScore } from '../analysis/designScore'
import { buildHandoverChecklist } from '../analysis/handoverChecklist'
import { buildComplianceReport } from '../analysis/hdbCompliance'
import { buildRenoTimeline } from '../analysis/renoTimeline'
import { estimateRenovation } from '../analysis/renovationCost'
import { buildStairAdvisories } from '../analysis/stairConnectivity'
import { buildSuggestions } from '../analysis/suggestions'
import { ceilingStyleLabel } from '../apartment/ceiling/ceilingModel'
import { ROOMS } from '../apartment/constants'
import { findWallClipsByLevel } from '../collision/levelWallClips'
import { obbCorners } from '../collision/obb'
import { findItemOverlaps, itemFootprint } from '../collision/placement'
import { buildCollisionWalls } from '../collision/wallsFromState'
import { projectAllElevations } from '../elevation/projectElevation'
import { isFeatureEnabled } from '../features/featureFlags'
import { buildFfeSchedule } from '../ffe/ffeSchedule'
import { dimensionSvg } from '../floorplan/autoDimensionSvg'
import { diffWalls, diffWallsByLevel, type LevelWallDiff } from '../floorplan/demolitionPlan'
import { demolitionSvg } from '../floorplan/demolitionPlanSvg'
import {
  allPlanRooms,
  isMultiLevel,
  itemsOnLevel,
  levelAsPlan,
  planLevels,
} from '../floorplan/levels'
import { isDefaultPlan, planCollisionWalls } from '../floorplan/planGeometry'
import { buildSection } from '../floorplan/section'
import { sectionSvg } from '../floorplan/sectionSvg'
import type { FloorPlan } from '../floorplan/types'
import { planRoomArea, pointInRoom } from '../floorplan/types'
import { CATEGORY_COLORS } from '../furniture/categoryColors'
import { itemPrice } from '../furniture/furniturePrices'
import type { FurnitureCategory, FurnitureDef, FurnitureItem } from '../furniture/types'
import { FURNITURE_CATEGORIES } from '../furniture/types'
import { blockedDoorItems } from '../layout/clearance'
import { findNarrowGaps } from '../layout/walkway'
import { buildLightingPlan } from '../lighting2d/lightingPlan'
import { estimateRoomLux } from '../lighting2d/roomLux'
import { BUILTIN_MATERIALS } from '../materials/builtinCatalog'
import type { MeasurementAnnotation } from '../state/slices/measurementsSlice'
import { formatArea, formatDims, formatLength, type UnitSystem } from '../utils/measurement'
import { elevationCaption, elevationSvg } from './elevation/elevationSvg'
import { sectionSilhouettes } from './elevation/sectionFigure'
import { lightingPlanSvg, roomLuxTableHtml } from './lighting2d/lightingPlanSvg'
import {
  CAT_LABEL,
  ELEV_PRINT,
  esc,
  LIGHTING_PRINT,
  type ReportFinishes,
  SECTION_PRINT,
  sgd,
} from './report/reportShared'
import { REPORT_CSS } from './report/reportStyles'
import {
  designPalette,
  floorAreaByFinish,
  furnitureItemsByRoom,
  wallAreaByFinish,
} from './reportData'
import { reportPlanSvg } from './reportPlanSvg'

export type { ReportFinishes }

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
  baselinePlan?: FloorPlan,
): string {
  // Multi-storey fan-out (F13): on a multi-level plan every plan-derived
  // diagram (floor plan, dimensioned plan, hacking plan, lighting plan) renders
  // once per storey, captioned with the storey name; tables/schedules stay
  // unified. Single-storey plans keep the exact whole-plan output.
  const levels = planLevels(plan)
  const multi = isMultiLevel(plan)
  const storeyCap = (name: string) =>
    `<div style="font-size:11px;color:#6b7280;margin-bottom:4px">${esc(name)}</div>`

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
    const raw = id.startsWith('#') ? id : (BUILTIN_MATERIALS[id]?.swatch ?? null)
    // Only emit a validated colour into the `style="background:…"` — reject
    // anything else so a custom finish id can't inject CSS (S3, defense-in-depth).
    if (raw && /^#[0-9a-fA-F]{3,8}$|^(rgb|hsl)a?\([\d\s.,%/-]+\)$/.test(raw)) return raw
    return null
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
  // Show a ceiling-treatment column only when the feature is on and at least one
  // room actually has a non-flat ceiling (avoids an all-"Flat" column).
  const roomsAll = allPlanRooms(plan)
  const showCeiling =
    isFeatureEnabled('ceilingDesign') &&
    roomsAll.some((r) => r.ceiling && r.ceiling.style !== 'flat')
  const roomHeader = `<tr class="cat"><td>Room</td><td class="dim">Size</td><td class="num">Ceiling</td>${
    showCeiling ? '<td>Ceiling style</td>' : ''
  }<td class="num">Area</td></tr>`
  const roomRow = (r: (typeof plan.rooms)[number], ceilingDefault: number) => {
    const dims = !r.polygon && !r.extension ? formatDims(r.width, r.depth, units) : ''
    const height = formatLength(r.ceilingHeight ?? ceilingDefault, units)
    const ceilCell = showCeiling ? `<td>${esc(ceilingStyleLabel(r.ceiling))}</td>` : ''
    return `<tr><td>${esc(r.name)}</td><td class="dim">${dims}</td><td class="num">${esc(height)}</td>${ceilCell}<td class="num">${formatArea(planRoomArea(r), units)}</td></tr>`
  }
  // Multi-storey: group the room schedule by storey (a subhead row per level).
  const roomRows =
    roomHeader +
    (multi
      ? levels
          .map(
            (l) =>
              `<tr class="cat"><td colspan="${showCeiling ? 5 : 4}">${esc(l.name)}</td></tr>` +
              l.rooms.map((r) => roomRow(r, l.ceilingHeight ?? plan.ceilingHeight)).join(''),
          )
          .join('')
      : plan.rooms.map((r) => roomRow(r, plan.ceilingHeight)).join(''))
  const totalArea = roomsAll.reduce((s, r) => s + planRoomArea(r), 0)

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
  const footprintsOf = (list: FurnitureItem[]) =>
    list
      .map((it) => {
        const def = catalog[it.defId]
        // Guard defaultFootprint: a malformed def shouldn't crash the whole report.
        if (!def?.defaultFootprint) return null
        return { corners: obbCorners(itemFootprint(it, def)), fill: CATEGORY_COLORS[def.category] }
      })
      .filter((f): f is { corners: [number, number][]; fill: string } => f != null)
  // One captioned diagram per storey on multi-level plans (items filtered to
  // their storey; pinned annotations are ground-floor world coords).
  const planFigures = multi
    ? levels
        .map((level, i) => {
          const svg = reportPlanSvg(
            levelAsPlan(plan, level),
            i === 0 ? annotations : [],
            units,
            footprintsOf(itemsOnLevel(items, level.id)),
          )
          return svg ? `<div class="plan-wrap">${storeyCap(level.name)}${svg}</div>` : ''
        })
        .join('')
    : (() => {
        const svg = reportPlanSvg(plan, annotations, units, footprintsOf(items))
        return svg ? `<div class="plan-wrap">${svg}</div>` : ''
      })()
  // Legend: the furniture categories actually present, colour-keyed to the plan.
  const presentCats = FURNITURE_CATEGORIES.filter((c) =>
    items.some((it) => catalog[it.defId]?.category === c),
  )
  const planLegend =
    planFigures && presentCats.length > 0
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
  // Per-storey wall clips (F13/ML3): each item tests against its own level's
  // walls (`clipWalls` is the ground set; upper levels resolve their own).
  const wallClipCounts = countByName(
    hasItems ? findWallClipsByLevel(items, catalog, plan, {}, clipWalls) : [],
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
                    `<tr><td class="indent">${esc(itemName(g.a))} ↔ ${esc(gapPartner(g.b))} · ${esc(formatLength(g.gap, units))}</td></tr>`,
                )
                .join('')}</table>`
            : ''
        }</div>`

  // Design score — the aggregate 0–100 quality read (clearance / furnishing /
  // circulation / daylight / lighting) the in-app panel shows, so the handoff
  // report carries the same at-a-glance verdict + the actionable fixes.
  // Reuse the door-aware collision walls already computed for the clearance
  // section so the report's design score matches the in-app panel (which passes
  // live doors) instead of silently recomputing with all doors closed.
  const score = hasItems ? buildDesignScore(items, catalog, plan, { walls: clipWalls }) : null
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

  // Design suggestions (PARITY-SUGGESTIONS-SECTION) — the per-room "what to add /
  // improve" tips the in-app suggestions panel surfaces, carried into the printable
  // report. Reuses the same `buildSuggestions` rule engine: each plan room's furniture
  // categories are derived from the pieces whose footprint centre lands inside it
  // (mirroring DesignScorePanel), then run through the rule set. Rides the existing
  // `report` flag (additive section, no new analysis code). Skipped when the rules
  // produce nothing (e.g. a bare shell with no habitable rooms, or a fully-kitted home).
  const suggestionRooms = plan.rooms.map((r) => {
    const cats = new Set<string>()
    for (const it of items) {
      const def = catalog[it.defId]
      if (def && pointInRoom(r, it.position[0], it.position[1])) cats.add(def.category)
    }
    return { id: r.id, name: r.name, areaSqm: planRoomArea(r), itemCategories: [...cats] }
  })
  const suggestions = buildSuggestions({ rooms: suggestionRooms })
  // Group the flat suggestion list by room, preserving plan room order, so each room
  // reads as its own block of tips. A 'tip' (something missing/off) is flagged warn;
  // an 'idea' (optional styling nicety) is muted.
  const sugByRoom = new Map<string, typeof suggestions>()
  for (const s of suggestions) {
    const list = sugByRoom.get(s.roomId)
    if (list) list.push(s)
    else sugByRoom.set(s.roomId, [s])
  }
  const sugColor = (sev: string) => (sev === 'tip' ? '#b45309' : '#6b7280')
  const suggestionsSection =
    suggestions.length === 0
      ? ''
      : `<div class="room-cost">
      <h2>Design suggestions</h2>
      <div class="foot" style="margin-bottom:6px">${suggestions.length} idea${suggestions.length === 1 ? '' : 's'} to add or improve, room by room — guidance only.</div>
      ${plan.rooms
        .filter((r) => sugByRoom.has(r.id))
        .map((r) => {
          const list = sugByRoom.get(r.id)!
          return `<div class="ci-detail" style="margin-top:6px"><strong>${esc(r.name)}</strong>${list
            .map((s) => `<div style="color:${sugColor(s.severity)}">• ${esc(s.message)}</div>`)
            .join('')}</div>`
        })
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
    return it ? `Door (${formatLength(it.width, units)})` : id
  }
  const accessibilitySection =
    a11y.doors.length === 0 && a11y.rooms.length === 0
      ? ''
      : `<div class="room-cost">
      <h2>Accessibility</h2>
      <div class="${a11y.allPass ? 'ok' : 'warn'}">
        ${a11y.doorPassCount}/${a11y.doors.length} doors ≥ ${esc(formatLength(a11y.thresholds.door, units))} clear ·
        ${a11y.turnPassCount}/${a11y.rooms.length} rooms fit a ${esc(formatLength(a11y.thresholds.turn, units))} turning circle
      </div>${
        a11yFailDoors.length > 0
          ? `<div class="warn">Doorways below the accessible clear width:</div><table>${a11yFailDoors
              .map(
                (d) =>
                  `<tr><td class="indent">${esc(doorName(d.id))} — widen to ≥ ${esc(formatLength(a11y.thresholds.door, units))}</td></tr>`,
              )
              .join('')}</table>`
          : ''
      }${
        a11yFailRooms.length > 0
          ? `<div class="warn">Rooms too tight for a wheelchair turn:</div><table>${a11yFailRooms
              .map(
                (r) =>
                  `<tr><td class="indent">${esc(r.roomName)} — ${esc(formatLength(r.minDim, units))} min span</td></tr>`,
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

  // Dimensioned plan — an auto-generated running-dimension drawing (overall wall
  // lengths + per-room sizes), a pro 2D deliverable competitors auto-produce.
  // Multi-storey: one captioned drawing per storey with walls.
  const dimFigures = multi
    ? levels
        .filter((l) => Array.isArray(l.walls) && l.walls.length > 0)
        .map(
          (level) =>
            `<div class="plan-wrap">${storeyCap(level.name)}${dimensionSvg(
              levelAsPlan(plan, level),
              {
                palette: { ink: '#374151', faint: '#cbd5e1' },
                widthPx: 700,
                units,
              },
            )}</div>`,
        )
        .join('')
    : Array.isArray(plan.walls) && plan.walls.length > 0
      ? `<div class="plan-wrap">${dimensionSvg(plan, { palette: { ink: '#374151', faint: '#cbd5e1' }, widthPx: 700, units })}</div>`
      : ''
  const dimensionedPlanSection = dimFigures
    ? `<div class="elev-section"><h2>Dimensioned plan</h2>${dimFigures}</div>`
    : ''

  // Demolition / hacking plan — walls added or removed vs the as-loaded baseline
  // (template / saved plan). Only shown when the user actually changed walls.
  // Multi-storey (either side): each storey diffs against the SAME storey of
  // the baseline; storeys existing on only one side get a whole-storey callout.
  const DEMO_PALETTE = {
    kept: '#9ca3af',
    demolished: '#dc2626',
    added: '#16a34a',
    ink: '#374151',
  }
  const hackingMulti = baselinePlan != null && (multi || isMultiLevel(baselinePlan))
  const levelDiffs: LevelWallDiff[] = hackingMulti
    ? diffWallsByLevel(baselinePlan, plan).filter(
        (r) => r.diff.demolished.length > 0 || r.diff.added.length > 0,
      )
    : []
  const wallDiff = baselinePlan && !hackingMulti ? diffWalls(baselinePlan, plan) : null
  const hackingSummary = (demo: number, hackedM: number, added: number, addedM: number) =>
    `<div class="warn">${demo} wall${demo === 1 ? '' : 's'} hacked (${esc(formatLength(hackedM, units))}) · ${added} new (${esc(formatLength(addedM, units))}) vs the original layout — hacking needs HDB approval.</div>`
  const hackingSection = hackingMulti
    ? levelDiffs.length > 0
      ? `<div class="elev-section"><h2>Hacking &amp; new walls</h2>
      ${hackingSummary(
        levelDiffs.reduce((s, r) => s + r.diff.demolished.length, 0),
        levelDiffs.reduce((s, r) => s + r.diff.hackedLengthM, 0),
        levelDiffs.reduce((s, r) => s + r.diff.added.length, 0),
        levelDiffs.reduce((s, r) => s + r.diff.addedLengthM, 0),
      )}
      ${levelDiffs
        .map(
          (r) =>
            `<div class="plan-wrap">${storeyCap(r.levelName)}${
              r.wholeStorey
                ? `<div class="warn">${
                    r.wholeStorey === 'added'
                      ? 'Entire storey added — it does not exist in the original layout.'
                      : 'Entire storey removed — it existed only in the original layout.'
                  }</div>`
                : ''
            }${demolitionSvg(r.diff, { palette: DEMO_PALETTE, widthPx: 700 })}</div>`,
        )
        .join('')}</div>`
      : ''
    : wallDiff && (wallDiff.demolished.length > 0 || wallDiff.added.length > 0)
      ? `<div class="elev-section"><h2>Hacking &amp; new walls</h2>
      ${hackingSummary(wallDiff.demolished.length, wallDiff.hackedLengthM, wallDiff.added.length, wallDiff.addedLengthM)}
      <div class="plan-wrap">${demolitionSvg(wallDiff, {
        palette: DEMO_PALETTE,
        widthPx: 700,
      })}</div></div>`
      : ''

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
  // info) over the plan; a trust feature for the SG renovation workflow. On
  // multi-storey plans the stair-connectivity advisory (ML6b) joins the list:
  // any upper storey no staircase reaches gets a caution.
  const compliance = buildComplianceReport(plan)
  const stairAdvisories = buildStairAdvisories(plan, items, (id) => catalog[id])
  const allAdvisories = [...compliance.advisories, ...stairAdvisories]
  const cautionCount = compliance.cautionCount + stairAdvisories.length
  const compBadge = (sev: string) =>
    sev === 'permit' ? '#b91c1c' : sev === 'caution' ? '#b45309' : '#6b7280'
  const complianceSection =
    allAdvisories.length === 0
      ? ''
      : `<div class="room-cost">
      <h2>HDB compliance hints</h2>
      <div class="${compliance.permitCount > 0 ? 'warn' : 'ok'}">
        ${compliance.permitCount} permit-sensitive · ${cautionCount} caution — guidance only, confirm with HDB / your contractor.
      </div>
      ${allAdvisories
        .map(
          (a) =>
            `<div class="ci-detail" style="margin-top:6px"><span class="badge" style="background:${compBadge(a.severity)};color:#fff">${esc(a.severity)}</span> <strong>${esc(a.title)}</strong><br>${esc(a.detail)} <span style="color:#9ca3af">(${esc(a.cite)})</span></div>`,
        )
        .join('')}
    </div>`

  // Move-in / handover checklist (PARITY-MOVEIN-CHECKLIST) — a derived snagging +
  // key-handover punch-list grouped by room (per-kind defect checks), plus
  // appliance/utility activation items for the appliance categories actually
  // placed, plus the generic keys/meters/documents bucket. Pure
  // (analysis/handoverChecklist); rides the existing `report` flag (additive
  // section). Always renders — an empty plan still yields the generic group.
  const handover = buildHandoverChecklist(plan, items, catalog)
  const handoverSection = `<div class="room-cost">
      <h2>Move-in checklist</h2>
      <div class="foot" style="margin-bottom:6px">${handover.totalItems} item${handover.totalItems === 1 ? '' : 's'} to walk through on collection / handover — tick each off on site.</div>
      ${handover.groups
        .map(
          (g) =>
            `<div class="ci-detail" style="margin-top:6px"><strong>${esc(g.title)}</strong>${g.items
              .map((i) => `<div style="color:#374151">☐ ${esc(i.label)}</div>`)
              .join('')}</div>`,
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

  // Cross-section — a vertical cut through the middle of the plan (along Z),
  // with ground-floor furniture in the cut's room band drawn in elevation. The
  // companion to the wall elevations; degrades to the bare shell when empty.
  const section = buildSection(
    plan,
    { axis: 'z', at: (Array.isArray(plan.extent) ? plan.extent[1] : 0) / 2 },
    sectionSilhouettes(itemsOnLevel(items, levels[0]!.id), catalog),
  )
  const sectionSection = section.walls.length
    ? `<div class="elev-section"><h2>Section A–A</h2><div class="plan-wrap">${sectionSvg(section, {
        palette: SECTION_PRINT,
        widthPx: 700,
      })}</div></div>`
    : ''

  // Lighting plan — fixtures (from the light-emitter registry) plotted over the
  // walls + a schedule, plus a per-room lumen-method lux estimate vs the
  // recommended residential bands. Only when the design actually has lights.
  const lighting = hasItems ? buildLightingPlan(items, catalog) : { lights: [], schedule: [] }
  const roomLux = lighting.lights.length ? estimateRoomLux(plan, lighting.lights) : []
  // Multi-storey: one captioned diagram per lit storey (fixtures filtered to
  // their storey); the fixture schedule + lux table stay unified below.
  const lightingFigures = !lighting.lights.length
    ? ''
    : multi
      ? levels
          .filter((l) => itemsOnLevel(lighting.lights, l.id).length > 0)
          .map(
            (level) =>
              `<div class="plan-wrap">${storeyCap(level.name)}${lightingPlanSvg(
                levelAsPlan(plan, level),
                itemsOnLevel(lighting.lights, level.id),
                { palette: LIGHTING_PRINT },
              )}</div>`,
          )
          .join('')
      : `<div class="plan-wrap">${lightingPlanSvg(plan, lighting.lights, { palette: LIGHTING_PRINT })}</div>`
  const lightingSection = lighting.lights.length
    ? `<div class="elev-section"><h2>Lighting plan</h2>
        ${lightingFigures}
        <table style="margin-top:12px"><tr class="cat"><td>Fixture</td><td class="num">Qty</td><td class="num">Height</td><td class="num">Intensity</td></tr>${lighting.schedule
          .map(
            (r) =>
              `<tr><td>${esc(r.label)}</td><td class="num">×${r.count}</td><td class="num">${esc(formatLength(r.height, units))}</td><td class="num">${r.intensity} cd</td></tr>`,
          )
          .join('')}</table>
        ${roomLuxTableHtml(roomLux, units, { header: 'cat', num: 'num' })}
        ${roomLux.length ? `<div class="foot" style="margin-top:6px">Estimated average illuminance per room (lumen method, utilisation factor 0.45) vs recommended residential levels.</div>` : ''}</div>`
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

  // Only embed a validated data-image URL (defence-in-depth: matches
  // moodboard.renderHero so a future caller can't slip a javascript:/foreign URL
  // or HTML-breaking string into the src attribute).
  const hero =
    heroDataUrl && /^data:image\//i.test(heroDataUrl.trim())
      ? `<img class="hero" src="${esc(heroDataUrl)}" alt="render"/>`
      : ''
  const date = new Date().toLocaleDateString('en-SG', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(plan.name)} — Design Report</title>
<style>${REPORT_CSS}</style></head>
<body>
  <h1>${esc(plan.name)}</h1>
  <div class="sub">Interior design report · ${date} · ${roomsAll.length} ${roomsAll.length === 1 ? 'room' : 'rooms'} · ${formatArea(totalArea, units)} · ${items.length} furniture pieces</div>
  ${note?.trim() ? `<div class="note">${esc(note.trim())}</div>` : ''}
  ${hero}
  <div class="cols">
    <div class="col">
      <h2>Rooms &amp; areas</h2>
      <table>${roomRows}</table>
      <div class="total"><span>Total interior</span><span>${formatArea(totalArea, units)}</span></div>
      ${planFigures ? `${planFigures}${planLegend}` : ''}
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
  ${suggestionsSection}
  ${accessibilitySection}
  ${complianceSection}
  ${handoverSection}
  ${hackingSection}
  ${dimensionedPlanSection}
  ${elevationsSection}
  ${sectionSection}
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
