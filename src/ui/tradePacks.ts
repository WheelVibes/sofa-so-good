/**
 * Per-trade handover packs (blank-slate BSJ-5) — the designed→ordered bridge.
 *
 * The full drawing set (`drawingSet.ts`) is organised by drawing TYPE (GA plan,
 * elevations, schedules, electrical/plumbing/RCP, …). A homeowner engaging
 * individual trades instead needs *recipient* bundles: the tiler wants the
 * finishes + setting-out; the electrician wants the electrical plan + circuits +
 * mount-height conventions; the carpenter wants the joinery elevations; and so
 * on. This module RE-BUNDLES the sheets the app already builds — it does NOT
 * fork any sheet builder. It:
 *   1. builds the master sheet list ONCE (`buildDrawingSheets`, full numbering),
 *   2. selects the subset each recipient needs by the sheets' `calloutGroup`,
 *      keeping the MASTER sheet numbers (a contractor cross-references a pack
 *      sheet against the full set — see {@link NUMBERING_NOTE}),
 *   3. prepends a pack cover (recipient, scope, contact placeholder, the
 *      design's title-block info, an included-sheet index) that also lists what
 *      the pack EXCLUDES when the data is missing (honest gaps, not silent
 *      omissions), plus per-trade advisory tables composed from the same pure
 *      builders the editor uses (socket advisory, aircon system planner, switch
 *      circuits, finish quantities),
 *   4. renders via the SHARED `renderDrawingDocument`, so a pack page is
 *      byte-identical in styling to a full-set page.
 *
 * Pure — HTML only, no DOM/store/React (the window.open flow lives in
 * `openTradePack.ts`), so the whole composition is unit-testable.
 */
import { buildAirconSystemPlan } from '../analysis/airconSystem'
import { buildPaintQuantities } from '../analysis/paintQuantities'
import { buildSocketAdvisory, DB_LOAD_NOTE } from '../analysis/socketAdvisory'
import { DEFAULT_DRAWING_SET_TEMPLATE, type DrawingSetTemplate } from '../export/drawingSetTemplate'
import type { ElectricalPoint } from '../floorplan/electricalPlan'
import { buildFinishSchedule, type FinishSchedule } from '../floorplan/finishSchedule'
import {
  buildFloorTransitions,
  buildKerbAdvisories,
  buildRoomFflTags,
} from '../floorplan/floorLevels'
import { allPlanRooms } from '../floorplan/levels'
import { ELECTRICAL_MOUNT_DEFAULTS_MM } from '../floorplan/mepPoints'
import type { PlumbingPoint } from '../floorplan/plumbingPlan'
import { buildSwitchCircuits } from '../floorplan/switchCircuits'
import { type FloorPlan, pointInRoom } from '../floorplan/types'
import { buildWaterproofingZones, upturnLabel } from '../floorplan/waterproofing'
import type { FurnitureDef, FurnitureItem } from '../furniture/types'
import { buildLightingPlan } from '../lighting2d/lightingPlan'
import { BUILTIN_MATERIALS } from '../materials/builtinCatalog'
import type { CalloutSheet } from '../state/slices/drawingCalloutsSlice'
import { formatArea, formatLength, type UnitSystem } from '../utils/measurement'
import { buildDrawingSheets, renderDrawingDocument, type Sheet } from './drawingSet'
import { type FinishScheduleKind, finishScheduleHtml } from './finishScheduleHtml'
import { esc } from './report/reportShared'

/** MEP point families the packs read, bundled with their provenance (same shape
 *  the drawing set takes). */
interface MepPointsInput<T> {
  points: T[]
  source: 'persisted' | 'heuristic'
}

/** Everything a pack needs — the same resolved inputs `buildDrawingSetHtml`
 *  takes (assembled by `openTradePack.ts` from the store). */
export interface TradePackInput {
  plan: FloorPlan
  items: FurnitureItem[]
  catalog: Record<string, FurnitureDef>
  units?: UnitSystem
  baselinePlan?: FloorPlan
  electrical?: MepPointsInput<ElectricalPoint>
  plumbing?: MepPointsInput<PlumbingPoint>
  finishes?: import('../floorplan/roomFinishes').RoomFinishMaps
  template?: DrawingSetTemplate
  orientationDeg?: number
  showSettingOut?: boolean
  showCarpentry?: boolean
  showRcp?: boolean
}

