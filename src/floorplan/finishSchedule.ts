/**
 * Contractor-grade finish schedule (PARITY-LIGHTINGTEMPLATE-TEXT — material
 * callouts; G4 — finish schedule depth).
 *
 * Pure: lists every room (across storeys) with its resolved floor + wall +
 * ceiling finish **names**, stable keyed **material codes** (`FL-01`/`WL-01`/
 * `CL-01`, `AW-01` for accent walls), and **quantities** (floor area, wall
 * area NET of door/window openings, ceiling area) — the material callout +
 * takeoff table a builder prices from (Coohom / SH3D parity, contractor
 * handover conventions). `nameOf` maps a material id to a display name
 * (injected so this stays pure + unit-testable).
 *
 * Self-contained: imports only sibling pure modules + types.
 */

import { allPlanRooms, type PlanLevel, planLevels } from './levels'
import { openingProbePoints } from './openingProbe'
import {
  type RoomFinishMaps,
  resolvePlanRoomCeiling,
  resolvePlanRoomFloor,
  resolvePlanRoomWall,
} from './roomFinishes'
import type { CeilingConfig, FloorPlan, PlanOpening, PlanRoom, PlanWall } from './types'
import { planRoomArea, planRoomPerimeter, pointInRoom, wallLength } from './types'

/** Shown when a room never had a wall finish picked (neutral plaster shell). */
export const NEUTRAL_WALL = 'Plaster (neutral)'

/** Shown when a room never had a ceiling finish picked (plain painted ceiling). */
export const DEFAULT_CEILING = 'Ceiling paint (default white)'

/** Sentinel keys for the (no finish set) buckets, so they still get a stable
 *  material code and roll into the totals like any other finish. Chosen so
 *  they can never collide with a real catalog/custom-colour material id. */
const NEUTRAL_WALL_KEY = '__neutral_wall__'
const DEFAULT_CEILING_KEY = '__default_ceiling__'

/** How far (m) to nudge an opening's centre perpendicular to its wall when
 *  probing which room(s) it borders — matches `openingSchedule.ts`/`daylight.ts`. */
const PROBE_OFFSET = 0.2

/** Caveat every quantity in the schedule carries — plan-derived areas are an
 *  estimate, not a site survey. */
export const AREA_CAVEAT = 'Areas are approximate — verify on site.'

/** One resolved finish, keyed + display-named, with its schedule quantity. */
export interface FinishCell {
  /** Stable material code (`FL-01`, `WL-01`, `CL-01`). */
  code: string
  /** Display name (resolved via `nameOf`, or the neutral/default label). */
  name: string
  /** Quantity for THIS room (m²). */
  area: number
  /** Optional honest tiling-scale spec (`floorTexScale`) — never an invented
   *  physical size; only shown when a non-default scale is set. Floor only. */
  spec?: string
  /** Optional ceiling-treatment note (tray/coffered/dropped/sloped) — the
   *  ceiling area is still the flat footprint; the treatment adds real
   *  surface the flat number doesn't capture. Ceiling only. */
  note?: string
}

/** One row of the finish schedule: a room's floor + wall + ceiling finish,
 *  each with its stable code and area quantity. */
export interface FinishRow {
  /** Room name. */
  room: string
  floor: FinishCell
  wall: FinishCell
  ceiling: FinishCell
}

/** An accent wall (a `PlanWall.color` override) — a separate callout row: the
 *  specific wall face, its colour, orientation, and NET-of-openings area. */
export interface AccentWallRow {
  wallId: string
  /** Stable material code (`AW-01`), keyed by distinct colour. */
  code: string
  /** Hex colour override. */
  color: string
  /** Coarse run direction — the compass detail a builder needs to find the wall. */
  orientation: string
  /** Room(s) this wall face borders, sorted; empty when none resolve. */
  rooms: string[]
  /** This wall face's area (m²), net of its own door/window openings. */
  area: number
}

/** One aggregated row a contractor prices from: total area for one material
 *  code, across every room/wall that uses it. */
export interface FinishTotal {
  code: string
  name: string
  kind: 'floor' | 'wall' | 'ceiling' | 'accent'
  area: number
}

export interface FinishSchedule {
  rows: FinishRow[]
  accentWalls: AccentWallRow[]
  totals: FinishTotal[]
  /** Verify-on-site caveat, surfaced once for renderers to print alongside the tables. */
  caveat: string
}

/** Area (m²) of a door/window opening (width × (head − sill), floored at 0). */
function openingArea(o: PlanOpening): number {
  return o.width * Math.max(0, o.head - o.sill)
}

/** Per-room deduction (m²) for openings that border it, on ONE level. An
 *  opening probes both sides of its wall (`openingProbePoints`) and its area
 *  is deducted from every room a probe point lands in (each bordering room
 *  independently loses that much of its OWN wall face — not halved/shared). */
