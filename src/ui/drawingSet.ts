/**
 * Construction "drawing set" (a.k.a. plan set) — a paginated, title-blocked
 * document with one drawing per sheet: cover, floor plan, each wall elevation,
 * the lighting plan, the FF&E schedule and the door & window schedule.
 * Distinct from the one-page summary
 * `report.ts`: this is the formal multi-sheet submission designers print/PDF for
 * builders + clients (RoomSketcher / Chief Architect "plan sets"). Reuses every
 * pure renderer built for the report so the two stay in lock-step. Opened in a
 * new window by `openDrawingSet.ts`.
 */
import {
  assignOpeningMarks,
  buildOpeningSchedule,
  openingRoomsLabel,
  openingStyleMaterialLabel,
} from '../analysis/openingSchedule'
import { obbCorners } from '../collision/obb'
import { itemFootprint } from '../collision/placement'
import { projectAllElevations } from '../elevation/projectElevation'
import { DEFAULT_DRAWING_SET_TEMPLATE, type DrawingSetTemplate } from '../export/drawingSetTemplate'
import { customMetaColumns } from '../export/ffeCsv'
import { isFeatureEnabled } from '../features/featureFlags'
import { buildFfeSchedule } from '../ffe/ffeSchedule'
import { dimensionSvg } from '../floorplan/autoDimensionSvg'
import { diffWalls, diffWallsByLevel } from '../floorplan/demolitionPlan'
import { demolitionSvg } from '../floorplan/demolitionPlanSvg'
import {
  PAGE_MARGIN_MM,
  PAPER_PRINTABLE_MM,
  paperDimensionsMm,
  pickDrawingScale,
} from '../floorplan/drawingScale'
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
import { permitNotes } from '../floorplan/permitNotes'
import { buildPlumbingPlan, type PlumbingPoint } from '../floorplan/plumbingPlan'
import { plumbingSvg } from '../floorplan/plumbingPlanSvg'
import { buildReflectedCeilingPlan } from '../floorplan/rcp'
import { rcpSvg } from '../floorplan/rcpSvg'
import type { RoomFinishMaps } from '../floorplan/roomFinishes'
import { buildSection } from '../floorplan/section'
import { sectionSvg } from '../floorplan/sectionSvg'
import type { FloorPlan } from '../floorplan/types'
import { planBounds, planRoomArea } from '../floorplan/types'
import { CATEGORY_COLORS } from '../furniture/categoryColors'
import type { FurnitureDef, FurnitureItem } from '../furniture/types'
import { buildLightingPlan } from '../lighting2d/lightingPlan'
import { estimateRoomLux } from '../lighting2d/roomLux'
import { BUILTIN_MATERIALS } from '../materials/builtinCatalog'
import type { CalloutSheet, DrawingCallout } from '../state/slices/drawingCalloutsSlice'
import { formatArea, formatLength, type UnitSystem } from '../utils/measurement'
import { carpentrySvg } from './carpentrySheetSvg'
import { collectCarpentrySheets } from './carpentrySheets'
import { type DrawingLayerVisibility, drawingLayerOn as layerOn } from './drawingLayers'
import { type ElevationPalette, elevationCaption, elevationSvg } from './elevation/elevationSvg'
import { sectionSilhouettes } from './elevation/sectionFigure'
import { finishScheduleHtml } from './finishScheduleHtml'
import {
  type LightingPalette,
  lightingPlanSvg,
  roomLuxTableHtml,
} from './lighting2d/lightingPlanSvg'
import { sgd } from './report/reportShared'
import { reportPlanSvg } from './reportPlanSvg'

const ELEV_PRINT: ElevationPalette = {
  bg: '#f9fafb',
  stroke: '#374151',
  opening: '#93c5fd',
  item: '#d8c8b0',
  text: '#4b5563',
}
const LIGHTING_PRINT: LightingPalette = { wall: '#9ca3af', ink: '#374151', coverage: '#f59e0b' }
const RCP_PRINT = {
  wall: '#9ca3af',
  ink: '#374151',
  symbol: '#7c3aed',
  zone: '#0d9488',
  dim: '#2563eb',
}

const esc = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c,
  )

/**
 * Print-oriented display string for a possibly-long ITEM-META product URL
 * (host + path, no protocol/query) — the drawing set's FF&E sheet is a
 * fixed-width printed page (not a scrollable table like the report/CSV), so a
 * full URL would blow out the column and wrap awkwardly on paper. The CSV
 * export (`export/ffeCsv.ts`) remains the reference copy of the untouched
 * URL; this is display-only.
 */
function shortUrl(raw: string, max = 34): string {
  if (!raw) return ''
  let display = raw
  try {
    const u = new URL(raw)
    display = `${u.hostname.replace(/^www\./, '')}${u.pathname}`.replace(/\/$/, '')
  } catch {
    // Not a valid absolute URL — fall back to truncating the raw string.
  }
  return display.length > max ? `${display.slice(0, max - 1)}…` : display
}

/** Provenance of a MEP sheet's points (MEP layer, G1 PR5): `'persisted'` when
 *  drawn from the user's own authored `electricalPoints`/`plumbingPoints`
 *  (heights are real — the sheet carries "as designed" wording), `'heuristic'`
 *  when derived from the furniture-layout fallback (`mepSuggest.ts`, no
 *  authored heights — the sheet carries the existing "indicative, verify on
 *  site" caveat). Bundled with the points array (rather than a 13th/14th
 *  positional `buildDrawingSetHtml` param) per the MEP layer plan. */
interface MepPointsInput<T> {
  points: T[]
  source: 'persisted' | 'heuristic'
}

interface Sheet {
  /** Sheet number, e.g. "A-1" — assigned sequentially once all sheets exist. */
  num?: string
  name: string
  /** Inner HTML for the sheet's drawing area. */
  body: string
  /** Which callout group targets this sheet (used to inject callout SVG). */
  calloutGroup?: CalloutSheet
  /** Title-block scale label, e.g. "1:50" (locked, print-true — TODO G2) or
   *  "NTS" (not-to-scale: schedules, cover). Every sheet gets one. */
  scaleLabel: string
  /** True for a top-down plan-view sheet (floor plan / dimensioned / demolition /
   *  electrical / plumbing / lighting) — these get the north indicator (TODO G5). */
  topDown?: boolean
}

