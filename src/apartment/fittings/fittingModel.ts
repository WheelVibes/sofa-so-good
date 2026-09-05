/**
 * WALL-FITTINGS — the small electrical hardware every real flat has on its walls and the
 * app's 3D view never showed: light switches beside the doors, 13 A sockets along the
 * skirting, the TV and data points, aircon isolators, the water-heater switch, and the
 * distribution board by the main door. Individually tiny; collectively they are what
 * separates "a rendered box" from "a room someone wired" (v0.33.0.4).
 *
 * The 2D plan already knows these points: `plan.electricalPoints` (the MEP layer, persisted
 * when the user placed them) and `furniture/mepSuggest.ts:deriveElectricalPoints` (an
 * indicative layout from the placed appliances and doors — a switch just inside each door,
 * a socket behind each appliance). This module resolves either list onto the WALL FACES the
 * 3D shell renders: nearest wall within {@link WALL_SNAP_M}, the face on the point's own
 * side (a door switch goes on the swing side — the room the leaf opens into), plate centre
 * proud of the face by half its depth, yaw so the plate faces into the room. Points with no
 * wall near them (a socket derived under an island) are dropped rather than floated.
 *
 * Pure: no three, no store. Heights are HDB/SS 638 practice, from the MEP layer's own
 * `ELECTRICAL_MOUNT_DEFAULTS_MM` (switch 1200, socket 300, TV 400, aircon 2400, heater 1800).
 */
import { ELECTRICAL_MOUNT_DEFAULTS_MM } from '../../floorplan/mepPoints'
import { planWallThickness } from '../../floorplan/planGeometry'
import {
  type ElectricalKind,
  type FloorPlan,
  type PlanOpening,
  type PlanWall,
  pointInRoom,
} from '../../floorplan/types'

type FittingKind = ElectricalKind | 'db-box'

export interface WallFitting {
  kind: FittingKind
  /** Plate centre, world metres (x, z) and height (y). */
  x: number
  y: number
  z: number
  /** Yaw about +Y so the plate's +Z face points out of the wall into the room. */
  yaw: number
  /** Host wall, for the orbit wall-fade (a plate on a faded wall must fade with it). */
  wallId: string
}

export interface FittingPointLike {
  x: number
  z: number
  kind: ElectricalKind
  mountHeightMm?: number
  levelId?: string
}

/** How far from a wall centreline a point may sit and still be mounted on that wall. */
export const WALL_SNAP_M = 0.6
/** Plate depth (m) — the face sits proud of the wall by half of it. */
export const PLATE_DEPTH_M = 0.011
/** Distribution board size (w, h, d) and mount centre height, metres — an HDB DB sits high
 *  beside the main door, its top near the door head (2.1 m). */
export const DB_BOX = { w: 0.4, h: 0.3, d: 0.09, y: 2.0 } as const

interface WallHit {
  wall: PlanWall
  /** Along-wall distance from `start`, metres. */
  offset: number
  /** Perpendicular distance, metres (unsigned). */
  dist: number
  /** Which side of the centreline the point lies: +1 = right-hand normal (−Z of the tangent). */
  side: 1 | -1
}

function wallFrame(w: PlanWall): { ux: number; uz: number; len: number } | null {
  const dx = w.end[0] - w.start[0]
  const dz = w.end[1] - w.start[1]
  const len = Math.hypot(dx, dz)
  if (len < 1e-6) return null
  return { ux: dx / len, uz: dz / len, len }
}

/** Right-hand normal of a wall's start→end tangent — the plan's `swing: 'right'` side. */
export function rightNormal(w: PlanWall): [number, number] {
  const f = wallFrame(w)
  return f ? [f.uz, -f.ux] : [0, -1]
}

function nearestStraightWall(walls: readonly PlanWall[], x: number, z: number): WallHit | null {
  let best: WallHit | null = null
  for (const wall of walls) {
    const f = wallFrame(wall)
    if (!f) continue
    const rx = x - wall.start[0]
    const rz = z - wall.start[1]
    const t = Math.max(0, Math.min(f.len, rx * f.ux + rz * f.uz))
    const px = wall.start[0] + f.ux * t
    const pz = wall.start[1] + f.uz * t
    const dist = Math.hypot(x - px, z - pz)
    if (best && dist >= best.dist) continue
    // Sign against the right-hand normal (uz, −ux).
    const s = (x - px) * f.uz + (z - pz) * -f.ux
    best = { wall, offset: t, dist, side: s < 0 ? -1 : 1 }
  }
  return best
}