function wallOpeningDeductionsByRoom(
  rooms: readonly PlanRoom[],
  walls: readonly PlanWall[],
  openings: readonly PlanOpening[],
): Map<string, number> {
  const wallsById = new Map(walls.map((w) => [w.id, w]))
  const deductions = new Map<string, number>()
  for (const o of openings) {
    const wall = wallsById.get(o.wallId)
    if (!wall) continue
    const area = openingArea(o)
    if (area <= 0) continue
    const probe = openingProbePoints(wall, o, PROBE_OFFSET, true)
    if (!probe) continue
    const touched = new Set<string>()
    for (const [px, pz] of [probe.plus, probe.minus]) {
      for (const r of rooms) {
        if (pointInRoom(r, px, pz)) touched.add(r.id)
      }
    }
    for (const id of touched) deductions.set(id, (deductions.get(id) ?? 0) + area)
  }
  return deductions
}

/** Openings whose area is deducted from a SPECIFIC wall's own face (not a room). */
function openingsAreaOnWall(wallId: string, openings: readonly PlanOpening[]): number {
  return openings.filter((o) => o.wallId === wallId).reduce((sum, o) => sum + openingArea(o), 0)
}

/** Rooms a wall borders — probes both sides at every opening it hosts, plus its
 *  own midpoint (covers a solid accent wall with no openings at all). */
function roomsAlongWall(
  wall: PlanWall,
  rooms: readonly PlanRoom[],
  openings: readonly PlanOpening[],
): Set<string> {
  const touched = new Set<string>()
  const probeBothSides = (px0: number, pz0: number, nx: number, nz: number) => {
    for (const sign of [1, -1]) {
      const px = px0 + nx * PROBE_OFFSET * sign
      const pz = pz0 + nz * PROBE_OFFSET * sign
      for (const r of rooms) if (pointInRoom(r, px, pz)) touched.add(r.name)
    }
  }
  const wallOpenings = openings.filter((o) => o.wallId === wall.id)
  for (const o of wallOpenings) {
    const probe = openingProbePoints(wall, o, PROBE_OFFSET, true)
    if (probe) probeBothSides(probe.center[0], probe.center[1], probe.normal[0], probe.normal[1])
  }
  if (wallOpenings.length === 0) {
    const len = wallLength(wall)
    if (len > 0) {
      const ux = (wall.end[0] - wall.start[0]) / len
      const uz = (wall.end[1] - wall.start[1]) / len
      const mx = (wall.start[0] + wall.end[0]) / 2
      const mz = (wall.start[1] + wall.end[1]) / 2
      probeBothSides(mx, mz, -uz, ux)
    }
  }
  return touched
}

/** Coarse compass run for a wall — enough to locate it on the plan without a
 *  full bearing calculation. */
function wallOrientation(w: PlanWall): string {
  const dx = Math.abs(w.end[0] - w.start[0])
  const dz = Math.abs(w.end[1] - w.start[1])
  return dx >= dz ? 'E–W run' : 'N–S run'
}

/** Honest tiling-scale spec: `floorTexScale` is a UV repeat multiplier, not a
 *  physical size (no base tile dimension is stored anywhere in the model) —
 *  show the factor, never invent a mm size. Omitted for the default scale (1). */
function floorSpec(room: PlanRoom): string | undefined {
  const scale = room.floorTexScale
  if (scale === undefined || Math.abs(scale - 1) < 1e-3) return undefined
  return `×${Math.round(scale * 100) / 100} tile scale (base tile size not modelled)`
}

/** Ceiling-treatment note: a flat ceiling's area IS the floor footprint; a
 *  tray/coffered/dropped/sloped treatment adds real surface the flat number
 *  can't capture, so it's flagged rather than silently under-counted. */
function ceilingNote(ceiling: CeilingConfig | undefined): string | undefined {
  if (!ceiling || ceiling.style === 'flat') return undefined
  const label = ceiling.style.charAt(0).toUpperCase() + ceiling.style.slice(1)
  return `${label} ceiling — area shown is the flat footprint; treatment adds surface, verify on site`
}

/** Assigns stable codes in FIRST-SEEN order over `ids` (already the room/wall
 *  iteration order) — same input always yields the same codes, and a newly
 *  introduced finish is appended after every code already assigned rather than
 *  renumbering them. */
function assignCodes(ids: readonly string[], prefix: string): Map<string, string> {
  const codes = new Map<string, string>()
  let n = 0
  for (const id of ids) {
    if (codes.has(id)) continue
    n += 1
    codes.set(id, `${prefix}-${String(n).padStart(2, '0')}`)
  }
  return codes
}

/**
 * Build the contractor-grade finish schedule: one row per room (ground first,
 * then upper storeys) with its resolved floor/wall/ceiling finish — each
 * carrying a stable material code + area quantity — plus a separate accent-
 * wall callout list and a per-code totals row. Tolerates a plan with no rooms
 * (→ empty schedule).
 */