/** Buffer (metres) added on both axes before picking a nominal scale ratio, to
 *  absorb each SVG builder's own internal padding/legend/dimension-strip
 *  margins (which vary per sheet type, ~0.4–2m) without under-shooting the
 *  page budget. The buffer only affects WHICH ratio is picked — the actual
 *  print-true mm sizing always uses each builder's own exact internal
 *  geometry (`printMmPerM`), never this buffer. */
const SCALE_PICK_BUFFER_M = 2.5

/** Pick + label the nominal scale ratio for a plan-bearing sheet of the given
 *  real-world extent (metres), against the chosen paper size + orientation
 *  (user-customizable — TODO G2 follow-up; defaults 'a4'/'landscape'). */
function planScale(
  w: number,
  d: number,
  paperSize: DrawingSetTemplate['paperSize'],
  orientation: DrawingSetTemplate['orientation'],
): { label: string; mmPerM: number } {
  const printableMm = PAPER_PRINTABLE_MM[`${paperSize}-${orientation}`]
  const s = pickDrawingScale(
    { w: w + SCALE_PICK_BUFFER_M, d: d + SCALE_PICK_BUFFER_M },
    printableMm,
  )
  return {
    label: `${s.label} @ ${paperSize.toUpperCase()} ${orientation.toUpperCase()}`,
    mmPerM: s.mmPerM,
  }
}

/** Buffer (metres) added around a carpentry piece before picking its scale —
 *  much smaller than `SCALE_PICK_BUFFER_M` (that one budgets a whole floor
 *  plan's legend/margin strips; a joinery piece only needs room for its own
 *  nested dimension rows, ~0.3–0.5 m). */
const CARPENTRY_BUFFER_M = 0.4

/** Pick + label the locked scale for a carpentry sheet (TODO G8) — finer than
 *  the whole-plan sheets since a single piece is far smaller than a floor
 *  plan. The elevation + section sit side-by-side on one sheet, so the width
 *  budget is HALF the printable width (each view gets its own half); the
 *  height budget is the full printable height (one row). */
function carpentryScale(
  wM: number,
  hM: number,
  dM: number,
  paperSize: DrawingSetTemplate['paperSize'],
  orientation: DrawingSetTemplate['orientation'],
): { label: string; mmPerM: number } {
  const printableMm = PAPER_PRINTABLE_MM[`${paperSize}-${orientation}`]
  const halfWidth = { width: printableMm.width / 2, height: printableMm.height }
  const s = pickDrawingScale(
    { w: Math.max(wM, dM) + CARPENTRY_BUFFER_M, d: hM + CARPENTRY_BUFFER_M },
    halfWidth,
  )
  return {
    label: `${s.label} @ ${paperSize.toUpperCase()} ${orientation.toUpperCase()}`,
    mmPerM: s.mmPerM,
  }
}

/** Elevation sheet grouping thresholds (TODO H6 — a 4-room HDB flat produces
 *  ~20 one-per-wall elevation sheets, most of them a bare wall with nothing to
 *  build from; group the low-content ones per professional practice). A wall
 *  with 0 items AND 0 openings is dropped entirely (noted on the sheet index
 *  + the cover's general notes, never silently); a SHORT wall (below this
 *  length) with at most this many items — and no openings, which always earn
 *  their own full sheet — is grouped several-per-sheet instead of one-per-
 *  sheet. A wall with cabinetry (>1 item) or any opening always keeps its own
 *  full sheet. */
const MINOR_WALL_MAX_LENGTH_M = 1.2
const MINOR_WALL_MAX_ITEMS = 1
/** 2×2 grid — up to this many minor walls share one sheet. */
const MINOR_WALL_GROUP_SIZE = 4

/** Pick + label the locked scale for a GROUPED minor-wall elevation cell
 *  (TODO H6) — several elevations share one sheet in a 2×2 grid, so each
 *  cell's budget is a QUARTER of the printable area (half width, half
 *  height), sized to the largest wall in that particular group. */
function minorElevationScale(
  wM: number,
  hM: number,
  paperSize: DrawingSetTemplate['paperSize'],
  orientation: DrawingSetTemplate['orientation'],
): { label: string; mmPerM: number } {
  const printableMm = PAPER_PRINTABLE_MM[`${paperSize}-${orientation}`]
  const quarter = { width: printableMm.width / 2, height: printableMm.height / 2 }
  const s = pickDrawingScale({ w: wM + CARPENTRY_BUFFER_M, d: hM + CARPENTRY_BUFFER_M }, quarter)
  return {
    label: `${s.label} @ ${paperSize.toUpperCase()} ${orientation.toUpperCase()}`,
    mmPerM: s.mmPerM,
  }
}

/** "Not to scale" — for schedules/cover, which carry no scaled projection. */
const NTS = 'NTS'

/** A small top-down north-arrow glyph for plan-view sheets, rotated to match
 *  the app's global North orientation (`orientationDeg` — the same value the
 *  2D plan compass and 3D nav compass read, `compassHeading.ts`). Absolutely
 *  positioned in the sheet's top-right corner. */
function northIndicatorSvg(orientationDeg: number): string {
  return (
    `<div style="position:absolute;top:2mm;right:2mm;width:9mm;height:9mm;` +
    `transform:rotate(${(-orientationDeg).toFixed(1)}deg);pointer-events:none">` +
    `<svg viewBox="0 0 24 24" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">` +
    `<circle cx="12" cy="12" r="11" fill="#ffffff" fill-opacity="0.85" stroke="#374151" stroke-width="1"/>` +
    `<path d="M12 3 L16 14 L12 11 L8 14 Z" fill="#374151"/>` +
    `<text x="12" y="21" font-size="7" font-weight="700" fill="#374151" text-anchor="middle" font-family="-apple-system,Segoe UI,Roboto,sans-serif">N</text>` +
    `</svg></div>`
  )
}