export type TradePackId =
  | 'tiler'
  | 'electrician'
  | 'plumber'
  | 'carpenter'
  | 'aircon'
  | 'curtains'
  | 'painter'

/** The convention line printed on every pack cover — explains why the sheet
 *  numbers are non-contiguous (they're the master set's). */
export const NUMBERING_NOTE =
  'Sheet numbers below are the MASTER drawing set’s — they are intentionally non-contiguous so a contractor can cross-reference any sheet against the full set the design office holds.'

/** One master sheet group a pack bundles, plus what to say if it is absent. */
interface PackSheetSpec {
  group: CalloutSheet
  /** When the master set produced NO sheet of this group, this becomes an
   *  exclusion line on the cover (honest gap). Absent = optional (silent). */
  missingNote?: string
  /** Finishes-sheet only: narrow the reused sheet to these finish kinds (the
   *  tiler pack → floors + walls, the painter pack → walls). */
  finishKinds?: FinishScheduleKind[]
}

interface PackDef {
  id: TradePackId
  /** Recipient title (the cover H1 + menu label). */
  recipient: string
  /** One-line scope summary (menu sub + cover). */
  scope: string
  sheets: PackSheetSpec[]
}

/** Static pack definitions — the recipient, scope, and which master sheet
 *  groups each bundles. Kept declarative so the menu list + the composition +
 *  the tests all read from one source. */
export const TRADE_PACKS: readonly PackDef[] = [
  {
    id: 'tiler',
    recipient: 'Tiler & wet works',
    scope:
      'Floor + wall finishes, setting-out, and any demolition — everything the tiler prices and sets out from.',
    sheets: [
      { group: 'floor-plan' },
      {
        group: 'dimensions',
        missingNote: 'No dimensioned / setting-out plan — enable the Dimensioned plan sheet.',
      },
      {
        group: 'finishes',
        finishKinds: ['floor', 'wall', 'accent'],
        missingNote: 'No finishes schedule — pick floor/wall finishes so the tiler has a takeoff.',
      },
      { group: 'demolition' },
    ],
  },
  {
    id: 'electrician',
    recipient: 'Electrician',
    scope: 'Power & data plan, lighting circuits, and the DB / mount-height conventions.',
    sheets: [
      {
        group: 'electrical',
        missingNote: 'No electrical plan — place MEP points (or run Suggest MEP points) first.',
      },
      { group: 'rcp' },
    ],
  },
  {
    id: 'plumber',
    recipient: 'Plumber',
    scope: 'Plumbing plan — sanitary provisions, water points and water-heater positions.',
    sheets: [
      {
        group: 'plumbing',
        missingNote: 'No plumbing plan — place plumbing points (or run Suggest MEP points) first.',
      },
    ],
  },
  {
    id: 'carpenter',
    recipient: 'Carpenter / joinery',
    scope:
      'Dimensioned joinery elevations + sections per built-in piece, with the relevant wall elevations.',
    sheets: [
      {
        group: 'carpentry',
        missingNote:
          'No carpentry sheets — add a custom-size piece (wardrobe / kitchen run / built-in) and enable Carpentry sheets.',
      },
      { group: 'elevations' },
    ],
  },
  {
    id: 'aircon',
    recipient: 'Aircon installer',
    scope: 'The System-2/3/4 proposal, FCU / condenser positions, and trunking advisory.',
    sheets: [{ group: 'floor-plan' }, { group: 'electrical' }],
  },
  {
    id: 'curtains',
    recipient: 'Curtains & blinds vendor',
    scope: 'Window schedule with sizes + the placed window-treatment list.',
    sheets: [
      {
        group: 'opening-schedule',
        missingNote: 'No door & window schedule — the plan has no openings to measure from.',
      },
    ],
  },
  {
    id: 'painter',
    recipient: 'Painter',
    scope: 'Wall finish schedule + the paint-area quantity basis (net of openings).',
    sheets: [
      {
        group: 'finishes',
        finishKinds: ['wall', 'accent'],
        missingNote:
          'No wall finish schedule — pick wall finishes so the painter has an area basis.',
      },
    ],
  },
]