export function buildFinishSchedule(
  plan: FloorPlan,
  finishes: RoomFinishMaps,
  nameOf: (id: string) => string,
): FinishSchedule {
  const rooms = allPlanRooms(plan)
  // Tolerate a partial/hand-built plan (some test fixtures omit walls/openings
  // arrays entirely) — treat a missing array as empty rather than crashing.
  const levels: PlanLevel[] = planLevels(plan).map((l) => ({
    ...l,
    walls: Array.isArray(l.walls) ? l.walls : [],
    openings: Array.isArray(l.openings) ? l.openings : [],
    rooms: Array.isArray(l.rooms) ? l.rooms : [],
  }))

  // First pass: resolve every room's raw finish ids, in plan order, so codes
  // can be assigned deterministically (first-seen) before quantities are computed.
  const floorIds = rooms.map((r) => resolvePlanRoomFloor(finishes, r))
  const wallIds = rooms.map((r) => resolvePlanRoomWall(finishes, r) ?? NEUTRAL_WALL_KEY)
  const ceilingIds = rooms.map((r) => resolvePlanRoomCeiling(finishes, r) ?? DEFAULT_CEILING_KEY)
  const floorCodes = assignCodes(floorIds, 'FL')
  const wallCodes = assignCodes(wallIds, 'WL')
  const ceilingCodes = assignCodes(ceilingIds, 'CL')

  const nameFor = (id: string): string => {
    if (id === NEUTRAL_WALL_KEY) return NEUTRAL_WALL
    if (id === DEFAULT_CEILING_KEY) return DEFAULT_CEILING
    return nameOf(id)
  }

  // Discovery order for accent-wall colour codes (per plan, across all levels).
  const accentColorIds: string[] = []
  for (const level of levels) {
    for (const w of level.walls) if (w.color) accentColorIds.push(w.color)
  }
  const accentCodes = assignCodes(accentColorIds, 'AW')

  const rows: FinishRow[] = []
  const accentWalls: AccentWallRow[] = []

  for (const level of levels) {
    const ceilingHeightDefault = level.ceilingHeight ?? plan.ceilingHeight
    const deductions = wallOpeningDeductionsByRoom(level.rooms, level.walls, level.openings)

    for (const room of level.rooms) {
      const floorId = resolvePlanRoomFloor(finishes, room)
      const wallId = resolvePlanRoomWall(finishes, room) ?? NEUTRAL_WALL_KEY
      const ceilingId = resolvePlanRoomCeiling(finishes, room) ?? DEFAULT_CEILING_KEY

      const floorArea = planRoomArea(room)
      const h = room.ceilingHeight ?? ceilingHeightDefault
      const grossWall = planRoomPerimeter(room) * h
      const netWall = Math.max(0, grossWall - (deductions.get(room.id) ?? 0))
      const ceilingArea = floorArea // flat footprint; treatment flagged via ceilingNote

      rows.push({
        room: room.name,
        floor: {
          code: floorCodes.get(floorId)!,
          name: nameFor(floorId),
          area: floorArea,
          spec: floorSpec(room),
        },
        wall: {
          code: wallCodes.get(wallId)!,
          name: nameFor(wallId),
          area: netWall,
        },
        ceiling: {
          code: ceilingCodes.get(ceilingId)!,
          name: nameFor(ceilingId),
          area: ceilingArea,
          note: ceilingNote(room.ceiling),
        },
      })
    }

    // Accent walls: any wall with a per-wall colour override, on this level.
    for (const w of level.walls) {
      if (!w.color) continue
      const height = w.topHeight ?? ceilingHeightDefault
      const gross = wallLength(w) * height
      const net = Math.max(0, gross - openingsAreaOnWall(w.id, level.openings))
      const rooms2 = roomsAlongWall(w, level.rooms, level.openings)
      accentWalls.push({
        wallId: w.id,
        code: accentCodes.get(w.color)!,
        color: w.color,
        orientation: wallOrientation(w),
        rooms: [...rooms2].sort((a, b) => a.localeCompare(b)),
        area: net,
      })
    }
  }

  // Per-code totals — what a contractor actually prices from.
  const totalsMap = new Map<string, FinishTotal>()
  const bump = (code: string, name: string, kind: FinishTotal['kind'], area: number) => {
    const key = `${kind}:${code}`
    const t = totalsMap.get(key) ?? { code, name, kind, area: 0 }
    t.area += area
    totalsMap.set(key, t)
  }
  for (const row of rows) {
    bump(row.floor.code, row.floor.name, 'floor', row.floor.area)
    bump(row.wall.code, row.wall.name, 'wall', row.wall.area)
    bump(row.ceiling.code, row.ceiling.name, 'ceiling', row.ceiling.area)
  }
  for (const aw of accentWalls) {
    bump(aw.code, `Accent — ${aw.color}`, 'accent', aw.area)
  }
  const kindOrder: FinishTotal['kind'][] = ['floor', 'wall', 'ceiling', 'accent']
  const totals = [...totalsMap.values()].sort(
    (a, b) => kindOrder.indexOf(a.kind) - kindOrder.indexOf(b.kind) || a.code.localeCompare(b.code),
  )

  return { rows, accentWalls, totals, caveat: AREA_CAVEAT }
}
