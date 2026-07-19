/**
 * Aircon placement (BSJ-2) — pure geometry that turns an `AirconSystemPlan`
 * into the furniture items the "Plan aircon" action commits: one wall-mounted
 * FCU (`aircon-unit`) per served room and the outdoor condenser(s)
 * (`aircon-condenser`) on the AC-ledge / service-yard room.
 *
 * Pure + render-agnostic (no store / React / three) so it's unit-testable: it
 * returns plain placement descriptors (defId + position + rotation + props +
 * levelId); the store action assigns ids and commits them in one undo step.
 *
 * Placement conventions (see docs/interior-design-guidelines.md):
 *  - FCU: high on the room's exterior wall (fallback: longest wall clear of a
 *    door), just proud of the wall face, facing INTO the room, at mount height.
 *  - Condenser: on the floor of the AC-ledge room (by name), else the service
 *    yard, else a balcony; multiple condensers are spaced along the ledge.
 */

import { allPlanRooms, GROUND_LEVEL_ID, levelOfRoom } from '../floorplan/levels'
import type { PlanClippedWall } from '../floorplan/planRoomShell'
import { planRoomShell } from '../floorplan/planRoomShell'
import { roomCategory } from '../floorplan/roomCategory'
import type { FloorPlan } from '../floorplan/types'
import type { ParamProps } from '../furniture/types'
import type { AirconSystemPlan } from './airconSystem'

/** FCU body depth (m) — mirrors the `AirconUnit` primitive's `bodyD`. */
const FCU_BODY_DEPTH = 0.21
/** How far the FCU sits proud of the wall face, into the room (m). */
const FCU_WALL_OFFSET = FCU_BODY_DEPTH / 2 + 0.02
/** FCU mount height (m, centre of the body) — the def default. */
const FCU_MOUNT_HEIGHT = 2.25
/** Spacing between multiple condensers along the ledge (m). */
const CONDENSER_SPACING = 1.0

/** A furniture item the planner wants placed (id assigned by the caller). */
export interface PlannedAirconItem {
  defId: 'aircon-unit' | 'aircon-condenser'
  position: [number, number]
  rotation: number
  props: ParamProps
  /** Storey the item sits on (omit for ground). */
  levelId?: string
  /** Room the item serves / sits in (reference only). */
  roomId: string
}

const midpoint = (w: PlanClippedWall): [number, number] => [
  (w.start[0] + w.end[0]) / 2,
  (w.start[1] + w.end[1]) / 2,
]

const wallLen = (w: PlanClippedWall): number =>
  Math.hypot(w.end[0] - w.start[0], w.end[1] - w.start[1])

/** Choose the wall to mount a room's FCU on: prefer an EXTERIOR wall (aircon
 *  pipes run out to the ledge from an external wall), skip walls carrying a
 *  door, and among candidates pick the longest. Falls back to the longest wall
 *  overall when nothing better exists. */
function pickFcuWall(shell: ReturnType<typeof planRoomShell>): PlanClippedWall | null {
  if (!shell || shell.walls.length === 0) return null
  const doorWallIds = new Set(
    shell.openings.filter((o) => o.opening.kind === 'door').map((o) => o.opening.wallId),
  )
  const byLen = (a: PlanClippedWall, b: PlanClippedWall) => wallLen(b) - wallLen(a)
  const external = shell.walls
    .filter((w) => w.thickness === 'external' && !doorWallIds.has(w.wallId) && wallLen(w) > 0.5)
    .sort(byLen)
  if (external[0]) return external[0]
  const clear = shell.walls
    .filter((w) => !doorWallIds.has(w.wallId) && wallLen(w) > 0.5)
    .sort(byLen)
  if (clear[0]) return clear[0]
  return [...shell.walls].sort(byLen)[0] ?? null
}

/** FCU placement for one room: midpoint of the chosen wall, nudged into the
 *  room, facing the room centre. Returns null when the room has no usable
 *  geometry. */
