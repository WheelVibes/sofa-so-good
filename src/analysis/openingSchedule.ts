/**
 * Door & window schedule (PARITY-OPENING-SCHED) — the typed-marks table an
 * architectural drawing set carries. Walks every opening across all storeys,
 * resolves the room(s) each borders (a wall-midpoint probe, the same approach
 * `analysis/daylight.ts` uses), and groups openings with identical
 * (kind, width, head − sill, style, material) into a "mark": D1/D2… for doors,
 * W1/W2… for windows. Style (`openingStyles`, v0.22.2.64+) + door leaf material
 * are part of the grouping key, so a sliding door and a swing door of identical
 * size — or a grille vs plain window — are SEPARATE marks (a contractor's door
 * schedule needs them apart: different products/installation); a legacy plan
 * with no style/material normalises to the kind's default and groups exactly as
 * before. Each mark records its count, size (W×H), sill, the swing/hinge +
 * style/material of a door, and the distinct rooms it appears in.
 *
 * Pure logic only (no React, no three) so it stays fully unit-testable; the
 * report's "Openings schedule" section is presentation over the marks this
 * returns. Openings on a missing wall, or whose probe lands in no room, fall
 * into an `unassigned` bucket rather than crashing.
 */
import { resolveDoorLeafMaterialKind } from '../floorplan/doorMaterial'
import { isMultiLevel, levelAsPlan, planLevels } from '../floorplan/levels'
import type { FloorPlan, PlanOpening, PlanRoom, PlanWall } from '../floorplan/types'
import { pointInRoom, wallLength } from '../floorplan/types'

/**
 * How far (m) to nudge an opening's centre perpendicular to its wall when
 * probing which room(s) it borders — enough to clear the wall thickness, small
 * enough to land inside a shallow room. Matches `daylight.ts`'s `PROBE_OFFSET`.
 */
const PROBE_OFFSET = 0.2

/** Tolerance (m) for grouping near-identical sizes into the same mark. */
const SIZE_EPS = 1e-3

/** A grouped door/window type ("mark"). */
interface OpeningMark {
  /** Typed mark label: `D1`, `D2`… for doors, `W1`, `W2`… for windows. */
  mark: string
  kind: 'door' | 'window'
  /** Opening width (m). */
  width: number
  /** Opening height = head − sill (m). */
  height: number
  /** Sill height above floor (m); 0 for doors. */
  sill: number
  /** Number of openings of this type. */
  count: number
  /** Door leaf swing side ('left' | 'right'); undefined for windows / unset. */
  swing?: 'left' | 'right'
  /** Door hinge jamb ('start' | 'end'); undefined for windows / unset. */
  hinge?: 'start' | 'end'
  /** Normalised leaf/type style — door (`panel`/`flush`/`glazed`/`bifold`/
   *  `sliding`/`double`) or window (`plain`/`grille`/`invisible-grille`/
   *  `louvre`); defaults resolved (door→`panel`, window→`plain`). Part of the
   *  grouping key, so two same-size openings of different styles are separate
   *  marks. Use {@link openingStyleLabel} for a human-readable label. */
  style: string
  /** Door leaf finish, resolved via `resolveDoorLeafMaterialKind`
   *  (`painted`/`wood`/`vinyl`); undefined for windows (they carry no
   *  material). Part of the grouping key for doors. */
  material?: string
  /** Distinct room names this mark appears in, sorted; `['Unassigned']` when
   *  none of its openings resolve to a room. */
  rooms: string[]
}

/** Human-readable door style labels (schedule column / plan legend). */
export const DOOR_STYLE_LABELS: Record<string, string> = {
  panel: 'Panel',
  flush: 'Flush',
  glazed: 'Glazed',
  bifold: 'Bifold',
  sliding: 'Sliding',
  double: 'Double',
}

/** Human-readable window style labels. */
export const WINDOW_STYLE_LABELS: Record<string, string> = {
  plain: 'Plain',
  grille: 'Grille',
  'invisible-grille': 'Invisible grille',
  louvre: 'Louvre',
}

/** Human-readable door leaf-material labels. */
export const DOOR_MATERIAL_LABELS: Record<string, string> = {
  painted: 'Painted',
  wood: 'Wood',
  vinyl: 'Vinyl',
}

/** Sentence-case a raw style/material token as a last-resort label. */
function titleCase(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s
}

/** Human-readable style label for a mark's `kind`/`style` (defaults resolved). */
export function openingStyleLabel(kind: 'door' | 'window', style: string | undefined): string {
  if (kind === 'door') return DOOR_STYLE_LABELS[style ?? 'panel'] ?? titleCase(style ?? 'panel')
  return WINDOW_STYLE_LABELS[style ?? 'plain'] ?? titleCase(style ?? 'plain')
}

/** Human-readable label for a door's resolved leaf material. */
export function doorMaterialLabel(material: string | undefined): string {
  return DOOR_MATERIAL_LABELS[material ?? 'painted'] ?? titleCase(material ?? 'painted')
}

