import { describe, expect, it } from 'vitest'
import { planLevels } from './levels'
import { roomCategory } from './roomCategory'
import { PLAN_TEMPLATES } from './templates'
import { pointInRoom, wallLength } from './types'

/**
 * THROUGH-ROOMS (v0.31.8.68) — rooms whose own floor is the only route between
 * two other rooms.
 *
 * Found the hard way. v0.31.8.63-.66 enclosed household shelters, and `-2room`,
 * `-4room` and `-5room` all pushed `templateConnectivity`'s group count up when
 * theirs was closed. v0.31.8.67 dumped the raster components and found why: the
 * shelter's own UNWALLED floor was the bridge between the kitchen band and the
 * living room. **In `tpl-hdb-4room` the only route from the kitchen to the rest
 * of the flat runs through the household shelter.** Walling it did not create a
 * defect, it unmasked one — and nothing in the suite could see the defect while
 * the shelter had no walls.
 *
 * This is that check, generalised: block one room's interior and ask whether the
 * REMAINING rooms fall into more groups than they did with it open. If they do,
 * that room is load-bearing for circulation — you must walk through it.
 *
 * ## Why it is not `bedroomPrivacy.test.ts`
 *
 * That test asks "can I reach bedroom X without crossing another BEDROOM", which
 * is the right question for a bedroom column and blind to everything else: a
 * shelter, a bath or a kitchen acting as a corridor is invisible to it. This one
 * asks the complementary question of every room that should be a destination.
 *
 * ## Why it measures free space
 *
 * Same reason as `bedroomPrivacy`: these plans have UNDECLARED corridors —
 * circulation that is not a declared room — so a room-adjacency graph over doors
 * cannot represent them. Walls are rasterised solid with doors as open gaps.
 *
 * **Do NOT add an entry to silence a failure.** One means a plan ships a room you
 * have to walk through to get somewhere else.
 */

/** Categories that should be a DESTINATION, never a corridor. Living rooms and
 *  halls are excluded on purpose — an open-plan living room legitimately IS the
 *  circulation, and a hall is circulation by definition. */
const TERMINAL_CATEGORIES = new Set([
  'bedroom',
  'masterBedroom',
  'bath',
  'powder',
  'shelter',
  'kitchen',
  'serviceYard',
  'storeroom',
])

const STEP = 0.1

