/**
 * ROOM-SCOPED-LIGHTS (R7-AE) — which fixture lights fill the constant-size point-light pool.
 *
 * **Why a pool, and why it is not the nearest-N cap this repo rejected.** three unrolls the
 * point-light loop with `NUM_POINT_LIGHTS` baked into every lit program, and evaluates every light
 * on every fragment with no early-out (`docs/research/lights-gpu-bound-2026-09-25.md` §2.1, §9):
 * 19 fixtures cost 13.6 ms of a 25.3 ms frame, a dark slot costs exactly what a lit one does, and
 * changing the COUNT recompiles ~35 programs and blocks the main thread 3–8 s cold (`z16`). So the
 * pool is a CONSTANT {@link LIGHT_POOL_SIZE} slots — the count never changes — and what changes is
 * which fixture each slot carries.
 *
 * The rejected cap (`chooseEmitters`, PERF-002) ranked emitters by distance to the CAMERA every
 * frame, so walking or turning churned the set and lamps visibly switched around you. This
 * selection has no camera-distance term at all. It is a pure function of
 * (the room the camera is in, the design, which doors are open):
 *
 *  1. every light in the camera's room, each in its own slot;
 *  2. then the rooms you can SEE from there — connected through an open door or a wall-less
 *     boundary (`planCollisionWalls` with the live door state: a closed door is a wall) —
 *     breadth-first, ring by ring, and within a ring the room whose lamp sits nearest the opening
 *     it is seen through first;
 *  3. if all of those lamps fit, each gets its own slot. If they do not (the corridor with every
 *     door open sees 15 lamps in 6 rooms), **every visible room still gets light**: each gets one
 *     slot carrying its lamps merged into one (`room:<id>`, summed at their emission-weighted
 *     centroid, `mergeFixtureLights`), and whatever slack is left upgrades rooms back to one slot
 *     per lamp, in the same order. The first version of this rule ranked individual lamps and
 *     simply ran out: seen from the corridor, the main bedroom through its open door rendered at
 *     44 % of its lit brightness and then came up as you stepped in — the failure the rejected cap
 *     was removed for. Measured by `lights-gpu-ab.mjs --mode walk`.
 *
 * So turning on the spot, or walking around inside a room, changes nothing; the set changes only
 * when the camera crosses into another room (with hysteresis, {@link roomAtCamera}), a door opens
 * or closes, or the design changes — and the component cross-fades the slots on a room change.
 *
 * **It corrects the render as well as cheapening it.** Fixture lights cast no shadows and a point
 * light reaches everything inside its `distance` (3.0–6.5 m), so today a bedroom's pendant lights
 * the living room through a solid wall. A light in a room you cannot see from here contributes
 * only that leak. Its diffuse bounce is untouched: `lampBounce.ts` lights every room's shell per
 * room, independently of this pool.
 *
 * Pure (no three/React), unit-tested in `lightRooms.test.ts`.
 */
import type { CollisionWall } from '../../collision/walls'
import { type PlanRoom, pointInRoom, roomPolygon } from '../../floorplan/types'

/** Constant number of point-light slots. 8 is where R7-AB's cost ladder and R7-AC's image
 *  comparison independently landed: below the 12–14-light cost knee, and the main bedroom (the
 *  richest room on the default flat, 6 fixtures) plus its bathroom and the corridor fit exactly. */
export const LIGHT_POOL_SIZE = 8

/** The most slots the measurements support; past this the per-light cost doubles (§9.2). The
 *  pool never grows past it — {@link LIGHT_POOL_SIZE} is asserted `<=` this in the tests. */
export const LIGHT_POOL_MAX = 12

/** How far past a room's outline the camera must be before it counts as having left (m). Stops a
 *  camera standing on a wall-less boundary (corridor ↔ living room) flipping the set back and
 *  forth. */
export const ROOM_EXIT_HYSTERESIS_M = 0.3

/** Spacing of the boundary samples that discover which rooms see each other (m). Below the
 *  narrowest real doorway (0.7 m) so an open door always catches at least two samples. */
const LINK_SAMPLE_M = 0.2

/** How far across a boundary the far-side probe lands (m) — clears a 0.2 m external wall. */
const LINK_PROBE_M = 0.3

/** How far inside the room the near end of each probe starts (m) — past any wall body the
 *  outline overlaps (a 0.2 m external wall's half-thickness, plus margin). */
const LINK_INSET_M = 0.2

type Vec2 = readonly [number, number]