function placeFcu(plan: FloorPlan, roomId: string): PlannedAirconItem | null {
  const shell = planRoomShell(plan, roomId)
  if (!shell) return null
  const wall = pickFcuWall(shell)
  if (!wall) return null
  const m = midpoint(wall)
  // Inward normal = the wall's PERPENDICULAR (not the midpoint→centre vector, which
  // tilts the unit off the wall for an off-centre room), oriented toward the room
  // centre so the FCU sits flush and faces into the room.
  const dx = wall.end[0] - wall.start[0]
  const dz = wall.end[1] - wall.start[1]
  const wlen = Math.hypot(dx, dz)
  let nx = wlen < 1e-6 ? 0 : -dz / wlen
  let nz = wlen < 1e-6 ? 1 : dx / wlen
  // Flip to point toward the room centre.
  if (nx * (shell.center[0] - m[0]) + nz * (shell.center[1] - m[1]) < 0) {
    nx = -nx
    nz = -nz
  }
  const pos: [number, number] = [m[0] + nx * FCU_WALL_OFFSET, m[1] + nz * FCU_WALL_OFFSET]
  // Item faces local +Z; world forward after Y-rotation θ is (sinθ, cosθ), so to
  // face the inward normal (nx, nz): θ = atan2(nx, nz).
  const rotation = Math.atan2(nx, nz)
  // Size the FCU to the wall (clamped to the def's 0.7–1.1 m range).
  const width = Math.min(1.1, Math.max(0.7, wallLen(wall) * 0.4))
  const level = levelOfRoom(plan, roomId)
  const levelId = level && level.id !== GROUND_LEVEL_ID ? level.id : undefined
  return {
    defId: 'aircon-unit',
    position: pos,
    rotation,
    props: { width: Math.round(width * 100) / 100, mountHeight: FCU_MOUNT_HEIGHT },
    roomId,
    ...(levelId ? { levelId } : {}),
  }
}

/** Find the room the condenser(s) sit on: AC ledge by name first, else a
 *  service yard, else a balcony. Returns null when the plan has none. */
export function findLedgeRoom(plan: FloorPlan): string | null {
  const rooms = allPlanRooms(plan)
  const byLedgeName = rooms.find((r) => /ledge/i.test(r.name))
  if (byLedgeName) return byLedgeName.id
  const byYard = rooms.find((r) => roomCategory(r) === 'serviceYard')
  if (byYard) return byYard.id
  const byBalcony = rooms.find((r) => roomCategory(r) === 'balcony')
  if (byBalcony) return byBalcony.id
  return null
}

/** Condenser placements: `count` outdoor units spread along the ledge room's
 *  longer axis, on the floor. Returns [] when there's no ledge/yard/balcony. */
function placeCondensers(plan: FloorPlan, count: number): PlannedAirconItem[] {
  if (count <= 0) return []
  const ledgeId = findLedgeRoom(plan)
  if (!ledgeId) return []
  const shell = planRoomShell(plan, ledgeId)
  if (!shell) return []
  const [cx, cz] = shell.center
  const rect = shell.rects[0]
  // Spread along the room's longer plan axis, centred on the room.
  const spanX = rect ? Math.abs(rect.x1 - rect.x0) : 0
  const spanZ = rect ? Math.abs(rect.z1 - rect.z0) : 0
  const alongX = spanX >= spanZ
  const level = levelOfRoom(plan, ledgeId)
  const levelId = level && level.id !== GROUND_LEVEL_ID ? level.id : undefined
  const out: PlannedAirconItem[] = []
  for (let i = 0; i < count; i++) {
    const off = (i - (count - 1) / 2) * CONDENSER_SPACING
    const pos: [number, number] = alongX ? [cx + off, cz] : [cx, cz + off]
    out.push({
      defId: 'aircon-condenser',
      position: pos,
      rotation: 0,
      props: {},
      roomId: ledgeId,
      ...(levelId ? { levelId } : {}),
    })
  }
  return out
}

/**
 * Full placement set for a system plan: one FCU per served room (skipping rooms
 * with no usable geometry) plus one condenser per system on the ledge. Pure —
 * the caller assigns ids and commits in a single undo step.
 */
export function planAirconPlacements(
  plan: FloorPlan,
  systemPlan: AirconSystemPlan,
): PlannedAirconItem[] {
  const fcuItems: PlannedAirconItem[] = []
  for (const system of systemPlan.systems) {
    for (const fcu of system.fcus) {
      const item = placeFcu(plan, fcu.roomId)
      if (item) fcuItems.push(item)
    }
  }
  const condensers = placeCondensers(plan, systemPlan.condenserCount)
  return [...fcuItems, ...condensers]
}
