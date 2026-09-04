import { describe, expect, it } from 'vitest'
import { planLevels } from './levels'
import { PLAN_TEMPLATES } from './templates'
import { pointInRoom } from './types'

/**
 * TEMPLATE-ROOM-ENCLOSURE (v0.31.5.109) — two geometry guards over the shipped
 * starter plans.
 *
 * These are RATCHET tests. Both sweeps found pre-existing offenders in the
 * template library that cannot be fixed here: correcting them means re-drawing
 * shipped Singapore starter layouts (room sizes, door positions), which is a
 * content decision, not a defect fix — see `docs/open-graphics-decisions.md`
 * item (f). So each known offender is listed BY NAME below. The point of the
 * tests is that a NEW template, or an edit to an existing one, cannot introduce
 * another; and that fixing one is visible as a required edit to the list.
 *
 * Do NOT add entries to either list to make a failure go away. A new entry means
 * a plan ships a bathroom nobody can close the door on.
 */

/** Rooms that share one wall-free volume with another declared room, where at
 *  least one of them is a bath/powder. `plan/level: room + room + …`. */
const KNOWN_SHARED_ENCLOSURES = [
  'tpl-hdb-3room/ground: h3-kit + h3-yard + h3-shelter + h3-cbath + h3-living',
  // h3-mbath + h3-bed2 FIXED in v0.31.7.201 — one partition at x 1.9 plus a door onto the master.
  // The OTHER `tpl-hdb-3room` entry above is deliberately still open: subdividing the north strip
  // (kitchen / yard / shelter / common bath, none of which have walls between them) is a layout
  // design question about how the kitchen and yard are entered, not a missing-partition bug.
  // tpl-hdb-4room FIXED in v0.31.7.194 — `h4-cbath`/`h4-mbath` owned no walls at all. Three
  // partitions close the bath column (x 3.6-5.7, z 6.5-9.7) and two doors reach them, which also
  // separates the master and both bedrooms: the whole five-room component is gone.
  // tpl-hdb-5room FIXED in v0.31.7.195 — all TEN rooms were one component. Same shape as the
  // 4-room fix: three partitions close the bath column (x 4.0-6.2, z 6.9-D) plus two doors, and
  // `h5-m-n` was extended 3.8 -> 4.0 to meet it (the master's rect ends at 4.0, so the old end
  // left a 0.2 m gap the flood fill walked through).
  // tpl-hdb-exec FIXED in v0.31.7.196 — the column was already bounded by `ex-b-corr` and
  // `ex-liv-w`; it needed a north wall east of x 3.6 and a divider between the two baths, plus
  // doors, since closing it would otherwise leave both baths unreachable.
  // tpl-hdb-3gen FIXED in v0.31.7.200 — `g3-g-bath-w` started 0.2 m below `g3-svc-s` (a leak),
  // and `g3-mbath` had no wall north or south of it east of `g3-b-corr`. Both closed, with a door
  // each so neither bath is sealed.
  // tpl-hdb-jumbo FIXED in v0.31.7.197 — the doc's headline case. A wall at x 2.1 separates the
  // baths from the master and a divider splits them; the existing `jb-master` door turned out to
  // sit over the COMMON BATH, so it serves that and the master got one of its own.
  // tpl-hdb-maisonette/em-up FIXED in v0.31.7.203 — three gaps, not one: `emu-bed-s` stopped at
  // x 6.6 short of the east wall, `emu-m-w` started 0.8 m below it, and nothing separated the
  // hall/landing from the family area. Plus a door so the family area is not sealed.
  // tpl-condo-4bed FIXED in v0.31.7.199 — the strip z 4.0-6.1 was already closed north and
  // south; the three baths inside it had no walls between them. Three verticals divide them and
  // two doors on `c4-mid` keep cbath/bath2 reachable (mbath is reached from the master).
]

/** Walls that run through a room's interior rather than along its boundary. */
// EMPTY as of `v0.31.7.202` — both entries fixed, and the list stays here as a ratchet so a new
// template cannot introduce a wall through the middle of a room.
//
// Both were corridor walls running the FULL depth of the plan and so passing through a master
// bedroom (`jb-wb-corr` 3.20 m through `jb-master`, `g3-b-corr` 2.20 m through `g3-master`) — a
// grey slab across the middle of a bedroom. Neither needed the span that did it: shortening each
// to the master's north wall left every enclosure below intact, because by then the baths were
// held by their own partitions.
const KNOWN_BISECTED_ROOMS: string[] = []

const STEP = 0.05

/** Rasterise every wall as solid (openings ignored — a door still separates two
 *  rooms) and flood-fill the free space, so two rooms land in the same component
 *  only when NO wall stands between them at all. */