/** Rooms visible from each room, with the boundary points the view passes through. */
export type RoomLinks = ReadonlyMap<string, ReadonlyMap<string, readonly Vec2[]>>

/** The minimum a light needs for pool selection. `FixtureLight` satisfies it. */
export interface PoolLight {
  id: string
  position: readonly [number, number, number]
}

function segmentsCross(a: Vec2, b: Vec2, c: Vec2, d: Vec2): boolean {
  const o = (p: Vec2, q: Vec2, r: Vec2) =>
    (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0])
  const d1 = o(c, d, a)
  const d2 = o(c, d, b)
  const d3 = o(a, b, c)
  const d4 = o(a, b, d)
  return d1 * d2 < 0 && d3 * d4 < 0
}

function blocked(walls: readonly CollisionWall[], a: Vec2, b: Vec2): boolean {
  for (const w of walls) if (segmentsCross(a, b, [w.ax, w.az], [w.bx, w.bz])) return true
  return false
}

/** Signed area of a polygon (positive = counter-clockwise in x/z). */
function signedArea(poly: readonly Vec2[]): number {
  let s = 0
  for (let i = 0; i < poly.length; i++) {
    const [x0, z0] = poly[i]
    const [x1, z1] = poly[(i + 1) % poly.length]
    s += x0 * z1 - x1 * z0
  }
  return s / 2
}

/**
 * Which rooms see each other, and through where.
 *
 * Walks every room's outline in {@link LINK_SAMPLE_M} steps and probes {@link LINK_PROBE_M}
 * across it. If the probe lands in another room and the step does not cross a wall, the two rooms
 * see each other at that point. `walls` is `planCollisionWalls(plan, doors)`: solid spans with
 * gaps where a door is OPEN, so one test covers wall-less boundaries (the corridor running into
 * the living room, the open kitchen) and doorways alike, and a closed door is a wall.
 */
export function roomLinks(rooms: readonly PlanRoom[], walls: readonly CollisionWall[]): RoomLinks {
  const out = new Map<string, Map<string, Vec2[]>>()
  const add = (a: string, b: string, p: Vec2) => {
    let m = out.get(a)
    if (!m) {
      m = new Map()
      out.set(a, m)
    }
    const pts = m.get(b)
    if (pts) pts.push(p)
    else m.set(b, [p])
  }
  for (const room of rooms) {
    const poly = roomPolygon(room) as Vec2[]
    if (poly.length < 3) continue
    // Outward normal of an edge: rotate the tangent away from the interior.
    const ccw = signedArea(poly) > 0
    for (let i = 0; i < poly.length; i++) {
      const [x0, z0] = poly[i]
      const [x1, z1] = poly[(i + 1) % poly.length]
      const len = Math.hypot(x1 - x0, z1 - z0)
      if (len < 1e-6) continue
      const tx = (x1 - x0) / len
      const tz = (z1 - z0) / len
      const nx = ccw ? tz : -tz
      const nz = ccw ? -tx : tx
      const steps = Math.max(1, Math.floor(len / LINK_SAMPLE_M))
      for (let s = 0; s < steps; s++) {
        const t = ((s + 0.5) / steps) * len
        const px = x0 + tx * t
        const pz = z0 + tz * t
        // The inside end starts well inside: an outline can run along a wall's FACE or overlap the
        // wall body (the living room's west edge sits 50 mm short of the bedroom-3 wall's
        // centreline), and a probe that starts on the centreline cannot see it crossed.
        const inside: Vec2 = [px - nx * LINK_INSET_M, pz - nz * LINK_INSET_M]
        const across: Vec2 = [px + nx * LINK_PROBE_M, pz + nz * LINK_PROBE_M]
        const other = rooms.find((r) => r !== room && pointInRoom(r, across[0], across[1]))
        if (!other || blocked(walls, inside, across)) continue
        add(room.id, other.id, [px, pz])
        add(other.id, room.id, [px, pz])
      }
    }
  }
  return out
}

/** Distance from a point to a room's outline, 0 inside it. */
function distanceToRoom(room: PlanRoom, x: number, z: number): number {
  if (pointInRoom(room, x, z)) return 0
  const poly = roomPolygon(room)
  let best = Number.POSITIVE_INFINITY
  for (let i = 0; i < poly.length; i++) {
    const [ax, az] = poly[i]
    const [bx, bz] = poly[(i + 1) % poly.length]
    const dx = bx - ax
    const dz = bz - az
    const l2 = dx * dx + dz * dz
    const t = l2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2)) : 0
    best = Math.min(best, Math.hypot(x - (ax + dx * t), z - (az + dz * t)))
  }
  return best
}