/** Combined "Style · Material" label for a schedule row: doors read
 *  "Sliding · Wood", windows just their style ("Grille"). */
export function openingStyleMaterialLabel(m: {
  kind: 'door' | 'window'
  style?: string
  material?: string
}): string {
  const s = openingStyleLabel(m.kind, m.style)
  return m.kind === 'door' ? `${s} · ${doorMaterialLabel(m.material)}` : s
}

/** Whole-schedule result. */
export interface OpeningSchedule {
  /** Door marks (D1, D2…) then window marks (W1, W2…), in discovery order. */
  marks: OpeningMark[]
  /** Total door openings across the plan. */
  doorCount: number
  /** Total window openings across the plan. */
  windowCount: number
}

/** Unit-direction + perpendicular of a wall, or null for a zero-length wall. */
function wallAxes(w: PlanWall): { ux: number; uz: number; px: number; pz: number } | null {
  const len = wallLength(w)
  if (len <= 0) return null
  const ux = (w.end[0] - w.start[0]) / len
  const uz = (w.end[1] - w.start[1]) / len
  // Perpendicular (rotate the unit vector 90°).
  return { ux, uz, px: -uz, pz: ux }
}

/**
 * The rooms an opening borders. The opening's centre sits on its wall; we probe
 * a short distance to each side and collect every room a probe point lands in
 * (a door usually borders two rooms; a window onto the outside borders one).
 * Returns an empty array when the wall is missing or no room is found.
 */
function roomsForOpening(
  rooms: PlanRoom[],
  wallsById: Map<string, PlanWall>,
  o: PlanOpening,
): PlanRoom[] {
  const wall = wallsById.get(o.wallId)
  if (!wall) return []
  const axes = wallAxes(wall)
  if (!axes) return []
  const len = wallLength(wall)
  // Opening centre along the wall (clamped into the wall span for safety).
  const s = Math.max(0, Math.min(len, o.offset + o.width / 2))
  const cx = wall.start[0] + axes.ux * s
  const cz = wall.start[1] + axes.uz * s
  const found: PlanRoom[] = []
  for (const sign of [1, -1]) {
    const px = cx + axes.px * PROBE_OFFSET * sign
    const pz = cz + axes.pz * PROBE_OFFSET * sign
    for (const r of rooms) {
      if (pointInRoom(r, px, pz) && !found.includes(r)) found.push(r)
    }
  }
  return found
}

/** Opening height (m): head − sill, floored at 0. */
function openingHeight(o: PlanOpening): number {
  return Math.max(0, o.head - o.sill)
}

/**
 * Internal accumulator for one mark before it gets its label — keyed by
 * (kind, width, height, style, material) so identical openings collapse
 * together but a differing style/material splits into its own mark.
 */
interface MarkAcc {
  kind: 'door' | 'window'
  width: number
  height: number
  sill: number
  count: number
  swing?: 'left' | 'right'
  hinge?: 'start' | 'end'
  style: string
  material?: string
  /** The grouping key (cached for the stable discovery-order sort). */
  key: string
  rooms: Set<string>
}

/** Normalised style token for grouping — an explicit `style`, else the
 *  kind's documented default (door→`panel`, window→`plain`) so a legacy
 *  opening with no `style` groups exactly as it did before styles existed. */
function normalizedStyle(o: PlanOpening): string {
  return o.kind === 'door' ? (o.style ?? 'panel') : (o.style ?? 'plain')
}

/** Normalised leaf material for grouping — the RESOLVED door finish
 *  (`resolveDoorLeafMaterialKind`, defaults `vinyl` for bifold else `painted`);
 *  `undefined` for windows (they carry no material). */
function normalizedMaterial(o: PlanOpening): string | undefined {
  return o.kind === 'door' ? resolveDoorLeafMaterialKind(o) : undefined
}

/**
 * Group key quantises dimensions so floating-point dupes still match, and
 * folds in the normalised style + material axes (`openingStyles`,
 * v0.22.2.64+) so a sliding door and a swing door of identical size — or a
 * grille window and a plain one — become SEPARATE schedule marks (different
 * products/installation on a contractor's schedule). A legacy opening with no
 * style/material normalises to the kind's default, so a plan predating those
 * fields groups byte-identically to before.
 */
function markKey(o: PlanOpening): string {
  const q = (n: number) => Math.round(n / SIZE_EPS)
  return `${o.kind}:${q(o.width)}:${q(openingHeight(o))}:${normalizedStyle(o)}:${normalizedMaterial(o) ?? ''}`
}

/**
 * Builds the door & window schedule. Iterates each storey against ITS OWN
 * walls/rooms (a ground door must not resolve to an upstairs room at the same
 * XZ), accumulating openings into marks; marks are sorted doors-first then by
 * discovery, and labelled D1/D2…/W1/W2…
 */