function yawForNormal(nx: number, nz: number): number {
  // three: a group at yaw θ faces (sin θ, cos θ); we want the plate's +Z to be the normal.
  return Math.atan2(nx, nz)
}

function placeOnWall(
  wall: PlanWall,
  plan: FloorPlan,
  offset: number,
  side: 1 | -1,
  y: number,
  kind: FittingKind,
  depth = PLATE_DEPTH_M,
): WallFitting | null {
  const f = wallFrame(wall)
  if (!f) return null
  const [rnx, rnz] = rightNormal(wall)
  const nx = rnx * side
  const nz = rnz * side
  const half = planWallThickness(wall, plan) / 2
  const t = Math.max(0.05, Math.min(f.len - 0.05, offset))
  const cx = wall.start[0] + f.ux * t + nx * (half + depth / 2)
  const cz = wall.start[1] + f.uz * t + nz * (half + depth / 2)
  return { kind, x: cx, y, z: cz, yaw: yawForNormal(nx, nz), wallId: wall.id }
}

/** The side of `wall` at `offset` that lies inside a room of the plan (+1 / −1), or null. */
function roomSide(wall: PlanWall, plan: FloorPlan, offset: number): 1 | -1 | null {
  const f = wallFrame(wall)
  if (!f) return null
  const [nx, nz] = rightNormal(wall)
  const half = planWallThickness(wall, plan) / 2 + 0.15
  const px = wall.start[0] + f.ux * offset
  const pz = wall.start[1] + f.uz * offset
  const inRight = plan.rooms.some((r) => pointInRoom(r, px + nx * half, pz + nz * half))
  const inLeft = plan.rooms.some((r) => pointInRoom(r, px - nx * half, pz - nz * half))
  if (inRight && !inLeft) return 1
  if (inLeft && !inRight) return -1
  // Both sides are rooms (an internal partition) or neither: no single answer.
  return null
}

/**
 * The plan's main door: the widest door on an external wall (an HDB main door is 1.0 m
 * against 0.8–0.9 m internal leaves), falling back to the widest door anywhere.
 */
export function mainDoor(plan: FloorPlan): { opening: PlanOpening; wall: PlanWall } | null {
  let best: { opening: PlanOpening; wall: PlanWall; ext: boolean } | null = null
  for (const o of plan.openings) {
    if (o.kind !== 'door') continue
    const wall = plan.walls.find((w) => w.id === o.wallId)
    if (!wall) continue
    const ext = wall.thickness === 'external'
    if (!best || (ext && !best.ext) || (ext === best.ext && o.width > best.opening.width))
      best = { opening: o, wall, ext }
  }
  return best ? { opening: best.opening, wall: best.wall } : null
}

/**
 * GENERAL-PURPOSE sockets — the derived layout only puts a socket behind an appliance, which
 * leaves most walls bare, and a real HDB room has 13 A sockets on every long wall whether or
 * not something is plugged in (SS 638 minimum provision is one per ~4 m²; BTO flats ship 2–3
 * per bedroom, 4+ in the living room). For each room, each bounding wall run longer than
 * {@link GENERAL_SOCKET_MIN_WALL_M} gets one socket at a third of its length on the room side,
 * skipped where it would land within 0.5 m of an opening or an existing point. Only used when
 * the plan has NO persisted MEP layer — a user who placed points sees exactly those.
 */
