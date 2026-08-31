/**
 * Which rooms actually get daylight (PHOTO-FILL-WINDOWLESS).
 *
 * `photographicFill` skips the fixtures in a first-person daylit view, because
 * every lamp burning at 1 pm is what makes a walk frame read as CG. Measured at a
 * windowless room's centroid, that rule is wrong: with the flag on, the bathroom
 * drops from mean 183.5 to **94.6** and the corridor puts **31 %** of its pixels
 * below 64 — because those rooms have no window, so removing the fixtures removes
 * nearly all of their light. Their occupants turn the light on at noon for exactly
 * that reason.
 *
 * So the rule needs to know which rooms daylight can reach. Pure, so the geometry
 * is unit-testable without a scene.
 */

interface RoomLike {
  id: string
  origin: readonly [number, number] | number[]
  width: number
  depth: number
}

interface WallLike {
  id: string
  start: readonly [number, number] | number[]
  end: readonly [number, number] | number[]
}

interface OpeningLike {
  kind: string
  wallId: string
  offset: number
  width: number
}

export interface PlanLike {
  rooms?: readonly RoomLike[]
  walls?: readonly WallLike[]
  openings?: readonly OpeningLike[]
}

/** Half-width of the band around a window that counts as "this room's wall". A
 *  window sits IN a wall, so its midpoint lies on the boundary between the room
 *  and outside; a small inward probe is what attributes it to the room. */
const PROBE_M = 0.35

/** Is `(x, z)` inside this room's rectangle? */
function inRoom(r: RoomLike, x: number, z: number): boolean {
  return (
    x >= r.origin[0] && x <= r.origin[0] + r.width && z >= r.origin[1] && z <= r.origin[1] + r.depth
  )
}

/**
 * The ids of every room that has at least one window in one of its walls.
 *
 * A window's midpoint is projected a little way to BOTH sides; whichever room
 * contains a probe point owns the window (an interior window would legitimately
 * light two rooms, and this attributes it to both).
 */
export function daylitRoomIds(plan: PlanLike | null | undefined): Set<string> {
  const out = new Set<string>()
  const rooms = plan?.rooms ?? []
  const walls = plan?.walls ?? []
  for (const op of plan?.openings ?? []) {
    if (op.kind !== 'window') continue
    const w = walls.find((x) => x.id === op.wallId)
    if (!w) continue
    const [x0, z0] = w.start
    const [x1, z1] = w.end
    const len = Math.hypot(x1 - x0, z1 - z0)
    if (!(len > 0)) continue
    const ux = (x1 - x0) / len
    const uz = (z1 - z0) / len
    const t = op.offset + op.width / 2
    const cx = x0 + ux * t
    const cz = z0 + uz * t
    for (const s of [1, -1]) {
      const px = cx + -uz * PROBE_M * s
      const pz = cz + ux * PROBE_M * s
      for (const r of rooms) if (inRoom(r, px, pz)) out.add(r.id)
    }
  }
  return out
}

/** The id of the room containing `(x, z)`, or null. */
export function roomIdAt(plan: PlanLike | null | undefined, x: number, z: number): string | null {
  for (const r of plan?.rooms ?? []) if (inRoom(r, x, z)) return r.id
  return null
}

/**
 * Does a fixture at this world position still render under the photographic
 * rule? A fixture in a room daylight never reaches always does — that is the
 * whole point. A fixture outside every room (a balcony, a ledge) is treated as
 * daylit, since it is by definition not in an enclosed windowless space.
 */
export function fixtureSurvivesDaylight(
  plan: PlanLike | null | undefined,
  daylit: Set<string>,
  x: number,
  z: number,
): boolean {
  const id = roomIdAt(plan, x, z)
  if (id === null) return false
  return !daylit.has(id)
}
