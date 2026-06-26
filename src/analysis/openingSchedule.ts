/**
 * Door & window schedule (PARITY-OPENING-SCHED) — the typed-marks table an
 * architectural drawing set carries. Walks every opening across all storeys,
 * resolves the room(s) each borders (a wall-midpoint probe, the same approach
 * `analysis/daylight.ts` uses), and groups openings with identical
 * (kind, width, head − sill) into a "mark": D1/D2… for doors, W1/W2… for
 * windows. Each mark records its count, size (W×H), sill, the swing/hinge of a
 * door, and the distinct rooms it appears in.
 *
 * Pure logic only (no React, no three) so it stays fully unit-testable; the
 * report's "Openings schedule" section is presentation over the marks this
 * returns. Openings on a missing wall, or whose probe lands in no room, fall
 * into an `unassigned` bucket rather than crashing.
 */
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
export interface OpeningMark {
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
  /** Distinct room names this mark appears in, sorted; `['Unassigned']` when
   *  none of its openings resolve to a room. */
  rooms: string[]
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
 * (kind, width, height) so identical openings collapse together.
 */
interface MarkAcc {
  kind: 'door' | 'window'
  width: number
  height: number
  sill: number
  count: number
  swing?: 'left' | 'right'
  hinge?: 'start' | 'end'
  rooms: Set<string>
}

/** Group key quantises dimensions so floating-point dupes still match. */
function markKey(kind: string, width: number, height: number): string {
  const q = (n: number) => Math.round(n / SIZE_EPS)
  return `${kind}:${q(width)}:${q(height)}`
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
      const key = markKey(o.kind, o.width, height)
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
      return order.indexOf(markKeyOf(a)) - order.indexOf(markKeyOf(b))
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
      rooms,
    }
  })

  return { marks, doorCount, windowCount }
}

/** Re-derive an accumulator's group key (for the stable discovery-order sort). */
function markKeyOf(a: MarkAcc): string {
  return markKey(a.kind, a.width, a.height)
}