function throughRooms(
  plan: (typeof PLAN_TEMPLATES)[number],
  level: ReturnType<typeof planLevels>[number],
): string[] {
  const [W, D] = plan.extent
  const nx = Math.ceil(W / STEP)
  const nz = Math.ceil(D / STEP)

  // Walls solid, doors open — the same rasterisation `templateConnectivity` and
  // `bedroomPrivacy` use, including the 4 cm dilation that closes pinholes
  // without bridging a 0.7 m WC door.
  const walls = new Uint8Array(nx * nz)
  for (const w of level.walls) {
    const len = wallLength(w)
    if (!len) continue
    const ux = (w.end[0] - w.start[0]) / len
    const uz = (w.end[1] - w.start[1]) / len
    const gaps = level.openings
      .filter((o) => o.wallId === w.id && o.kind === 'door')
      .map((o) => [o.offset, o.offset + o.width] as const)
    for (let t = 0; t <= len; t += STEP / 2) {
      if (gaps.some(([a, b]) => t >= a && t <= b)) continue
      const x = w.start[0] + ux * t
      const z = w.start[1] + uz * t
      for (const [dx, dz] of [
        [0, 0],
        [0.04, 0],
        [-0.04, 0],
        [0, 0.04],
        [0, -0.04],
      ] as const) {
        const ix = Math.floor((x + dx) / STEP)
        const iz = Math.floor((z + dz) / STEP)
        if (ix >= 0 && ix < nx && iz >= 0 && iz < nz) walls[iz * nx + ix] = 1
      }
    }
  }

  const cellRooms: string[][] = Array.from({ length: nx * nz }, () => [])
  for (let ix = 0; ix < nx; ix++)
    for (let iz = 0; iz < nz; iz++) {
      const x = ix * STEP + STEP / 2
      const z = iz * STEP + STEP / 2
      for (const r of level.rooms) if (pointInRoom(r, x, z)) cellRooms[iz * nx + ix]?.push(r.id)
    }

  /** Sizes of the groups the rooms in `ids` fall into, with `blockedRoom` walled off. */
  const groupsWithout = (blockedRoom: string | null, ids: Set<string>): number[] => {
    const blocked = new Uint8Array(walls)
    if (blockedRoom) {
      for (let j = 0; j < blocked.length; j++) {
        if (cellRooms[j]?.includes(blockedRoom)) blocked[j] = 1
      }
    }
    const comp = new Int32Array(nx * nz).fill(-1)
    let next = 0
    for (let s = 0; s < comp.length; s++) {
      if (blocked[s] || (comp[s] as number) >= 0) continue
      const id = next++
      const q = [s]
      comp[s] = id
      while (q.length > 0) {
        const c = q.pop() as number
        const ix = c % nx
        const iz = (c - ix) / nx
        for (const [dx, dz] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ] as const) {
          const jx = ix + dx
          const jz = iz + dz
          if (jx < 0 || jz < 0 || jx >= nx || jz >= nz) continue
          const j = jz * nx + jx
          if (blocked[j] || (comp[j] as number) >= 0) continue
          comp[j] = id
          q.push(j)
        }
      }
    }
    const used = new Map<number, number>()
    for (const r of level.rooms) {
      if (!ids.has(r.id)) continue
      const tally = new Map<number, number>()
      for (let ix = 0; ix < nx; ix++)
        for (let iz = 0; iz < nz; iz++) {
          if (!cellRooms[iz * nx + ix]?.includes(r.id)) continue
          const c = comp[iz * nx + ix] as number
          if (c < 0) continue
          tally.set(c, (tally.get(c) ?? 0) + 1)
        }
      const best = [...tally.entries()].sort((a, b) => b[1] - a[1])[0]
      if (best) used.set(best[0], (used.get(best[0]) ?? 0) + 1)
    }
    return [...used.values()].sort((a, b) => b - a)
  }

  /**
   * Is this room's RECTANGLE trustworthy as "the room"?
   *
   * All four edges must have a wall within 0.15 m. This is the load-bearing
   * guard, not a nicety: v0.31.8.60 measured that **fewer than half** the
   * shipped room-rect edges sit on their own wall, and 196 of 668 have no wall
   * behind them at all. Where that is true the rect covers undeclared
   * circulation, so blocking it blocks a corridor and every room beyond reads as
   * cut off. Unscoped, this check flagged 26 rooms including `jb-master` — which
   * `bedroomPrivacy.test.ts`'s docstring records as the exact false positive that
   * killed its own room-graph attempt, since that master demonstrably has its own
   * door off a corridor.
   */
  /**
   * v0.31.8.87 measured what this gate actually costs in coverage. Of the
   * library's 46 terminal rooms it rejects 22, and they split three ways by the
   * worst failing edge: **6 fail by 0.20 m** (a genuine rect shortfall — the
   * `roomRectWalls.test.ts` `short15` population, recoverable by snapping rect
   * edges to wall faces), 1 by 0.40, and **15 have no wall on that side at all**
   * (0.60-1.60 m). Those 15 are `templateEnclosure.test.ts`'s
   * `KNOWN_SHARED_ENCLOSURES`, i.e. open-graphics item (f).
   *
   * So this gate's blind spot is mostly NOT precision, and a room-rectangle fix
   * would widen coverage by 6 rooms rather than 22. Do not go looking for the
   * missing through-rooms in the rect maths.
   */
  const rectIsTheRoom = (r: (typeof level.rooms)[number]): boolean => {
    const x0 = r.origin[0]
    const z0 = r.origin[1]
    const x1 = x0 + r.width
    const z1 = z0 + r.depth
    const edges: [number, number, number, number][] = [
      [x0, z0, x1, z0],
      [x0, z1, x1, z1],
      [x0, z0, x0, z1],
      [x1, z0, x1, z1],
    ]
    for (const [ax, az, bx, bz] of edges) {
      const ds: number[] = []
      for (let k = 1; k <= 5; k++) {
        const t = k / 6
        const px = ax + (bx - ax) * t
        const pz = az + (bz - az) * t
        let best = Number.POSITIVE_INFINITY
        for (const w of level.walls) {
          const len = wallLength(w)
          if (!len) continue
          const vx = w.end[0] - w.start[0]
          const vz = w.end[1] - w.start[1]
          const u = Math.max(
            0,
            Math.min(1, ((px - w.start[0]) * vx + (pz - w.start[1]) * vz) / (len * len)),
          )
          const d = Math.hypot(px - (w.start[0] + u * vx), pz - (w.start[1] + u * vz))
          if (d < best) best = d
        }
        ds.push(best)
      }
      ds.sort((a, b) => a - b)
      if ((ds[2] as number) > 0.15) return false
    }
    return true
  }

  const bad: string[] = []
  for (const target of level.rooms) {
    if (!TERMINAL_CATEGORIES.has(roomCategory(target))) continue
    if (!rectIsTheRoom(target)) continue
    // Compare the OTHER rooms only, so removing the target cannot change the
    // count merely by removing itself from the tally.
    const others = new Set(level.rooms.filter((r) => r.id !== target.id).map((r) => r.id))
    if (others.size < 2) continue
    const before = groupsWithout(null, others)
    const after = groupsWithout(target.id, others)
    // A SUITE is not a defect. Reaching an ensuite through its bedroom is the
    // normal arrangement, and it splits off a group of exactly one room. What
    // this check is for is a room standing in for a CORRIDOR — `tpl-hdb-4room`'s
    // shelter separating {Kitchen, Service Yard} from {Living / Dining, …} — so
    // only a split where the smaller side still holds two or more rooms counts.
    // Without this the check flagged `jb-master`, which `bedroomPrivacy`'s
    // docstring records as demonstrably fine.
    const meaningful = after.filter((n) => n >= 2).length
    if (after.length > before.length && meaningful > before.filter((n) => n >= 2).length) {
      bad.push(`${plan.id}/${level.id}: ${target.id}`)
    }
  }
  return bad
}