/** Small storey note rendered above a sheet's drawing (print inks). */
const storeyNote = (text: string) =>
  `<div style="color:#b45309;font-weight:600;font-size:12px">${esc(text)}</div>`

/** Provenance note rendered above an electrical/plumbing sheet's drawing (MEP
 *  layer, G1 PR5): a neutral grey "as designed" note for persisted points, or
 *  the pre-existing amber "indicative, verify on site" caveat (`warn=true`)
 *  for the furniture-layout heuristic fallback — same visual language as the
 *  demolition sheet's `storeyNote` (amber = "pay attention on site"). */
const mepProvenanceNote = (text: string, warn = false) =>
  `<div style="color:${warn ? '#b45309' : '#6b7280'};font-weight:600;font-size:12px">${esc(text)}</div>`

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
  electrical?: MepPointsInput<ElectricalPoint>,
  plumbing?: MepPointsInput<PlumbingPoint>,
  finishes?: RoomFinishMaps,
  layers?: DrawingLayerVisibility,
  callouts?: DrawingCallout[],
  /** User-editable handover metadata (TODO G5) — project/client identity,
   *  drawn-by/checked-by, revision. Defaults to the generic empty template. */
  template: DrawingSetTemplate = DEFAULT_DRAWING_SET_TEMPLATE,
  /** Global North orientation in degrees (`orientationDeg`, same value the 2D
   *  plan compass reads) — drives the north indicator on plan-view sheets. */
  orientationDeg = 0,
  /** Draw the setting-out datum + running dimensions on the dimensioned-plan
   *  sheet, plus tile setting-out crosses on the floor-plan sheet
   *  (`settingOutDims` flag, TODO G3). Default false — existing callers are
   *  unaffected. */
  showSettingOut = false,
  /** Append a "Carpentry — <item>" sheet (dimensioned front elevation + one
   *  section) per distinct placed parametric piece (`carpentrySheets` flag,
   *  TODO G8). Default false — existing callers are unaffected. */
  showCarpentry = false,
  /** Append the reflected ceiling plan sheet(s) (`rcpSheet` flag, TODO H4).
   *  Default false — existing callers are unaffected. */
  showRcp = false,
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
  // Tile setting-out crosses (G3) only make sense alongside the finishes
  // they refer to — a note pointing at "the floor finish" with no finishes
  // sheet on the set would be a dangling reference.
  const showTileMarks = showSettingOut && layerOn(layers, 'finishes') && !!finishes
  // On-plan D/W mark callouts (H1-F) only make sense alongside the schedule
  // they cross-reference — same "don't show a dangling reference" rule as
  // the tile marks above.
  const showOpeningMarks = layerOn(layers, 'openingSchedule')
  // Assign D/W marks ONCE over the whole plan (every storey, ground first) so
  // each per-level FLOOR-PLAN sheet's on-plan callouts use the same continuous
  // numbering the door/window schedule sheet does — otherwise an upper-storey
  // opening (drawn from a stripped `levelAsPlan`) would restart at D1/W1 and
  // disagree with the schedule that types it D2/W2 (multi-storey fix).
  const openingMarkMap = assignOpeningMarks(plan)
  for (const level of levels) {
    const levelPlan = levelAsPlan(plan, level)
    const [pw, pd] = planBounds(levelPlan)
    const scale = planScale(pw, pd, template.paperSize, template.orientation)
    const planSvg = reportPlanSvg(
      levelPlan,
      [],
      units,
      footprintsOf(itemsOnLevel(items, level.id)),
      scale.mmPerM,
      showTileMarks,
      showOpeningMarks,
      openingMarkMap,
    )
    sheets.push({
      name: cap('Floor plan', level),
      body: `<div class="draw">${planSvg}</div>${northIndicatorSvg(orientationDeg)}`,
      calloutGroup: 'floor-plan',
      scaleLabel: scale.label,
      topDown: true,
    })
  }

  // Wall elevations (TODO H6 grouping): a wall with 0 items AND 0 openings is
  // dropped entirely (never printed as a bare-wall sheet — noted below the
  // sheet index instead); a SHORT low-content wall (no openings, ≤1 item) is
  // grouped several-per-sheet (2×2 grid) rather than one-per-sheet; every
  // other wall (cabinetry, i.e. >1 item, or any opening) keeps its own full
  // sheet. Wall numbering ("Wall N") is assigned over ALL content-bearing
  // walls in their original order, whether they end up full or grouped, so a
  // number never repeats across the two kinds of sheet.
  let minorWallsOmitted = 0
  if (layerOn(layers, 'elevations')) {
    const allElevations = projectAllElevations(plan, items, catalog)
    const withContent = allElevations
      .map((e, i) => ({ e, i }))
      .filter(
        ({ e }) => e.length > 0 && e.height > 0 && (e.items.length > 0 || e.openings.length > 0),
      )
    minorWallsOmitted = allElevations.length - withContent.length
    const isMinor = (e: (typeof withContent)[number]['e']) =>
      e.length < MINOR_WALL_MAX_LENGTH_M &&
      e.openings.length === 0 &&
      e.items.length <= MINOR_WALL_MAX_ITEMS
    const full = withContent.filter(({ e }) => !isMinor(e))
    const minor = withContent.filter(({ e }) => isMinor(e))

    full.forEach(({ e, i }) => {
      const scale = planScale(e.length, e.height, template.paperSize, template.orientation)
      sheets.push({
        name: elevationCaption(e, i, units),
        body: `<div class="draw">${elevationSvg(e, { palette: ELEV_PRINT, units, printMmPerM: scale.mmPerM })}</div>`,
        calloutGroup: 'elevations',
        scaleLabel: scale.label,
      })
    })

    // Grouped minor-wall sheets — up to `MINOR_WALL_GROUP_SIZE` (2×2) per
    // sheet, one shared scale per sheet (sized to the largest wall in THAT
    // group so nothing overflows its grid cell).
    for (let g = 0; g < minor.length; g += MINOR_WALL_GROUP_SIZE) {
      const group = minor.slice(g, g + MINOR_WALL_GROUP_SIZE)
      const maxLen = Math.max(...group.map(({ e }) => e.length))
      const maxH = Math.max(...group.map(({ e }) => e.height))
      const scale = minorElevationScale(maxLen, maxH, template.paperSize, template.orientation)
      const cells = group
        .map(
          ({ e, i }) =>
            `<div class="minor-cell"><div class="minor-cap">${esc(elevationCaption(e, i, units))}</div>` +
            `<div class="draw">${elevationSvg(e, { palette: ELEV_PRINT, units, printMmPerM: scale.mmPerM })}</div></div>`,
        )
        .join('')
      sheets.push({
        name: `Minor wall elevations (${g / MINOR_WALL_GROUP_SIZE + 1})`,
        body: `<div class="minor-grid">${cells}</div>`,
        calloutGroup: 'elevations',
        scaleLabel: scale.label,
      })
    }
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
      const levelPlan = levelAsPlan(plan, level)
      const [pw, pd] = planBounds(levelPlan)
      const scale = planScale(pw, pd, template.paperSize, template.orientation)
      const svg = lightingPlanSvg(levelPlan, itemsOnLevel(lighting.lights, level.id), {
        palette: LIGHTING_PRINT,
        printMmPerM: scale.mmPerM,
      })
      sheets.push({
        name: cap('Lighting plan', level),
        body: `<div class="draw">${svg}</div>${northIndicatorSvg(orientationDeg)}
        ${i === lit.length - 1 ? lightSched : ''}`,
        calloutGroup: 'lighting',
        scaleLabel: scale.label,
        topDown: true,
      })
    })
  }

  // Reflected ceiling plan (TODO H4, `rcpSheet` flag) — canonical drawing #4:
  // per-room false-ceiling/bulkhead zones with drop heights, ceiling-mounted
  // fixture positions dimensioned off the nearest walls, aircon points marked
  // for cross-reference. Reuses the SAME lighting-plan fixture data (filtered
  // to the ceiling-mounted subset) and the SAME electrical points the
  // electrical plan draws. Unlike the lighting/electrical sheets (which only
  // print for a storey that actually has fixtures/points), the RCP prints for
  // every storey that has rooms — every room carries a ceiling-zone note
  // (even a plain flat one) that's useful regardless of whether it also has
  // fixtures.
  if (layerOn(layers, 'rcp') && showRcp) {
    const rcpLevels = levels.filter((level) => levelAsPlan(plan, level).rooms.length > 0)
    rcpLevels.forEach((level) => {
      const levelPlan = levelAsPlan(plan, level)
      const levelFixtures = itemsOnLevel(lighting.lights, level.id)
      const levelElectrical = itemsOnLevel(electrical?.points ?? [], level.id)
      const rcp = buildReflectedCeilingPlan(levelPlan, levelFixtures, levelElectrical)
      const [pw, pd] = planBounds(levelPlan)
      const scale = planScale(pw, pd, template.paperSize, template.orientation)
      sheets.push({
        name: cap('Reflected ceiling plan', level),
        body: `<div class="draw">${rcpSvg(levelPlan, rcp, {
          palette: RCP_PRINT,
          widthPx: 900,
          printMmPerM: scale.mmPerM,
        })}</div>${northIndicatorSvg(orientationDeg)}`,
        calloutGroup: 'rcp',
        scaleLabel: scale.label,
        topDown: true,
      })
    })
  }

  // Dimensioned plan — overall + per-room running dimensions, per storey.
  if (layerOn(layers, 'dimensions')) {
    for (const level of levels) {
      if (!Array.isArray(level.walls) || level.walls.length === 0) continue
      const levelPlan = levelAsPlan(plan, level)
      const [pw, pd] = planBounds(levelPlan)
      const scale = planScale(pw, pd, template.paperSize, template.orientation)
      sheets.push({
        name: cap('Dimensioned plan', level),
        body: `<div class="draw">${dimensionSvg(levelPlan, {
          palette: { ink: '#374151', faint: '#cbd5e1', datum: '#b91c1c' },
          widthPx: 900,
          units,
          printMmPerM: scale.mmPerM,
          settingOut: showSettingOut,
        })}</div>${northIndicatorSvg(orientationDeg)}`,
        calloutGroup: 'dimensions',
        scaleLabel: scale.label,
        topDown: true,
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
    const scale = planScale(
      section.length,
      section.height,
      template.paperSize,
      template.orientation,
    )
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
        printMmPerM: scale.mmPerM,
      })}</div>`,
      calloutGroup: 'section',
      scaleLabel: scale.label,
    })
  }

  // Electrical / power & data plan — one diagram sheet per wired storey; the
  // unified point schedule rides on the last electrical sheet. Prefers the
  // user's own persisted `electricalPoints` (MEP layer, G1 PR5 — "as
  // designed", real authored mount heights) over the furniture-layout
  // heuristic fallback (`electrical.source` tells the caller which it got —
  // `openDrawingSet.ts` only falls back to the heuristic when the persisted
  // array is empty).
  if (layerOn(layers, 'electrical') && electrical && electrical.points.length > 0) {
    const elec = buildElectricalPlan(plan, electrical.points)
    const elecSched = `<table class="sched"><tr class="h"><td>Point</td><td class="n">Qty</td></tr>${elec.schedule
      .map((r) => `<tr><td>${esc(r.label)}</td><td class="n">×${r.count}</td></tr>`)
      .join('')}</table>`
    const wired = levels.filter((l) => itemsOnLevel(elec.points, l.id).length > 0)
    const note =
      electrical.source === 'persisted'
        ? mepProvenanceNote('Points as designed — heights in mm AFFL.')
        : mepProvenanceNote('Indicative — derived from the furniture layout; verify on site.', true)
    wired.forEach((level, i) => {
      const levelPlan = levelAsPlan(plan, level)
      const levelElec = buildElectricalPlan(levelPlan, itemsOnLevel(elec.points, level.id))
      const [pw, pd] = planBounds(levelPlan)
      const scale = planScale(pw, pd, template.paperSize, template.orientation)
      sheets.push({
        name: cap('Electrical plan', level),
        body: `${note}<div class="draw">${electricalSvg(levelPlan, levelElec, {
          palette: { wall: '#9ca3af', ink: '#374151', symbol: '#2563eb' },
          widthPx: 900,
          printMmPerM: scale.mmPerM,
          // BSJ-3: the lighting-switching schematic (circuit tags + legend +
          // controlled-light markers) rides the electrical sheet only when the
          // `switchCircuits` pro flag is on (forced off in Simple mode).
          ...(isFeatureEnabled('switchCircuits')
            ? { lights: itemsOnLevel(lighting.lights, level.id) }
            : {}),
        })}</div>${northIndicatorSvg(orientationDeg)}
        ${i === wired.length - 1 ? elecSched : ''}`,
        calloutGroup: 'electrical',
        scaleLabel: scale.label,
        topDown: true,
      })
    })
  }

  // Plumbing plan — one diagram sheet per plumbed storey; the unified
  // schedule rides on the last. Same persisted-preferred / heuristic-fallback
  // routing as the electrical plan above.
  if (layerOn(layers, 'plumbing') && plumbing && plumbing.points.length > 0) {
    const plumb = buildPlumbingPlan(plan, plumbing.points)
    const plumbSched = `<table class="sched"><tr class="h"><td>Point</td><td class="n">Qty</td></tr>${plumb.schedule
      .map((r) => `<tr><td>${esc(r.label)}</td><td class="n">×${r.count}</td></tr>`)
      .join('')}</table>`
    const plumbed = levels.filter((l) => itemsOnLevel(plumb.points, l.id).length > 0)
    const note =
      plumbing.source === 'persisted'
        ? mepProvenanceNote('Points as designed — heights in mm AFFL.')
        : mepProvenanceNote('Indicative — derived from the furniture layout; verify on site.', true)
    plumbed.forEach((level, i) => {
      const levelPlan = levelAsPlan(plan, level)
      const levelPlumb = buildPlumbingPlan(levelPlan, itemsOnLevel(plumb.points, level.id))
      const [pw, pd] = planBounds(levelPlan)
      const scale = planScale(pw, pd, template.paperSize, template.orientation)
      sheets.push({
        name: cap('Plumbing plan', level),
        body: `${note}<div class="draw">${plumbingSvg(levelPlan, levelPlumb, {
          palette: { wall: '#9ca3af', ink: '#374151', symbol: '#0891b2' },
          widthPx: 900,
          printMmPerM: scale.mmPerM,
        })}</div>${northIndicatorSvg(orientationDeg)}
        ${i === plumbed.length - 1 ? plumbSched : ''}`,
        calloutGroup: 'plumbing',
        scaleLabel: scale.label,
        topDown: true,
      })
    })
  }

  // Finishes schedule — per-room floor + wall + ceiling material callouts
  // (whole home), with quantities (floor/wall-net-of-openings/ceiling area),
  // keyed material codes, accent-wall callouts, and per-code totals — the
  // contractor-grade spec a builder prices from (G4). Shared HTML renderer
  // with `report.ts`'s "Finishes by room" section so the two never drift.
  if (layerOn(layers, 'finishes') && finishes) {
    const nameOf = (id: string) => BUILTIN_MATERIALS[id]?.name ?? id
    const schedule = buildFinishSchedule(plan, finishes, nameOf)
    const body = finishScheduleHtml(schedule, units)
    if (body) {
      sheets.push({
        name: 'Finishes schedule',
        body,
        calloutGroup: 'finishes',
        scaleLabel: NTS,
      })
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
        const rowLevel = levels.find((l) => l.name === row.levelName)
        const [pw, pd] = rowLevel ? planBounds(levelAsPlan(plan, rowLevel)) : planBounds(plan)
        const scale = planScale(pw, pd, template.paperSize, template.orientation)
        sheets.push({
          name: `Demolition & new walls — ${row.levelName}`,
          body: `${note}<div class="draw">${demolitionSvg(row.diff, {
            palette: {
              kept: '#9ca3af',
              demolished: '#dc2626',
              added: '#16a34a',
              ink: '#374151',
              danger: '#7f1d1d',
            },
            widthPx: 900,
            printMmPerM: scale.mmPerM,
            housingType: plan.category?.housingType,
          })}</div>${northIndicatorSvg(orientationDeg)}`,
          calloutGroup: 'demolition',
          scaleLabel: scale.label,
          topDown: true,
        })
      }
    } else {
      const wallDiff = diffWalls(baselinePlan, plan)
      if (wallDiff.demolished.length > 0 || wallDiff.added.length > 0) {
        const [pw, pd] = planBounds(plan)
        const scale = planScale(pw, pd, template.paperSize, template.orientation)
        sheets.push({
          name: 'Demolition & new walls',
          body: `<div class="draw">${demolitionSvg(wallDiff, {
            palette: {
              kept: '#9ca3af',
              demolished: '#dc2626',
              added: '#16a34a',
              ink: '#374151',
              danger: '#7f1d1d',
            },
            widthPx: 900,
            printMmPerM: scale.mmPerM,
            housingType: plan.category?.housingType,
          })}</div>${northIndicatorSvg(orientationDeg)}`,
          calloutGroup: 'demolition',
          scaleLabel: scale.label,
          topDown: true,
        })
      }
    }
  }

  // FF&E schedule — reuses the exact `FfeRow[]` the report + CSV export build
  // from (`buildFfeSchedule`; no metadata re-derived here so the three
  // outputs can't drift). Unit/Total already reflect a per-instance price
  // override (ITEM-META `meta.price`, resolved by `itemPrice()`) transparently.
  // Brand/Model/Supplier/URL/Remarks are appended as ONE conditional block —
  // only when at least one row carries any of them (mirrors
  // `report.ts`'s ffeMetaHead/ffeMetaCell) — and each distinct user-defined
  // custom-field key becomes one more trailing column, in the SAME
  // alphabetical order as the CSV (`export/ffeCsv.ts`'s `customMetaColumns`).
  // Print-width guard: the sheet is a fixed-width printed page, not a
  // scrollable table, so the URL column shows a shortened host+path display
  // string (`shortUrl`) rather than the full link — the CSV keeps the
  // untouched URL.
  const ffe = layerOn(layers, 'ffe') ? buildFfeSchedule(plan, items, catalog) : []
  if (ffe.length) {
    const dim = (n: number) => esc(formatLength(n, units))
    const ffeWithMeta = ffe.some((r) => r.url || r.remarks || r.brand || r.model || r.supplier)
    const ffeMetaHead = ffeWithMeta
      ? '<td>Brand</td><td>Model</td><td>Supplier</td><td>URL</td><td>Remarks</td>'
      : ''
    const ffeMetaCell = (r: (typeof ffe)[number]) =>
      ffeWithMeta
        ? `<td>${esc(r.brand)}</td><td>${esc(r.model)}</td><td>${esc(r.supplier)}</td><td>${esc(shortUrl(r.url))}</td><td>${esc(r.remarks)}</td>`
        : ''
    const customCols = customMetaColumns(ffe)
    const customHead = customCols.map((k) => `<td>${esc(k)}</td>`).join('')
    const customCell = (r: (typeof ffe)[number]) =>
      customCols.map((k) => `<td>${esc(r.custom[k] ?? '')}</td>`).join('')
    sheets.push({
      name: 'FF&E schedule',
      body: `<table class="sched"><tr class="h"><td>Room</td><td>Item</td><td>Source</td><td>SKU</td><td>Size (W×D×H)</td><td class="n">Qty</td><td class="n">Unit</td><td class="n">Total</td>${ffeMetaHead}${customHead}</tr>${ffe
        .map(
          (r) =>
            `<tr><td>${esc(r.room)}</td><td>${esc(r.name)}</td><td>${esc(r.source)}</td><td>${esc(r.sku || '—')}</td><td>${dim(r.w)} × ${dim(r.d)} × ${dim(r.h)}</td><td class="n">${r.qty}</td><td class="n">${sgd(r.unit)}</td><td class="n">${sgd(r.total)}</td>${ffeMetaCell(r)}${customCell(r)}</tr>`,
        )
        .join('')}<tr class="h"><td colspan="7">Total</td><td class="n">${sgd(
        ffe.reduce((s, r) => s + r.total, 0),
      )}</td>${ffeWithMeta ? '<td></td><td></td><td></td><td></td><td></td>' : ''}${customCols
        .map(() => '<td></td>')
        .join('')}</tr></table>`,
      calloutGroup: 'ffe',
      scaleLabel: NTS,
    })
  }

  // Door & window schedule (H1) — the typed-marks table an architectural
  // drawing set carries (D1/D2…/W1/W2… with qty, size, sill, hinge/swing,
  // rooms served). Reuses the same pure `buildOpeningSchedule` grouping as the
  // report's "Openings schedule" section (`report.ts`) so the two stay in
  // lock-step, but — unlike the report (a metric/imperial-aware summary) —
  // this sheet always prints sizes in millimetres: door/window schedules are a
  // carpentry-adjacent trade deliverable (glaziers/carpenters spec openings in
  // mm regardless of the app's display-unit preference), matching the
  // carpentry sheets' own `overallMm` convention and the cover's general note
  // ("All dimensions are in millimetres (mm) unless noted in metres (m)").
  // `buildOpeningSchedule` already walks every storey internally (it resolves
  // each opening's bordering room via a wall-midpoint probe across all
  // levels), so — like Finishes/FF&E — this is ONE whole-set sheet, not a
  // per-storey fan-out. Omitted when the plan has no openings.
  if (layerOn(layers, 'openingSchedule')) {
    const openSched = buildOpeningSchedule(plan)
    if (openSched.marks.length > 0) {
      const mm = (metres: number) => `${Math.round(metres * 1000)} mm`
      const swingLabel = (m: { swing?: string; hinge?: string }) =>
        m.swing || m.hinge ? `${m.hinge ?? 'start'} / ${m.swing ?? 'right'}` : '—'
      sheets.push({
        name: 'Door & window schedule',
        body:
          `<div style="font-size:11px;color:#6b7280;margin-bottom:4px">${openSched.doorCount} door${openSched.doorCount === 1 ? '' : 's'} · ${openSched.windowCount} window${openSched.windowCount === 1 ? '' : 's'} — sizes in millimetres (mm)</div>` +
          `<table class="sched"><tr class="h"><td>Mark</td><td>Type</td><td>Style / material</td><td class="n">Qty</td><td class="n">Size (W×H)</td><td class="n">Sill</td><td>Hinge / swing</td><td>Rooms</td></tr>${openSched.marks
            .map(
              (m) =>
                `<tr><td>${esc(m.mark)}</td><td>${m.kind === 'door' ? 'Door' : 'Window'}</td><td>${esc(openingStyleMaterialLabel(m))}</td><td class="n">×${m.count}</td><td class="n">${mm(m.width)} × ${mm(m.height)}</td><td class="n">${mm(m.sill)}</td><td>${m.kind === 'door' ? esc(swingLabel(m)) : '—'}</td><td>${esc(openingRoomsLabel(m))}</td></tr>`,
            )
            .join('')}</table>`,
        calloutGroup: 'opening-schedule',
        scaleLabel: NTS,
      })
    }
  }

  // Carpentry/joinery elevations + sections (TODO G8) — one sheet per
  // distinct placed parametric piece (bookshelf/wardrobe/sideboard/desk/
  // kitchen-run), dimensioned in mm at a finer locked scale than the plan
  // sheets. Dedupe: a piece placed N× still gets ONE sheet, noted "×N".
  if (layerOn(layers, 'carpentry') && showCarpentry) {
    const carpentryPalette = { ink: '#374151', fill: '#e5e7eb', hidden: '#9ca3af' }
    for (const entry of collectCarpentrySheets(items, catalog)) {
      const { piece, count, name } = entry
      const wM = piece.overallMm.w / 1000
      const hM = piece.overallMm.h / 1000
      const dM = piece.overallMm.d / 1000
      // ONE locked scale drives both views on the sheet — sized against the
      // larger of the elevation's width and the section's depth against a
      // HALF-page width budget (the two views sit side by side), so neither
      // view overflows its half at that ratio.
      const scale = carpentryScale(wM, hM, dM, template.paperSize, template.orientation)
      const countNote = count > 1 ? ` <span style="color:#6b7280">(×${count})</span>` : ''
      sheets.push({
        name: `Carpentry — ${name}`,
        body:
          `<div style="display:flex;flex-direction:column;gap:8px;height:100%">` +
          `<div style="font-size:11px;color:#6b7280">${esc(piece.sectionLabel)}${countNote}</div>` +
          `<div style="display:flex;gap:16px;flex:1;min-height:0">` +
          `<div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:4px">` +
          `<div style="font-size:10px;font-weight:600;color:#4b5563">FRONT ELEVATION</div>` +
          `<div class="draw">${carpentrySvg(piece.elevation, { palette: carpentryPalette, printMmPerM: scale.mmPerM, cutX: piece.elevationCutX })}</div>` +
          `</div>` +
          `<div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:4px">` +
          `<div style="font-size:10px;font-weight:600;color:#4b5563">${esc(piece.sectionTitle)}</div>` +
          `<div class="draw">${carpentrySvg(piece.section, { palette: carpentryPalette, printMmPerM: scale.mmPerM })}</div>` +
          `</div>` +
          `</div>` +
          `<div style="display:flex;gap:16px;font-size:9px;color:#374151;line-height:1.4;flex:none">` +
          `<div style="flex:1;min-width:0">` +
          `<div style="font-weight:600;margin-bottom:2px">MATERIALS &amp; FINISH</div>` +
          piece.materialNotes.map((t) => `<div>• ${esc(t)}</div>`).join('') +
          `</div>` +
          `<div style="flex:1;min-width:0">` +
          `<div style="font-weight:600;margin-bottom:2px">HARDWARE</div>` +
          piece.hardwareNotes.map((t) => `<div>• ${esc(t)}</div>`).join('') +
          `</div>` +
          `</div>` +
          `<div style="font-size:10px;color:#b45309;font-weight:600">Verify all dimensions on site before fabrication.</div>` +
          `</div>`,
        calloutGroup: 'carpentry',
        scaleLabel: scale.label,
      })
    }
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

  // Project/client identity (TODO G5) — user-editable via `drawingSetTemplate`,
  // falling back to the plan's own name so behaviour is unchanged until edited.
  const projectName = template.projectName.trim() || plan.name
  const revision = template.revision.trim() || 'A'
  const totalSheets = sheets.length + 1 // + cover

  // Standard SG handover disclaimers (contractor-handover research, TODO G5) —
  // carried on the cover sheet only, once per set. The approval-path lines
  // (permit/renovation-approval + PE) branch on the plan's housing type (SG1)
  // via the shared `permitNotes()` helper — the same source the demolition
  // sheet reads — so a condo/landed plan's cover sheet doesn't read "HDB".
  const [, ...approvalNotes] = permitNotes(plan.category?.housingType)
  const GENERAL_NOTES = [
    'All dimensions are in millimetres (mm) unless noted in metres (m).',
    'Do NOT scale drawings from screen or PDF — print at 100% and measure against the stated scale with a scale rule.',
    'The furniture layout is indicative only. Build from the setting-out plan and elevations, not the furnished view.',
    ...approvalNotes,
    'Verify all dimensions on site before fabrication, ordering materials, or starting work.',
    `Elevation sheets (TODO H6): walls with no items or openings are omitted from the set; ` +
      `walls under ${MINOR_WALL_MAX_LENGTH_M} m with at most ${MINOR_WALL_MAX_ITEMS} item and no ` +
      'openings are grouped several-per-sheet — see the sheet index.',
  ]
  const cover: Sheet = {
    num: 'A-0',
    name: 'Cover',
    calloutGroup: 'cover',
    scaleLabel: NTS,
    body: `<div class="cover">
      <h1>${esc(projectName)}</h1>
      <div class="cover-sub">Interior design drawing set · ${esc(date)}</div>
      <div class="cover-meta">${[
        template.projectAddress && `Address: ${esc(template.projectAddress)}`,
        template.client && `Client: ${esc(template.client)}`,
        `Drawn by: ${template.drawnBy ? esc(template.drawnBy) : '—'}`,
        `Checked by: ${template.checkedBy ? esc(template.checkedBy) : '________________'}`,
      ]
        .filter(Boolean)
        .join(' &nbsp;·&nbsp; ')}</div>
      <div class="cover-cols">
        <div><h3>Rooms &amp; areas</h3><table class="sched"><tr class="h"><td>Room</td><td class="n">Area</td></tr>${roomRows}<tr class="h"><td>Total</td><td class="n">${esc(formatArea(totalArea, units))}</td></tr></table></div>
        <div><h3>Sheet index</h3><table class="sched"><tr class="h"><td>No.</td><td>Sheet</td></tr><tr><td>A-0</td><td>Cover</td></tr>${indexRows}</table>${
          minorWallsOmitted > 0
            ? `<div style="font-size:10px;color:#6b7280;margin-top:4px">— ${minorWallsOmitted} minor wall${minorWallsOmitted === 1 ? '' : 's'} omitted (no items or openings)</div>`
            : ''
        }</div>
        <div><h3>Revisions</h3><table class="sched"><tr class="h"><td>Rev</td><td>Date</td><td>Description</td></tr><tr><td>${esc(revision)}</td><td>${esc(date)}</td><td>${esc(template.revisionNote.trim() || 'Initial issue')}</td></tr></table></div>
      </div>
      <div class="notes">
        <h3>General notes</h3>
        <ol>${GENERAL_NOTES.map((note) => `<li>${esc(note)}</li>`).join('')}</ol>
      </div>
    </div>`,
  }
  const ordered = [cover, ...sheets]
  // Normalise callout array (empty when none provided).
  const activeCallouts = callouts ?? []

  // Per-sheet title-block second row: client/drawn-by/checked-by/date/scale/
  // sheet-of-total/revision (TODO G5).
  const titleBlockMeta = (s: Sheet): string =>
    [
      template.client && `Client: ${esc(template.client)}`,
      `Drawn: ${template.drawnBy ? esc(template.drawnBy) : '—'}`,
      `Checked: ${template.checkedBy ? esc(template.checkedBy) : '________'}`,
      esc(date),
      `Scale ${esc(s.scaleLabel)}`,
      `${s.num} of ${totalSheets}`,
      `Rev ${esc(revision)}`,
    ]
      .filter(Boolean)
      .join(' &nbsp;·&nbsp; ')

  const sheetHtml = ordered
    .map((s) => {
      // Inject callout SVG overlay into the sheet-area for the matching group.
      // The overlay is absolutely-positioned over the `.draw` area; the wrapper
      // needs `position:relative` (added per-sheet below via inline style).
      const calloutsHtml =
        s.calloutGroup && activeCallouts.length
          ? buildCalloutsSvg(activeCallouts, s.calloutGroup)
          : ''
      const sheetAreaStyle = calloutsHtml || s.topDown ? ' style="position:relative"' : ''
      return (
        `<section class="sheet"><div class="sheet-area"${sheetAreaStyle}>${s.body}${calloutsHtml}</div>` +
        `\n        <div class="title-block">` +
        `<div class="tb-row1"><span class="tb-proj">${esc(projectName)}</span>` +
        `<span class="tb-name">${esc(s.name)}</span></div>` +
        `<div class="tb-row2">${titleBlockMeta(s)}</div>` +
        `</div>\n      </section>`
      )
    })
    .join('')

  // Paper/orientation-parameterized sheet CSS (user-customizable — TODO G2
  // follow-up): `@page` + the sheet box + the drawing-area height budget all
  // derive from ONE source of truth (`floorplan/drawingScale.ts`) so they
  // never drift from `pickDrawingScale`'s own printable-area math.
  const { widthMm: pageWidthMm, heightMm: pageHeightMm } = paperDimensionsMm(
    template.paperSize,
    template.orientation,
  )
  const sheetWidthMm = pageWidthMm - PAGE_MARGIN_MM * 2
  const sheetMinHeightMm = pageHeightMm - PAGE_MARGIN_MM * 2
  const drawMaxHeightMm = PAPER_PRINTABLE_MM[`${template.paperSize}-${template.orientation}`].height
  const pageSizeCss = `${template.paperSize.toUpperCase()} ${template.orientation}`

  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(plan.name)} — Drawing set</title>