/** The room nearest a point (the room containing it, else the closest outline). */
function nearestRoom(rooms: readonly PlanRoom[], x: number, z: number): string | null {
  let best: string | null = null
  let bestD = Number.POSITIVE_INFINITY
  for (const r of rooms) {
    const d = distanceToRoom(r, x, z)
    if (d < bestD) {
      bestD = d
      best = r.id
    }
  }
  return best
}

/**
 * The room the camera counts as being in, with hysteresis.
 *
 * Keeps `current` until the camera is more than {@link ROOM_EXIT_HYSTERESIS_M} outside it, so a
 * camera standing on a boundary cannot flicker the set. A camera inside no room (in a doorway's
 * wall thickness) keeps `current`; with no `current` it takes the nearest room.
 */
export function roomAtCamera(
  rooms: readonly PlanRoom[],
  x: number,
  z: number,
  current: string | null,
): string | null {
  const cur = current ? rooms.find((r) => r.id === current) : undefined
  if (cur && distanceToRoom(cur, x, z) <= ROOM_EXIT_HYSTERESIS_M) return cur.id
  const inside = rooms.find((r) => pointInRoom(r, x, z))
  if (inside) return inside.id
  return cur ? cur.id : nearestRoom(rooms, x, z)
}

/** Each light's room, by its bulb's plan position. A bulb outside every room (a lamp on a
 *  balcony that is not a plan room) belongs to the nearest one. */
export function lightRoomIds(
  rooms: readonly PlanRoom[],
  lights: readonly PoolLight[],
): Map<string, string | null> {
  const out = new Map<string, string | null>()
  for (const l of lights) out.set(l.id, nearestRoom(rooms, l.position[0], l.position[2]))
  return out
}

/** A light as the renderer's falloff sees it. */
export interface GainLight {
  position: readonly [number, number, number]
  /** Final intensity (base × mood × level). */
  intensity: number
  distance: number
}

/** three's `getDistanceAttenuation` for `decay = 2`, windowed at `distance` (Frostbite eq. 26). */
function falloff(d: number, cutoff: number): number {
  const f = 1 / Math.max(d * d, 0.01)
  if (!(cutoff > 0)) return f
  const w = Math.max(0, Math.min(1, 1 - (d / cutoff) ** 4))
  return f * w * w
}

/**
 * Intensity multiplier for a room's merged stand-in, so it lights the room's surfaces as brightly,
 * on average, as the lamps it replaces.
 *
 * Summing N lamps at their centroid keeps the total emission but not the irradiance: inverse
 * square is convex, so moving a sconce from 0.2 m off its wall to the middle of the room loses
 * most of what it put on that wall. This matches the mean falloff-weighted irradiance over the
 * room's walls (sampled every 0.5 m at 0.5 / 1.3 / 2.1 m) and floor (a 0.5 m grid) instead —
 * cosine terms ignored, which is fine for a stand-in only ever seen through a door. Clamped to
 * [1, 4]. For the main bedroom it is 1.23. Be clear what it does NOT fix: seen from its doorway
 * that room still reads ~0.6 of the legacy frame (0.62 → 0.64 with the gain), because the doorway
 * looks at the floor lamp's pool on the wall and no single centred light can draw a pool.
 */
export function aggregateGain(
  room: PlanRoom,
  members: readonly GainLight[],
  merged: GainLight,
): number {
  const poly = roomPolygon(room)
  const samples: [number, number, number][] = []
  for (let i = 0; i < poly.length; i++) {
    const [x0, z0] = poly[i]
    const [x1, z1] = poly[(i + 1) % poly.length]
    const len = Math.hypot(x1 - x0, z1 - z0)
    const steps = Math.max(1, Math.round(len / 0.5))
    for (let s = 0; s < steps; s++) {
      const t = (s + 0.5) / steps
      for (const y of [0.5, 1.3, 2.1]) samples.push([x0 + (x1 - x0) * t, y, z0 + (z1 - z0) * t])
    }
  }
  let minX = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let minZ = Number.POSITIVE_INFINITY
  let maxZ = Number.NEGATIVE_INFINITY
  for (const [x, z] of poly) {
    minX = Math.min(minX, x)
    maxX = Math.max(maxX, x)
    minZ = Math.min(minZ, z)
    maxZ = Math.max(maxZ, z)
  }
  for (let x = minX + 0.25; x < maxX; x += 0.5)
    for (let z = minZ + 0.25; z < maxZ; z += 0.5)
      if (pointInRoom(room, x, z)) samples.push([x, 0, z])
  const at = (l: GainLight, p: readonly number[]) =>
    l.intensity *
    falloff(
      Math.hypot(l.position[0] - p[0], l.position[1] - p[1], l.position[2] - p[2]),
      l.distance,
    )
  let real = 0
  let stand = 0
  for (const p of samples) {
    for (const m of members) real += at(m, p)
    stand += at(merged, p)
  }
  if (!(stand > 0) || !(real > 0)) return 1
  return Math.max(1, Math.min(4, real / stand))
}

