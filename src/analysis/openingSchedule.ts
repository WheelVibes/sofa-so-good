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
   *  none of its openings resolve to a room. Deduped across storeys. */
  rooms: string[]
  /** Per-storey breakdown of {@link rooms}, ground-first, for a MULTI-STOREY
   *  plan — so a mark repeated across floors (e.g. `D2 ×4`) reads
   *  "Ground floor: Powder · Upper: Bedroom 1, Bedroom 2" instead of one flat
   *  hard-to-scan list. Empty on a single-storey plan (use {@link rooms}).
   *  Levels with no resolved room for this mark are omitted. */
  roomsByLevel: { level: string; rooms: string[] }[]
}

/** Human-readable door style labels (schedule column / plan legend). */
const DOOR_STYLE_LABELS: Record<string, string> = {
  panel: 'Panel',
  flush: 'Flush',
  glazed: 'Glazed',
  bifold: 'Bifold',
  sliding: 'Sliding',
  double: 'Double',
}

/** Human-readable window style labels. */
const WINDOW_STYLE_LABELS: Record<string, string> = {
  plain: 'Plain',
  grille: 'Grille',
  'invisible-grille': 'Invisible grille',
  louvre: 'Louvre',
}

/** Human-readable door leaf-material labels. */
const DOOR_MATERIAL_LABELS: Record<string, string> = {
  painted: 'Painted',
  wood: 'Wood',
  vinyl: 'Vinyl',
}

/** Sentence-case a raw style/material token as a last-resort label. */
function titleCase(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s
}

/** Human-readable style label for a mark's `kind`/`style` (defaults resolved). */
function openingStyleLabel(kind: 'door' | 'window', style: string | undefined): string {
  if (kind === 'door') return DOOR_STYLE_LABELS[style ?? 'panel'] ?? titleCase(style ?? 'panel')
  return WINDOW_STYLE_LABELS[style ?? 'plain'] ?? titleCase(style ?? 'plain')
}