<style>
  @page { size: ${pageSizeCss}; margin: ${PAGE_MARGIN_MM}mm; }
  * { box-sizing: border-box; }
  body { font: 12px/1.5 -apple-system, Segoe UI, Roboto, sans-serif; color: #1f2937; margin: 0; }
  .sheet { width: ${sheetWidthMm}mm; min-height: ${sheetMinHeightMm}mm; margin: 0 auto 10mm; padding: 8mm; border: 1px solid #e5e7eb;
    display: flex; flex-direction: column; page-break-after: always; background: #fff; }
  .sheet:last-child { page-break-after: auto; }
  .sheet-area { flex: 1; min-height: 0; display: flex; flex-direction: column; gap: 10px; }
  .draw { flex: 1; min-height: 0; display: flex; align-items: center; justify-content: center; }
  .draw svg { width: 100%; height: 100%; max-height: ${drawMaxHeightMm}mm; }
  /* Grouped minor-wall elevations (TODO H6) — up to 4 low-content walls share one sheet. */
  .minor-grid { flex: 1; min-height: 0; display: grid; grid-template-columns: 1fr 1fr; grid-template-rows: 1fr 1fr; gap: 8px; }
  .minor-cell { min-height: 0; display: flex; flex-direction: column; gap: 4px; }
  .minor-cap { font-size: 9px; color: #6b7280; flex: none; }
  .title-block { border-top: 2px solid #1f2937; margin-top: 8px; padding-top: 6px; font-size: 11px; }
  .tb-row1 { display: flex; justify-content: space-between; align-items: baseline; }
  .tb-row2 { margin-top: 2px; color: #6b7280; font-size: 9px; font-family: ui-monospace, monospace; }
  .tb-proj { font-weight: 700; }
  .tb-name { color: #4b5563; }
  h1 { font-size: 30px; margin: 0 0 2px; }
  .cover { padding: 6mm 0; }
  .cover-sub { color: #6b7280; margin-bottom: 8px; }
  .cover-meta { color: #4b5563; font-size: 11px; margin-bottom: 24px; }
  .cover-cols { display: flex; gap: 40px; }
  .notes { margin-top: 24px; }
  .notes ol { margin: 6px 0 0; padding-left: 18px; font-size: 10px; line-height: 1.6; color: #374151; }
  h3 { font-size: 12px; text-transform: uppercase; letter-spacing: .05em; color: #6b7280; }
  table.sched { width: 100%; border-collapse: collapse; font-size: 11px; }
  table.sched td { padding: 3px 8px 3px 0; border-bottom: 1px solid #f1f5f9; vertical-align: top; }
  table.sched td.n { text-align: right; font-variant-numeric: tabular-nums; }
  table.sched tr.h td { font-weight: 600; border-bottom: 1px solid #e5e7eb; }
  /* Contractor-grade finish schedule (G4) — shared renderer with the report window. */
  .mcode { display: inline-block; font-family: ui-monospace, monospace; font-size: 9px; font-weight: 700; color: #4b5563; background: #f3f4f6; border-radius: 3px; padding: 0 4px; margin-right: 4px; }
  .mnum, .mnum-td { font-variant-numeric: tabular-nums; color: #374151; font-size: 10px; }
  .mnum-td { text-align: right; }
  .mnote { font-size: 9px; color: #b45309; margin-top: 1px; }
  .mchip { display: inline-block; width: 9px; height: 9px; border-radius: 2px; margin-right: 5px; vertical-align: middle; border: 1px solid rgba(0,0,0,.12); }
  .fin-h3 { margin: 10px 0 4px; }
  .fin-caveat { font-size: 10px; color: #9ca3af; margin-top: 6px; }
</style></head><body>${sheetHtml}</body></html>`
}