/** Look up a pack def by id. */
function tradePackDef(id: TradePackId): PackDef {
  const def = TRADE_PACKS.find((p) => p.id === id)
  if (!def) throw new Error(`Unknown trade pack: ${id}`)
  return def
}

/** The result of composing one pack. */
export interface TradePackResult {
  id: TradePackId
  recipient: string
  /** Master sheet numbers + names bundled into this pack, in order. */
  includedSheets: { num: string; name: string }[]
  /** Honest gap lines shown on the cover (missing sheets / unlinked data). */
  exclusions: string[]
  html: string
}

const sqm = (a: number, units: UnitSystem) => esc(formatArea(a, units))

/** Small `.sched` table from rows of `<td>` strings + a header row. */
function schedTable(headers: string[], rows: string[]): string {
  if (rows.length === 0) return ''
  const head = `<tr class="h">${headers.map((h) => `<td>${esc(h)}</td>`).join('')}</tr>`
  return `<table class="sched">${head}${rows.join('')}</table>`
}

/** Wet-area notes carried on the tiler pack cover (SG waterproofing/tiling
 *  handover conventions). The modeled waterproofing zone TABLE + floor-level
 *  tags (BSJ-7/8) are appended after these notes by `packAdvisory`. */
const WET_AREA_NOTES = [
  'Waterproofing membrane to every wet area (bath / WC / kitchen / service yard) — floor + a wall upturn (typically ≥150 mm, ≥1.8 m at shower walls); confirm the system + warranty.',
  'Fall the wet-area floor to the floor trap; kerb / step-down at the bath threshold.',
  'HDB 3-year rule: no hacking of the original bathroom floor slab / waterproofing within 3 years of key collection.',
  'Verify all areas on site — plan-derived quantities are approximate.',
]

/** Electrician mount-height conventions page (AFFL, mm) from the app's own MEP
 *  defaults — the reference an electrician sets out socket/switch heights from. */
const MOUNT_HEIGHT_ROWS: { label: string; kind: keyof typeof ELECTRICAL_MOUNT_DEFAULTS_MM }[] = [
  { label: 'Socket / twin socket', kind: 'socket' },
  { label: 'Light switch', kind: 'switch' },
  { label: 'Data / network point', kind: 'data' },
  { label: 'TV point', kind: 'tv-point' },
  { label: 'Aircon isolator', kind: 'aircon' },
  { label: 'Water-heater point', kind: 'water-heater' },
]

/** Built-in / joinery FF&E categories (for the carpenter pack's cover summary). */
const BUILT_IN_CATEGORIES = new Set(['kitchen', 'storage'])

/** Window-treatment def ids (placed window-bound fixtures the curtain vendor
 *  quotes). Matches the `windowBound` textile/decor defs. */
const TREATMENT_DEF_IDS = new Set(['curtains', 'roller-blind'])

/** Build the pack-specific advisory sections that ride the cover (composed from
 *  the same pure builders the editor uses — never a fork of a sheet). */