/** Human-readable label for a door's resolved leaf material. */
function doorMaterialLabel(material: string | undefined): string {
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

/**
 * The Rooms-column text for a schedule row. On a MULTI-STOREY plan a mark
 * repeated across floors groups its rooms by storey — "Ground floor: Powder ·
 * Upper: Bedroom 1, Bedroom 2, Bedroom 3" — so a high-count mark (e.g. `D2 ×4`)
 * stays scannable instead of listing every room in one flat run. A single-
 * storey plan (empty `roomsByLevel`) falls back to the flat, comma-joined list.
 * Shared by the report section AND the drawing-set schedule sheet so the two
 * never drift.
 */
export function openingRoomsLabel(m: Pick<OpeningMark, 'rooms' | 'roomsByLevel'>): string {
  if (m.roomsByLevel && m.roomsByLevel.length > 0) {
    return m.roomsByLevel.map((g) => `${g.level}: ${g.rooms.join(', ')}`).join(' · ')
  }
  return m.rooms.join(', ')
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

/** Outcome of probing both sides of an opening for the rooms it borders. */
interface OpeningRoomProbe {
  /** Distinct rooms bordering the opening (0, 1, or 2 in a well-formed plan). */
  rooms: PlanRoom[]
  /** How many of the two probe sides landed in at least one room (0, 1, or 2).
   *  `< 2` means one side opens to the outside / an un-roomed gap. */
  resolvedSides: number
  /** True when the opening's host wall is an external/perimeter wall — used to
   *  distinguish a door onto the outside (an entrance) from one onto an
   *  un-roomed interior gap. */
  exteriorWall: boolean
}

/**
 * The rooms an opening borders. The opening's centre sits on its wall; we probe
 * a short distance to each side and collect every room a probe point lands in
 * (a door usually borders two rooms; a window onto the outside borders one).
 * Also reports how many sides resolved + whether the host wall is external, so
 * the schedule can label an entrance door ("<Room> (entry)" / "External (entry)")
 * rather than a bare "Unassigned" when one side opens to the outside.
 */
function probeOpeningRooms(
  rooms: PlanRoom[],
  wallsById: Map<string, PlanWall>,
  o: PlanOpening,
): OpeningRoomProbe {
  const wall = wallsById.get(o.wallId)
  if (!wall) return { rooms: [], resolvedSides: 0, exteriorWall: false }
  const exteriorWall = wall.thickness === 'external'
  const axes = wallAxes(wall)
  if (!axes) return { rooms: [], resolvedSides: 0, exteriorWall }
  const len = wallLength(wall)
  // Opening centre along the wall (clamped into the wall span for safety).
  const s = Math.max(0, Math.min(len, o.offset + o.width / 2))
  const cx = wall.start[0] + axes.ux * s
  const cz = wall.start[1] + axes.uz * s
  const found: PlanRoom[] = []
  let resolvedSides = 0
  for (const sign of [1, -1]) {
    const px = cx + axes.px * PROBE_OFFSET * sign
    const pz = cz + axes.pz * PROBE_OFFSET * sign
    let sideHit = false
    for (const r of rooms) {
      if (pointInRoom(r, px, pz)) {
        sideHit = true
        if (!found.includes(r)) found.push(r)
      }
    }
    if (sideHit) resolvedSides++
  }
  return { rooms: found, resolvedSides, exteriorWall }
}

/** Sentinel Rooms-column labels for openings that don't resolve to two rooms. */
const UNASSIGNED = 'Unassigned'
const EXTERNAL_ENTRY = 'External (entry)'

/**
 * The Rooms-column label(s) for a single opening, given its probe result.
 * A door onto the outside is an ENTRANCE, not an orphan: with one interior
 * room resolved on an exterior wall it reads "<Room> (entry)" (e.g. "Service
 * Yard (entry)"); with no interior room on an exterior wall it reads
 * "External (entry)" (a perimeter door into an un-roomed circulation gap — the
 * HDB main-door case) rather than "Unassigned". Windows keep their existing
 * behaviour (the single bordering room, or "Unassigned" when orphaned).
 */
function openingRoomLabels(kind: 'door' | 'window', probe: OpeningRoomProbe): string[] {
  const names = probe.rooms.map((r) => r.name)
  if (kind === 'door') {
    if (names.length === 0) return [probe.exteriorWall ? EXTERNAL_ENTRY : UNASSIGNED]
    if (names.length === 1 && probe.resolvedSides < 2 && probe.exteriorWall) {
      return [`${names[0]} (entry)`]
    }
    return names
  }
  // Windows: the bordering room(s), else Unassigned (an orphaned window is a
  // data artefact, not an entrance — no "External" fallback).
  return names.length === 0 ? [UNASSIGNED] : names
}

/** Rooms-column sort: real rooms first (alphabetical), then "Unassigned" last. */
function sortRoomLabels(labels: Iterable<string>): string[] {
  return [...labels].sort((a, b) =>
    a === UNASSIGNED ? 1 : b === UNASSIGNED ? -1 : a.localeCompare(b),
  )
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
  /** Room labels per storey (levelName → set), insertion-ordered ground-first.
   *  A single-storey plan uses the empty-string key. */
  roomsByLevel: Map<string, Set<string>>
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
  // a mark. Single-level plans skip straight through (one anonymous level).
  const multi = isMultiLevel(plan)
  const levels = multi
    ? planLevels(plan).map((l) => ({ name: l.name, plan: levelAsPlan(plan, l) }))
    : [{ name: '', plan }]

  // Discovery-ordered accumulators keyed by (kind,width,height).
  const accs = new Map<string, MarkAcc>()
  const order: string[] = []
  let doorCount = 0
  let windowCount = 0

  for (const level of levels) {
    const planOpenings = Array.isArray(level.plan.openings) ? level.plan.openings : []
    const planWalls = Array.isArray(level.plan.walls) ? level.plan.walls : []
    const planRooms = Array.isArray(level.plan.rooms) ? level.plan.rooms : []
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
          roomsByLevel: new Map<string, Set<string>>(),
        }
        accs.set(key, acc)
        order.push(key)
      }
      acc.count++
      const labels = openingRoomLabels(o.kind, probeOpeningRooms(planRooms, wallsById, o))
      let levelSet = acc.roomsByLevel.get(level.name)
      if (!levelSet) {
        levelSet = new Set<string>()
        acc.roomsByLevel.set(level.name, levelSet)
      }
      for (const label of labels) levelSet.add(label)
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
    // Flat list: union across every storey, deduped, 'Unassigned' last.
    const flat = new Set<string>()
    for (const set of acc.roomsByLevel.values()) for (const label of set) flat.add(label)
    const rooms = sortRoomLabels(flat)
    // Per-storey breakdown (multi-storey only): ground-first (Map insertion
    // order), each storey's labels sorted, empty storeys omitted.
    const roomsByLevel = multi
      ? [...acc.roomsByLevel.entries()]
          .filter(([, set]) => set.size > 0)
          .map(([level, set]) => ({ level, rooms: sortRoomLabels(set) }))
      : []
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
      roomsByLevel,
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
