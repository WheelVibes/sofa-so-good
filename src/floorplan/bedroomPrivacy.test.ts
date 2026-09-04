import { describe, expect, it } from 'vitest'
import { planLevels } from './levels'
import { roomCategory } from './roomCategory'
import { PLAN_TEMPLATES } from './templates'
import { pointInRoom, wallLength } from './types'

/**
 * BEDROOM-PRIVACY (v0.31.8.39) — can you reach a bedroom without walking through
 * ANOTHER bedroom?
 *
 * Distinct from `templateConnectivity.test.ts`, which asks only whether a room can
 * be reached at all. A plan can be fully connected and still route you through
 * somebody's bedroom to reach the next one — which is exactly what a bedroom column
 * with no corridor does. `tpl-condo-3bed` chains bedroom 2 → bedroom 3 → master,
 * and its column has 0.5 m² of spare floor, so a corridor can only come out of the
 * bedrooms themselves: measured, a 1.0 m corridor there costs all three wardrobes
 * and a dresser, because a 2.7 m wide room cannot take a 1.5 m freestanding
 * wardrobe beside a bed. Recorded in `docs/open-graphics-decisions.md` (f) — the
 * door was added, the chain kept, and this ratchet exists so the chain stays
 * VISIBLE rather than being hidden by the door that made the plan "connected".
 *
 * ## Why this measures free space, not a room graph
 *
 * The obvious instrument — a room-adjacency graph over doors — is wrong here, and
 * reported 18 offenders including `tpl-hdb-jumbo`'s master, which demonstrably has
 * its own door off a corridor. These plans have UNDECLARED corridors: circulation
 * that is not a declared room. A graph over declared rooms cannot represent it, so
 * every room reached via a corridor looks unreachable. This version floods the free
 * grid with every OTHER bedroom's interior blocked, and asks whether each bedroom's
 * own doorway can still be approached.
 *
 * Do NOT add an entry to silence a failure: one means a plan ships a bedroom you can
 * only reach by crossing another bedroom.
 */
function walkThroughBedrooms(
  plan: (typeof PLAN_TEMPLATES)[number],
  level: ReturnType<typeof planLevels>[number],
): string[] {
  const step = 0.1
  const [W, D] = plan.extent
  const nx = Math.ceil(W / step)
  const nz = Math.ceil(D / step)
  const isBed = (r: { name: string; category?: string }) => {
    const c = roomCategory(r as never)
    return c === 'bedroom' || c === 'masterBedroom'
  }
  const beds = level.rooms.filter(isBed)
  if (beds.length === 0) return []

  // Walls once; doors are open gaps.
  const walls = new Uint8Array(nx * nz)
  for (const w of level.walls) {
    const len = wallLength(w)
    if (!len) continue
    const ux = (w.end[0] - w.start[0]) / len
    const uz = (w.end[1] - w.start[1]) / len
    const gaps = level.openings
      .filter((o) => o.wallId === w.id && o.kind === 'door')
      .map((o) => [o.offset, o.offset + o.width] as const)
    for (let t = 0; t <= len; t += step / 2) {
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
        const ix = Math.floor((x + dx) / step)
        const iz = Math.floor((z + dz) / step)
        if (ix >= 0 && ix < nx && iz >= 0 && iz < nz) walls[iz * nx + ix] = 1
      }
    }
  }
  // Precompute which cells lie in which room, so the per-bedroom passes are cheap.
  const cellRooms: string[][] = Array.from({ length: nx * nz }, () => [])
  for (let ix = 0; ix < nx; ix++)
    for (let iz = 0; iz < nz; iz++) {
      const x = ix * step + step / 2
      const z = iz * step + step / 2
      for (const r of level.rooms) if (pointInRoom(r, x, z)) cellRooms[iz * nx + ix].push(r.id)
    }
  const bedIds = new Set(beds.map((r) => r.id))

  const bad: string[] = []
  for (const target of beds) {
    // Every OTHER bedroom is a wall: a bedroom may be a destination, never a
    // through-route. The target itself stays open, so a bedroom reached through
    // a doorless gap (which several templates use) is handled the same as one
    // with its own door.
    const blocked = new Uint8Array(walls)
    for (let j = 0; j < blocked.length; j++)
      if (cellRooms[j].some((id) => bedIds.has(id) && id !== target.id)) blocked[j] = 1
    // Seed from every NON-bedroom room: whichever is the entrance, the
    // circulation they share is what a bedroom has to open onto.
    const seen = new Uint8Array(nx * nz)
    const q: number[] = []
    for (let j = 0; j < blocked.length; j++) {
      if (blocked[j] || seen[j]) continue
      if (!cellRooms[j].some((id) => !bedIds.has(id))) continue
      seen[j] = 1
      q.push(j)
    }
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
        if (blocked[j] || seen[j]) continue
        seen[j] = 1
        q.push(j)
      }
    }
    let reached = false
    for (let j = 0; j < seen.length && !reached; j++)
      if (seen[j] && cellRooms[j].includes(target.id)) reached = true
    if (!reached) bad.push(`${plan.id}/${level.id}: ${target.id}`)
  }
  return bad
}

/** Bedrooms reachable ONLY by crossing another bedroom. */
const KNOWN_WALK_THROUGH: string[] = [
  // All four are bedroom groups with no corridor of their own. `tpl-condo-3bed`'s
  // column has 0.5 m² spare, so a corridor can only come out of the bedrooms —
  // measured at 3 wardrobes + a dresser, see the module doc. The other three sit
  // in plans whose bedroom zones are the last entries in
  // `templateConnectivity.test.ts` for the same reason.
  'tpl-condo-3bed/ground: c3-bed3',
  'tpl-condo-4bed/ground: c4-bed4',
  'tpl-condo-penthouse/ground: cp-bed3',
  'tpl-hdb-exec/ground: ex-master',
]

describe('bedroom privacy', () => {
  it('matches the known walk-through ratchet exactly', { timeout: 120_000 }, () => {
    const found = PLAN_TEMPLATES.flatMap((t) =>
      planLevels(t).flatMap((level) => walkThroughBedrooms(t, level)),
    )
    expect(found.sort()).toEqual([...KNOWN_WALK_THROUGH].sort())
  })

  it('passes the bedrooms that ARE properly reachable, so the probe is not vacuous', () => {
    // `tpl-hdb-jumbo` was re-authored in v0.31.8.29 to give every bedroom its own
    // door off a corridor, so all of its bedrooms must pass. A room-graph version
    // of this test wrongly flagged its master, which is what motivated the
    // free-space approach.
    const jumbo = PLAN_TEMPLATES.find((t) => t.id === 'tpl-hdb-jumbo')
    expect(jumbo).toBeDefined()
    const j = jumbo as (typeof PLAN_TEMPLATES)[number]
    expect(planLevels(j).flatMap((l) => walkThroughBedrooms(j, l))).toEqual([])
  })
})