export function buildOpeningSchedule(plan: FloorPlan): OpeningSchedule {
  // Multi-storey: flatten each storey's (opening, resolved-rooms) pairs, then
  // group across the whole plan so identical openings on different storeys share
  // a mark. Single-level plans skip straight through.
  const levels = isMultiLevel(plan) ? planLevels(plan).map((l) => levelAsPlan(plan, l)) : [plan]

  // Discovery-ordered accumulators keyed by (kind,width,height).
  const accs = new Map<string, MarkAcc>()
  const order: string[] = []
  let doorCount = 0
  let windowCount = 0

  for (const level of levels) {
    const planOpenings = Array.isArray(level.openings) ? level.openings : []
    const planWalls = Array.isArray(level.walls) ? level.walls : []
    const planRooms = Array.isArray(level.rooms) ? level.rooms : []
    const wallsById = new Map(planWalls.map((w) => [w.id, w]))

    for (const o of planOpenings) {
      if (o.kind !== 'door' && o.kind !== 'window') continue
      if (o.kind === 'door') doorCount++
      else windowCount++
      const height = openingHeight(o)
      const key = markKey(o)
      let acc = accs.get(key)
      if (!acc) {
        acc = {
          kind: o.kind,
          width: o.width,
          height,
          sill: o.sill,
          count: 0,
          swing: o.kind === 'door' ? (o.swing ?? 'right') : undefined,
          hinge: o.kind === 'door' ? (o.hinge ?? 'start') : undefined,
          style: normalizedStyle(o),
          material: normalizedMaterial(o),
          key,
          rooms: new Set<string>(),
        }
        accs.set(key, acc)
        order.push(key)
      }
      acc.count++
      const rooms = roomsForOpening(planRooms, wallsById, o)
      if (rooms.length === 0) acc.rooms.add('Unassigned')
      else for (const r of rooms) acc.rooms.add(r.name)
    }
  }

  // Doors first (D1, D2…) then windows (W1, W2…), each in discovery order.
  const ordered = order
    .map((k) => accs.get(k)!)
    .sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === 'door' ? -1 : 1
      return order.indexOf(a.key) - order.indexOf(b.key)
    })
  let dN = 0
  let wN = 0
  const marks: OpeningMark[] = ordered.map((acc) => {
    const mark = acc.kind === 'door' ? `D${++dN}` : `W${++wN}`
    // 'Unassigned' sorts last so resolved rooms read first.
    const rooms = [...acc.rooms].sort((a, b) =>
      a === 'Unassigned' ? 1 : b === 'Unassigned' ? -1 : a.localeCompare(b),
    )
    return {
      mark,
      kind: acc.kind,
      width: acc.width,
      height: acc.height,
      sill: acc.sill,
      count: acc.count,
      swing: acc.swing,
      hinge: acc.hinge,
      style: acc.style,
      material: acc.material,
      rooms,
    }
  })

  return { marks, doorCount, windowCount }
}

/**
 * Assigns each door/window opening (across EVERY storey) a schedule mark
 * (`D1`, `D2`… / `W1`, `W2`…), keyed by opening id — a per-opening variant of
 * the grouping `buildOpeningSchedule` aggregates, using the SAME `markKey`
 * (kind, width, head−sill, style, material) and the SAME level order
 * (`planLevels`, ground first), so the two can never assign a different mark
 * to the same opening.
 *
 * H1-F / multi-storey fix: this now flattens `planLevels(plan)` in level
 * order and numbers ONCE over the whole plan, rather than over a single
 * opening list. Consumers that render one storey at a time (the drawing set's
 * per-level FLOOR-PLAN sheet via `reportPlanSvg`) must derive their callouts
 * from THIS whole-plan map — passing only a stripped single level would
 * restart numbering (an upper-floor door showing `D1` while the schedule
 * lists it `D2`). `export/dxf.ts` (which exports the ground storey only) looks
 * up its ground openings in this same map, so its marks agree with the
 * schedule for the openings it draws.
 */
export function assignOpeningMarks(plan: FloorPlan): Map<string, string> {
  const openings = planLevels(plan).flatMap((l) => (Array.isArray(l.openings) ? l.openings : []))
  const order: string[] = []
  const seen = new Set<string>()
  for (const o of openings) {
    if (o.kind !== 'door' && o.kind !== 'window') continue
    const key = markKey(o)
    if (!seen.has(key)) {
      seen.add(key)
      order.push(key)
    }
  }
  const labelByKey = new Map<string, string>()
  let dN = 0
  let wN = 0
  for (const key of order) {
    labelByKey.set(key, key.startsWith('door:') ? `D${++dN}` : `W${++wN}`)
  }
  const labelByOpening = new Map<string, string>()
  for (const o of openings) {
    if (o.kind !== 'door' && o.kind !== 'window') continue
    const label = labelByKey.get(markKey(o))
    if (label) labelByOpening.set(o.id, label)
  }
  return labelByOpening
}