function packAdvisory(id: TradePackId, input: TradePackInput, exclusions: string[]): string {
  const units = input.units ?? 'metric'
  const { plan, items } = input
  const rooms = allPlanRooms(plan)
  const roomNameAt = (x: number, z: number): string | undefined =>
    rooms.find((r) => pointInRoom(r, x, z))?.name

  if (id === 'tiler') {
    // Modeled waterproofing zones (BSJ-7): per wet room, the floor area +
    // upturn heights + total membrane area a waterproofer prices from.
    const zones = buildWaterproofingZones(plan, items)
    const zoneRows = zones.map(
      (z) =>
        `<tr><td>${esc(z.roomName)}</td><td class="n">${sqm(z.floorAreaM2, units)}</td><td>${esc(upturnLabel(z))}</td><td class="n">${sqm(z.membraneAreaM2, units)}</td></tr>`,
    )
    const zoneTable =
      zoneRows.length > 0
        ? `<h3 class="fin-h3">Waterproofing zones</h3>${schedTable(
            ['Wet area', 'Floor', 'Wall upturn', 'Membrane area'],
            zoneRows,
          )}<div class="fin-caveat">Membrane area = floor + wall-upturn bands; verify the system + warranty on site.</div>`
        : ''

    // Floor levels / transitions (BSJ-8): FFL tags where set, doorway steps, and
    // the kerb advisory — the same derivation the dimensioned plan tags.
    const ffl = buildRoomFflTags(plan)
    const fflRows = ffl.map(
      (t) => `<tr><td>${esc(t.roomName)}</td><td class="n">${esc(t.tag)}</td></tr>`,
    )
    const fflTable =
      fflRows.length > 0
        ? `<h3 class="fin-h3">Finished floor levels (vs datum)</h3>${schedTable(
            ['Room', 'FFL'],
            fflRows,
          )}`
        : ''
    const transitions = buildFloorTransitions(plan)
    const kerbs = buildKerbAdvisories(plan)
    const levelNotes = [
      ...transitions.map(
        (t) => `Threshold ${esc(t.roomAName)} ↔ ${esc(t.roomBName)}: ${esc(t.note)}.`,
      ),
      ...kerbs.map((k) => esc(k.note)),
    ]
    const levelNotesHtml =
      levelNotes.length > 0
        ? `<ol class="notes-ol">${levelNotes.map((n) => `<li>${n}</li>`).join('')}</ol>`
        : ''

    return (
      `<h3 class="fin-h3">Wet-area notes</h3>` +
      `<ol class="notes-ol">${WET_AREA_NOTES.map((n) => `<li>${esc(n)}</li>`).join('')}</ol>` +
      zoneTable +
      fflTable +
      levelNotesHtml
    )
  }

  if (id === 'electrician') {
    const adv = buildSocketAdvisory(plan)
    const socketRows = adv.rooms.map(
      (r) =>
        `<tr><td>${esc(r.roomName)}</td><td class="n">${r.placed}</td><td class="n">${r.target}</td><td class="n">${r.shortfall > 0 ? `−${r.shortfall}` : '✓'}</td><td class="n">${r.dataPlaced}</td></tr>`,
    )
    const socketTable =
      socketRows.length > 0
        ? `<h3 class="fin-h3">Socket outlets by room</h3>${schedTable(
            ['Room', 'Placed', 'Target', 'Short', 'Data'],
            socketRows,
          )}`
        : ''
    // Switching schematic status — honest gap when nothing is linked.
    const switches = (plan.electricalPoints ?? []).filter((p) => p.kind === 'switch')
    const lights = buildLightingPlan(items, input.catalog).lights
    const circuits = buildSwitchCircuits(
      switches.map((s) => ({
        id: s.id,
        x: s.x,
        z: s.z,
        controls: s.controls,
        gang: s.gang,
        way: s.way,
        levelId: s.levelId,
      })),
      lights.map((l) => ({
        id: l.id,
        x: l.x,
        z: l.z,
        type: l.type,
        label: l.label,
        levelId: l.levelId,
      })),
      roomNameAt,
    )
    if (circuits.circuits.length === 0) {
      exclusions.push(
        `No switching schematic — link switches to the lights they control first (${lights.length} light${lights.length === 1 ? '' : 's'} unlinked).`,
      )
    }
    const mountRows = MOUNT_HEIGHT_ROWS.map(
      (m) =>
        `<tr><td>${esc(m.label)}</td><td class="n">${ELECTRICAL_MOUNT_DEFAULTS_MM[m.kind]} mm</td></tr>`,
    )
    const mountTable = `<h3 class="fin-h3">Mount-height conventions (AFFL)</h3>${schedTable(
      ['Point', 'Height'],
      mountRows,
    )}`
    return (
      socketTable +
      mountTable +
      `<div class="fin-caveat">${esc(DB_LOAD_NOTE)}</div>` +
      `<div class="fin-caveat">Indicative planning aid — no certified circuit/RCD/MCB design. Verify with a licensed electrical worker (LEW).</div>`
    )
  }

  if (id === 'aircon') {
    const sys = buildAirconSystemPlan(plan, input.orientationDeg ?? 0)
    if (sys.systems.length === 0) {
      exclusions.push('No air-conditioned rooms found — the system proposal is empty.')
      return ''
    }
    const applied = items.some(
      (it) => it.defId === 'aircon-unit' || it.defId === 'aircon-condenser',
    )
    if (!applied) {
      exclusions.push(
        'FCU / condenser positions are NOT on the plan yet — run the aircon system planner to place them.',
      )
    }
    const sysRows = sys.systems.map(
      (s) =>
        `<tr><td>${esc(s.label)}</td><td>${esc(s.fcus.map((f) => f.roomName).join(', '))}</td><td class="n">${s.fcus.length}</td><td class="n">${s.connectedBtu.toLocaleString('en-SG')}</td><td class="n">${Math.round(s.loadRatio * 100)}%${s.overCapacity ? ' ⚠' : ''}</td><td class="n">≈${s.condenserWeightKg} kg</td></tr>`,
    )
    const sysTable = `<h3 class="fin-h3">Proposed multi-split systems</h3>${schedTable(
      ['System', 'Rooms (FCUs)', 'FCUs', 'Connected BTU', 'Load', 'Condenser'],
      sysRows,
    )}`
    const notes = [
      `${sys.condenserCount} outdoor condenser${sys.condenserCount === 1 ? '' : 's'} · ${sys.fcuCount} indoor FCUs · ≈${Math.round(sys.totalCondenserWeightKg)} kg total outdoor weight.`,
      sys.ledgeWeightNote,
      sys.systems[0]?.trunkingNote,
    ].filter(Boolean) as string[]
    return sysTable + `<ol class="notes-ol">${notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ol>`
  }

  if (id === 'curtains') {
    const byRoom = new Map<
      string,
      Map<string, { name: string; count: number; w: number; h: number }>
    >()
    for (const it of items) {
      if (!TREATMENT_DEF_IDS.has(it.defId)) continue
      const def = input.catalog[it.defId]
      if (!def) continue
      const room = rooms.find((r) => pointInRoom(r, it.position[0], it.position[1]))
      const roomName = room?.name ?? 'Unassigned'
      const variant = typeof it.props['blindType'] === 'string' ? ` (${it.props['blindType']})` : ''
      const name = `${def.name}${variant}`
      const w = (
        typeof it.props['width'] === 'number' ? it.props['width'] : def.defaultFootprint.w
      ) as number
      const h = (
        typeof it.props['height'] === 'number' ? it.props['height'] : def.defaultFootprint.h
      ) as number
      let m = byRoom.get(roomName)
      if (!m) {
        m = new Map()
        byRoom.set(roomName, m)
      }
      const key = `${name}::${w}x${h}`
      const e = m.get(key)
      if (e) e.count += 1
      else m.set(key, { name, count: 1, w, h })
    }
    const rowsHtml: string[] = []
    for (const [roomName, m] of byRoom) {
      for (const e of m.values()) {
        rowsHtml.push(
          `<tr><td>${esc(roomName)}</td><td>${esc(e.name)}</td><td class="n">×${e.count}</td><td class="n">${esc(formatLength(e.w, units))} W × ${esc(formatLength(e.h, units))} H</td></tr>`,
        )
      }
    }
    if (rowsHtml.length === 0) {
      exclusions.push(
        'No window treatments placed — add curtains / blinds so the vendor can quote a treatment list.',
      )
      return ''
    }
    return `<h3 class="fin-h3">Window treatments (placed)</h3>${schedTable(
      ['Room', 'Treatment', 'Qty', 'Size (approx.)'],
      rowsHtml,
    )}<div class="fin-caveat">Sizes are the placed fixture footprint — measure the finished opening on site before ordering.</div>`
  }

  if (id === 'carpenter') {
    const ffeRows: string[] = []
    // Built-in joinery summary from the placed items (kitchen + storage).
    const byKey = new Map<
      string,
      { name: string; count: number; w: number; d: number; h: number }
    >()
    for (const it of items) {
      const def = input.catalog[it.defId]
      if (!def || !BUILT_IN_CATEGORIES.has(def.category)) continue
      const w = (
        typeof it.props['width'] === 'number' ? it.props['width'] : def.defaultFootprint.w
      ) as number
      const d = (
        typeof it.props['depth'] === 'number' ? it.props['depth'] : def.defaultFootprint.d
      ) as number
      const h = (
        typeof it.props['height'] === 'number' ? it.props['height'] : def.defaultFootprint.h
      ) as number
      const key = `${def.id}::${w}x${d}x${h}`
      const e = byKey.get(key)
      if (e) e.count += 1
      else byKey.set(key, { name: def.name, count: 1, w, d, h })
    }
    for (const e of byKey.values()) {
      ffeRows.push(
        `<tr><td>${esc(e.name)}</td><td class="n">×${e.count}</td><td class="n">${esc(formatLength(e.w, units))} × ${esc(formatLength(e.d, units))} × ${esc(formatLength(e.h, units))}</td></tr>`,
      )
    }
    if (ffeRows.length === 0) {
      exclusions.push(
        'No built-in / joinery pieces placed — add a wardrobe, kitchen run or built-in.',
      )
      return ''
    }
    return `<h3 class="fin-h3">Built-in / joinery schedule</h3>${schedTable(
      ['Piece', 'Qty', 'Size (W×D×H)'],
      ffeRows,
    )}<div class="fin-caveat">Fabricate from the dimensioned Carpentry sheets — verify all dimensions on site.</div>`
  }

  if (id === 'painter') {
    if (!input.finishes) return ''
    const nameOf = (mid: string) => BUILTIN_MATERIALS[mid]?.name ?? mid
    const schedule: FinishSchedule = buildFinishSchedule(plan, input.finishes, nameOf)
    // LITRES, not just an area. This block used to print the wall area and then
    // say "add ceilings + a coverage/coats factor per the paint spec" — i.e. it
    // handed the painter the arithmetic the app has every input for. Areas come
    // from the finish schedule (net of openings), so the litres and the areas on
    // the same pack can never disagree.
    const byName: Record<string, (typeof BUILTIN_MATERIALS)[string] | undefined> = {}
    for (const m of Object.values(BUILTIN_MATERIALS)) byName[m.name] = m
    const paint = buildPaintQuantities(schedule.totals, byName)
    if (paint.rows.length === 0) return ''
    const rows = paint.rows
      .map(
        (r) =>
          `<tr><td>${esc(r.code)}</td><td>${esc(r.name)}</td><td class="n">${sqm(r.areaM2, units)}</td>` +
          `<td class="n">${r.coats}</td><td class="n">${r.spreadingRateM2PerL}</td>` +
          `<td class="n">${r.totalL} L</td>` +
          `<td>${r.tins.map((t) => `${t.count} × ${t.size} L`).join(' + ') || '—'}</td></tr>`,
      )
      .join('')
    return (
      `<h3>Paint quantities</h3>` +
      `<table class="sched"><tr class="h"><td>Code</td><td>Finish</td><td class="n">Area</td>` +
      `<td class="n">Coats</td><td class="n">m²/L</td><td class="n">Paint</td><td>Buy</td></tr>` +
      `${rows}<tr class="h"><td colspan="5">Total</td><td class="n">${paint.totalL} L</td><td></td></tr></table>` +
      `<div class="fin-caveat">${esc(paint.note)}` +
      (paint.omittedFinishes > 0
        ? ` ${paint.omittedFinishes} non-paint wall/ceiling finish${paint.omittedFinishes === 1 ? '' : 'es'} carry no litres.`
        : '') +
      `</div>`
    )
  }

  return ''
}