/** One pool slot's worth of light: a single fixture (`members` is `[id]`, `id` is the fixture's)
 *  or a whole room's fixtures merged into one (`id` is `room:<roomId>`). */
export interface PoolEntry {
  id: string
  members: readonly string[]
}

/** The id an aggregated room carries in the pool. */
export const roomEntryId = (roomId: string) => `room:${roomId}`

/**
 * What goes in the pool, in priority order, at most `size` entries.
 *
 * See the module docblock for the rule. `lights` arrives in stable item order, which is the
 * tie-break everywhere, so the result depends on nothing but its arguments. With no camera room
 * (a plan with no rooms) the pool takes the first `size` lights in item order. A camera room with
 * more lamps than slots keeps the first `size` in item order (not reached on the default flat).
 */
export function poolSelection(
  lights: readonly PoolLight[],
  lightRooms: ReadonlyMap<string, string | null>,
  links: RoomLinks,
  cameraRoom: string | null,
  size: number = LIGHT_POOL_SIZE,
): PoolEntry[] {
  const n = Math.min(size, LIGHT_POOL_MAX)
  const single = (l: PoolLight): PoolEntry => ({ id: l.id, members: [l.id] })
  if (cameraRoom === null) return lights.slice(0, n).map(single)
  const byRoom = new Map<string, PoolLight[]>()
  for (const l of lights) {
    const r = lightRooms.get(l.id)
    if (!r) continue
    const a = byRoom.get(r)
    if (a) a.push(l)
    else byRoom.set(r, [l])
  }
  const out = (byRoom.get(cameraRoom) ?? []).slice(0, n).map(single)

  // Visible rooms, ring by ring (rooms seen through the previous ring's openings); within a ring
  // the room whose lamp is nearest its opening first, and each room's lamps nearest-first. A ring
  // is fully served — every room present, then un-merged as far as the slack goes — before the
  // next ring gets anything.
  const seen = new Set([cameraRoom])
  let ring = [cameraRoom]
  while (ring.length > 0 && out.length < n) {
    const reached = new Map<string, Vec2[]>()
    for (const from of ring) {
      for (const [to, pts] of links.get(from) ?? []) {
        if (seen.has(to)) continue
        const acc = reached.get(to)
        if (acc) acc.push(...pts)
        else reached.set(to, [...pts])
      }
    }
    const rooms: { room: string; ls: PoolLight[]; d: number; i: number }[] = []
    for (const [room, pts] of reached) {
      const ranked = (byRoom.get(room) ?? []).map((l) => {
        let d = Number.POSITIVE_INFINITY
        for (const p of pts) d = Math.min(d, Math.hypot(l.position[0] - p[0], l.position[2] - p[1]))
        return { l, d, i: lights.indexOf(l) }
      })
      if (ranked.length === 0) continue
      ranked.sort((a, b) => a.d - b.d || a.i - b.i)
      rooms.push({ room, ls: ranked.map((r) => r.l), d: ranked[0].d, i: ranked[0].i })
    }
    rooms.sort((a, b) => a.d - b.d || a.i - b.i)

    const budget = n - out.length
    const total = rooms.reduce((a, r) => a + r.ls.length, 0)
    if (total <= budget) {
      for (const r of rooms) out.push(...r.ls.map(single))
    } else {
      // Over-subscribed: one slot per room first (as far as slots go), then spend the slack
      // un-merging rooms to one slot per lamp, in visibility order.
      const kept = rooms.slice(0, budget)
      let slack = budget - kept.length
      for (const r of kept) {
        if (r.ls.length === 1) {
          out.push(single(r.ls[0]))
        } else if (r.ls.length - 1 <= slack) {
          slack -= r.ls.length - 1
          out.push(...r.ls.map(single))
        } else {
          out.push({ id: roomEntryId(r.room), members: r.ls.map((l) => l.id) })
        }
      }
    }
    for (const r of reached.keys()) seen.add(r)
    ring = [...reached.keys()]
  }
  return out
}