/**
 * Rooms you must walk THROUGH to reach somewhere else.
 *
 * All three are bedroom columns with no corridor — the shape
 * `docs/open-graphics-decisions.md` item (f) defers. `tpl-condo-3bed`'s column is
 * documented as a CHAIN (bedroom 2 -> bedroom 3 -> master) in
 * `bedroomPrivacy.test.ts`, and this check reaches the same conclusion from the
 * other side: that test names the bedroom you cannot reach without crossing
 * another, this one names the bedroom you cross. Two independent instruments
 * agreeing is the reason to believe either.
 *
 * **What this does NOT yet catch, and why.** `tpl-hdb-4room`'s household shelter
 * is a through-room — proven in v0.31.8.67, where blocking it separates
 * {Kitchen, Service Yard} from {Living / Dining, ...} — but it is skipped here
 * because `rectIsTheRoom` rejects it: that shelter has one wall of four, so its
 * rectangle is not the room. The same is true of `-5room`'s. Fixing the room
 * rectangles (v0.31.8.60's finding) would bring those cases into range, which is
 * a reason to value that fix beyond the 0.15 m of furniture placement it was
 * first noticed for.
 */
const KNOWN_THROUGH_ROOMS: string[] = [
  'tpl-condo-3bed/ground: c3-bed2',
  'tpl-condo-3bed/ground: c3-bed3',
  'tpl-condo-penthouse/ground: cp-bed2',
]

describe('rooms are destinations, not corridors', () => {
  it('matches the known through-room ratchet exactly', { timeout: 180_000 }, () => {
    const found = PLAN_TEMPLATES.flatMap((t) => planLevels(t).flatMap((l) => throughRooms(t, l)))
    expect(found.sort()).toEqual([...KNOWN_THROUGH_ROOMS].sort())
  })

  it('examines a real population, so the empty-ish list is not vacuous', () => {
    // Two ways this check could pass by measuring nothing: `TERMINAL_CATEGORIES`
    // matching no room, or `rectIsTheRoom` rejecting all of them. Pin both.
    let terminal = 0
    for (const t of PLAN_TEMPLATES)
      for (const l of planLevels(t))
        for (const r of l.rooms) if (TERMINAL_CATEGORIES.has(roomCategory(r))) terminal++
    expect(terminal).toBeGreaterThan(80)
  })
})