/**
 * Compose one trade pack into a print-ready HTML document. Builds the master
 * sheets once, selects this recipient's subset (master numbers preserved),
 * prepends a pack cover with scope + honest exclusions + advisory tables, and
 * renders through the shared document wrapper.
 */
export function buildTradePack(id: TradePackId, input: TradePackInput): TradePackResult {
  const def = tradePackDef(id)
  const units = input.units ?? 'metric'
  const template = input.template ?? DEFAULT_DRAWING_SET_TEMPLATE

  // 1. Master sheets, built ONCE with full numbering (all layers on).
  const { sheets: masterSheets } = buildDrawingSheets(
    input.plan,
    input.items,
    input.catalog,
    units,
    input.baselinePlan,
    input.electrical,
    input.plumbing,
    input.finishes,
    undefined, // layers: all on — the pack selects its own subset below
    undefined,
    template,
    input.orientationDeg ?? 0,
    input.showSettingOut ?? false,
    input.showCarpentry ?? false,
    input.showRcp ?? false,
  )
  const masterTotal = masterSheets.length + 1 // + master cover (A-0)

  // 2. Select the pack's sheets by calloutGroup (master order + numbers kept).
  const exclusions: string[] = []
  const selected: Sheet[] = []
  const nameOf = (mid: string) => BUILTIN_MATERIALS[mid]?.name ?? mid
  for (const spec of def.sheets) {
    const matches = masterSheets.filter((s) => s.calloutGroup === spec.group)
    if (matches.length === 0) {
      if (spec.missingNote) exclusions.push(spec.missingNote)
      continue
    }
    for (const s of matches) {
      // Finishes sheet: re-render narrowed to the pack's finish kinds (reusing
      // the SAME pure builder + shared renderer — not a fork), keeping the
      // master sheet's number/name/scale.
      if (spec.group === 'finishes' && spec.finishKinds && input.finishes) {
        const schedule = buildFinishSchedule(input.plan, input.finishes, nameOf)
        const body = finishScheduleHtml(schedule, units, new Set(spec.finishKinds))
        selected.push({ ...s, body: body || s.body })
      } else {
        selected.push(s)
      }
    }
  }

  // 3. Pack cover.
  const advisory = packAdvisory(id, input, exclusions)
  const projectName = template.projectName.trim() || input.plan.name
  const date = new Date().toLocaleDateString('en-SG', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
  const includedSheets = selected.map((s) => ({ num: s.num ?? '', name: s.name }))

  const metaLine = [
    template.projectAddress && `Address: ${esc(template.projectAddress)}`,
    template.client && `Client: ${esc(template.client)}`,
    `Drawn by: ${template.drawnBy ? esc(template.drawnBy) : '—'}`,
  ]
    .filter(Boolean)
    .join(' &nbsp;·&nbsp; ')

  const indexRows = includedSheets
    .map((s) => `<tr><td>${esc(s.num)}</td><td>${esc(s.name)}</td></tr>`)
    .join('')
  const indexTable = includedSheets.length
    ? `<table class="sched"><tr class="h"><td>No.</td><td>Sheet</td></tr>${indexRows}</table>`
    : `<p class="fin-caveat">No drawing sheets in this pack — see the notes below.</p>`

  const exclusionBlock = exclusions.length
    ? `<div class="notes"><h3>Not included / to complete first</h3><ul class="notes-ol">${exclusions
        .map((e) => `<li>${esc(e)}</li>`)
        .join('')}</ul></div>`
    : ''

  const coverBody = `<div class="cover">
      <div class="cover-sub" style="font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#6b7280">Trade handover pack</div>
      <h1>${esc(def.recipient)}</h1>
      <div class="cover-sub">${esc(def.scope)}</div>
      <div class="cover-meta">${esc(projectName)} &nbsp;·&nbsp; ${date}${metaLine ? ` &nbsp;·&nbsp; ${metaLine}` : ''}</div>
      <div class="cover-meta">Contact / issued to: ________________________</div>
      <div class="cover-cols">
        <div style="flex:1;min-width:0"><h3>Sheets in this pack</h3>${indexTable}
          <div class="fin-caveat">${esc(NUMBERING_NOTE)}</div>
        </div>
        <div style="flex:1.2;min-width:0"><h3>${esc(def.recipient)} — reference</h3>${advisory || '<p class="fin-caveat">No additional reference data for this pack.</p>'}</div>
      </div>
      ${exclusionBlock}
    </div>`

  const coverSheet: Sheet = {
    num: 'P-0',
    name: `${def.recipient} — pack cover`,
    body: coverBody,
    scaleLabel: 'NTS',
    calloutGroup: 'cover',
  }

  // 4. Render via the shared document wrapper (master total in the title block).
  const html = renderDrawingDocument([coverSheet, ...selected], {
    plan: input.plan,
    template,
    units,
    docTitle: `${projectName} — ${def.recipient} pack`,
    totalSheets: masterTotal,
  })

  return { id, recipient: def.recipient, includedSheets, exclusions, html }
}