function sharedEnclosures(level: {
  extent: [number, number]
  walls: {
    start: [number, number]
    end: [number, number]
    thickness: string
    thicknessM?: number
  }[]
  rooms: { id: string; category?: string }[]
}) {
  const [W, D] = level.extent
  const cols = Math.ceil(W / STEP)
  const rowsN = Math.ceil(D / STEP)
  const blocked = new Uint8Array(cols * rowsN)
  for (const w of level.walls) {
    const half = (w.thicknessM ?? (w.thickness === 'external' ? 0.2 : 0.1)) / 2
    const [ax, az] = w.start
    const [bx, bz] = w.end
    const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / (STEP / 2)))
    const rad = Math.ceil(half / STEP)
    for (let i = 0; i <= n; i++) {
      const ci = Math.floor((ax + ((bx - ax) * i) / n) / STEP)
      const cj = Math.floor((az + ((bz - az) * i) / n) / STEP)
      for (let di = -rad; di <= rad; di++)
        for (let dj = -rad; dj <= rad; dj++) {
          const ni = ci + di
          const nj = cj + dj
          if (ni >= 0 && nj >= 0 && ni < cols && nj < rowsN) blocked[nj * cols + ni] = 1
        }
    }
  }
  const comp = new Int32Array(cols * rowsN).fill(-1)
  let nc = 0
  for (let s = 0; s < comp.length; s++) {
    if (blocked[s] || comp[s] >= 0) continue
    const stack = [s]
    comp[s] = nc
    while (stack.length) {
      const c = stack.pop() as number
      const ci = c % cols
      const cj = Math.floor(c / cols)
      for (const [di, dj] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const) {
        const ni = ci + di
        const nj = cj + dj
        if (ni < 0 || nj < 0 || ni >= cols || nj >= rowsN) continue
        const k = nj * cols + ni
        if (!blocked[k] && comp[k] < 0) {
          comp[k] = nc
          stack.push(k)
        }
      }
    }
    nc++
  }
  const byComp = new Map<number, string[]>()
  for (const r of level.rooms) {
    const tally = new Map<number, number>()
    for (let i = 0; i < cols; i++)
      for (let j = 0; j < rowsN; j++) {
        const c = comp[j * cols + i]
        if (c < 0) continue
        if (pointInRoom(r as never, (i + 0.5) * STEP, (j + 0.5) * STEP))
          tally.set(c, (tally.get(c) ?? 0) + 1)
      }
    let best = -1
    let bn = 0
    for (const [c, n] of tally)
      if (n > bn) {
        bn = n
        best = c
      }
    if (best < 0) continue
    const list = byComp.get(best) ?? []
    list.push(r.id)
    byComp.set(best, list)
  }
  const out: string[] = []
  for (const [c, ids] of byComp) {
    if (ids.length < 2) continue
    const wet = ids.some(
      (id) =>
        level.rooms.find((r) => r.id === id)?.category === 'bath' ||
        level.rooms.find((r) => r.id === id)?.category === 'powder',
    )
    if (wet) out.push(ids.join(' + '))
    void c
  }
  return out
}

describe('starter template room geometry', () => {
  it('encloses every bathroom with walls', () => {
    const found: string[] = []
    for (const tpl of PLAN_TEMPLATES)
      for (const level of planLevels(tpl))
        for (const group of sharedEnclosures({ ...level, extent: tpl.extent } as never))
          found.push(`${tpl.id}/${level.id ?? 'ground'}: ${group}`)
    expect(found).toEqual(KNOWN_SHARED_ENCLOSURES)
  })

  it('keeps walls on room boundaries, not through room interiors', () => {
    // A room rectangle conventionally overhangs the wall centreline it sits on
    // by up to ~0.2 m, so only a wall further than EDGE from BOTH parallel edges
    // is actually running through the room.
    const EDGE = 0.35
    const found: string[] = []
    for (const tpl of PLAN_TEMPLATES)
      for (const level of planLevels(tpl))
        for (const w of level.walls) {
          if (w.thickness === 'external') continue
          const [ax, az] = w.start
          const [bx, bz] = w.end
          const horiz = Math.abs(bz - az) < 1e-6
          const vert = Math.abs(bx - ax) < 1e-6
          if (!horiz && !vert) continue
          for (const r of level.rooms) {
            if (r.polygon || r.extension) continue
            const [ox, oz] = r.origin
            const lo = horiz ? Math.max(Math.min(ax, bx), ox) : Math.max(Math.min(az, bz), oz)
            const hi = horiz
              ? Math.min(Math.max(ax, bx), ox + r.width)
              : Math.min(Math.max(az, bz), oz + r.depth)
            if (hi - lo < 0.5) continue
            const pos = horiz ? az : ax
            const near = horiz ? oz : ox
            const far = near + (horiz ? r.depth : r.width)
            if (Math.min(pos - near, far - pos) >= EDGE)
              found.push(`${tpl.id}/${level.id ?? 'ground'}: ${w.id} through ${r.id}`)
          }
        }
    expect(found).toEqual(KNOWN_BISECTED_ROOMS)
  })
})