export const GENERAL_SOCKET_MIN_WALL_M = 2.4
export function generalSockets(
  plan: FloorPlan,
  existing: readonly FittingPointLike[],
): FittingPointLike[] {
  const out: FittingPointLike[] = []
  for (const wall of plan.walls) {
    const f = wallFrame(wall)
    if (!f || f.len < GENERAL_SOCKET_MIN_WALL_M) continue
    const [nx, nz] = rightNormal(wall)
    const half = planWallThickness(wall, plan) / 2 + 0.15
    // A run of 3.4 m or more earns two sockets; a shorter one gets one, trying the
    // third-points in turn so a door in the first slot does not cost the wall its socket.
    const slots = f.len >= 3.4 ? [0.3, 0.7] : [1 / 3, 2 / 3]
    const want = f.len >= 3.4 ? 2 : 1
    for (const side of [1, -1] as const) {
      let placed = 0
      for (const frac of slots) {
        if (placed >= want) break
        const t = f.len * frac
        const px = wall.start[0] + f.ux * t
        const pz = wall.start[1] + f.uz * t
        // The socket's own probe point, 0.15 m off the face on this side — must be in a room.
        const qx = px + nx * side * half
        const qz = pz + nz * side * half
        if (!plan.rooms.some((r) => pointInRoom(r, qx, qz))) continue
        // Not across a door or window on this wall.
        const blocked = plan.openings.some(
          (o) => o.wallId === wall.id && t > o.offset - 0.5 && t < o.offset + o.width + 0.5,
        )
        if (blocked) continue
        // Not on top of a point already there on the SAME side (a socket at the same spot on
        // the other face of a partition is a common through-wall pair, so it does not block).
        const taken = [...existing, ...out].some((e) => Math.hypot(e.x - qx, e.z - qz) < 0.5)
        if (taken) continue
        out.push({ x: qx, z: qz, kind: 'socket' })
        placed += 1
      }
    }
  }
  return out
}

/**
 * Resolve electrical points onto wall faces. `points` is the union the caller chooses
 * (persisted MEP points, or the derived layout when the plan has none). Ground storey only:
 * upper-storey points are skipped (the walk view renders one storey's shell at a time).
 */
export function resolveWallFittings(
  plan: FloorPlan,
  points: readonly FittingPointLike[],
): WallFitting[] {
  const out: WallFitting[] = []
  const doorSwingSide = new Map<string, { wall: PlanWall; offset: number; side: 1 | -1 }>()
  for (const o of plan.openings) {
    if (o.kind !== 'door') continue
    const wall = plan.walls.find((w) => w.id === o.wallId)
    if (!wall) continue
    // The leaf opens into the room it serves; the switch goes on that face, past the
    // latch jamb. `deriveElectricalPoints` puts the point at `offset + width + 0.15` on the
    // centreline — map it to the swing side, EXCEPT where only one side of the wall is a room
    // at all (the main door swings out to the common corridor; its switch is still inside).
    const swingSide: 1 | -1 = (o.swing ?? 'right') === 'right' ? 1 : -1
    const inside = roomSide(wall, plan, o.offset + o.width / 2)
    const side: 1 | -1 = inside ?? swingSide
    doorSwingSide.set(o.id, { wall, offset: o.offset + o.width + 0.15, side })
  }
  for (const p of points) {
    if (p.levelId) continue
    const hit = nearestStraightWall(plan.walls, p.x, p.z)
    if (!hit || hit.dist > WALL_SNAP_M) continue
    const y = (p.mountHeightMm ?? ELECTRICAL_MOUNT_DEFAULTS_MM[p.kind]) / 1000
    // A point ON the centreline (a derived door switch) has no side of its own: use the
    // door's swing side when it matches a door position, else the side that is in a room.
    let side: 1 | -1 = hit.side
    if (hit.dist < 0.02) {
      const door = [...doorSwingSide.values()].find(
        (d) => d.wall.id === hit.wall.id && Math.abs(d.offset - hit.offset) < 0.05,
      )
      side = door?.side ?? roomSide(hit.wall, plan, hit.offset) ?? 1
    }
    const f = placeOnWall(hit.wall, plan, hit.offset, side, y, p.kind)
    if (f) out.push(f)
  }
  // Distribution board: inside the main door, past the latch jamb, at eye height.
  const md = mainDoor(plan)
  if (md) {
    const { opening: o, wall } = md
    const latchAtEnd = (o.hinge ?? 'start') === 'start'
    const offset = latchAtEnd
      ? o.offset + o.width + 0.15 + DB_BOX.w / 2
      : o.offset - 0.15 - DB_BOX.w / 2
    const side =
      roomSide(wall, plan, o.offset + o.width / 2) ?? ((o.swing ?? 'right') === 'right' ? 1 : -1)
    const f = placeOnWall(wall, plan, offset, side, DB_BOX.y, 'db-box', DB_BOX.d)
    if (f) out.push(f)
  }
  return out
}
