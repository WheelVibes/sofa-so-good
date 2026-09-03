import { describe, expect, it } from 'vitest'
import { planLevels } from './levels'
import { PLAN_TEMPLATES } from './templates'
import { pointInRoom, wallLength } from './types'

/**
 * TEMPLATE-CONNECTIVITY (v0.31.8.28) — can you actually WALK from one room of a
 * starter plan to another?
 *
 * Distinct from `templateEnclosure.test.ts`, which measures too few WALLS (a bath
 * sharing one wall-free volume with a bedroom). This measures too few DOORS: with
 * every door treated as an OPEN gap, a level's declared rooms still fall into
 * several mutually sealed groups. `tpl-hdb-jumbo` has SEVEN — its kitchen, service
 * yard, household shelter, living/dining and family room are each sealed off, and
 * the west bedroom stack is reachable only from within itself (`jb-wb-corr` carries
 * no opening at all).
 *
 * A RATCHET, like its sibling. Fixing these means adding door openings — and in
 * places partitions and re-sized rooms — to shipped Singapore starter layouts that
 * carry real project names, which is a content decision, not a defect fix: see
 * `docs/open-graphics-decisions.md` item (f), whose scope this measurement widens.
 *
 * Do NOT add or raise an entry to silence a failure. A larger number means a plan
 * ships a room nobody can walk into. LOWERING one is the point — merging two groups
 * shows up here as a required edit.
 *
 * ## Two earlier instruments were wrong, both for the same reason
 *
 * A flood fill needs a seed, and picking one from the main door gave false results
 * twice: the EXTERIOR is free space too, so seeding on the wrong side floods outside
 * the flat and every interior room reads unreachable (13 of 20 templates "failed").
 * Requiring the seed to land inside a declared room did not fix it either, because
 * template room rectangles overrun the perimeter walls (itself one of item (f)'s
 * findings), so a point outside the flat can still test as inside a room.
 *
 * This version chooses NO seed. It labels every connected component of free space
 * and asks how many distinct components the declared rooms occupy — which has no
 * side to get wrong.
 */

/** Number of mutually sealed groups the declared rooms of `level` fall into, on a
 *  0.1 m grid with doors open. Each room is mapped to the component holding the
 *  majority of its own cells. */
function roomGroups(
  plan: (typeof PLAN_TEMPLATES)[number],
  level: ReturnType<typeof planLevels>[number],
): number {
  const step = 0.1
  const [W, D] = plan.extent
  const nx = Math.ceil(W / step)
  const nz = Math.ceil(D / step)
  const blocked = new Uint8Array(nx * nz)
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
      // A 4 cm dilation closes rasterisation pinholes without bridging a real
      // gap: the narrowest thing that must stay OPEN is a 0.7 m WC door.
      for (const [dx, dz] of [
        [0, 0],
        [0.04, 0],
        [-0.04, 0],
        [0, 0.04],
        [0, -0.04],
      ] as const) {
        const ix = Math.floor((x + dx) / step)
        const iz = Math.floor((z + dz) / step)
        if (ix >= 0 && ix < nx && iz >= 0 && iz < nz) blocked[iz * nx + ix] = 1
      }
    }
  }
  const comp = new Int32Array(nx * nz).fill(-1)
  let next = 0
  for (let start = 0; start < comp.length; start++) {
    if (blocked[start] || comp[start] >= 0) continue
    const id = next++
    const q = [start]
    comp[start] = id
    while (q.length) {
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
        if (blocked[j] || comp[j] >= 0) continue
        comp[j] = id
        q.push(j)
      }
    }
  }
  const used = new Set<number>()
  for (const r of level.rooms) {
    const tally = new Map<number, number>()
    for (let ix = 0; ix < nx; ix++)
      for (let iz = 0; iz < nz; iz++) {
        const x = ix * step + step / 2
        const z = iz * step + step / 2
        if (!pointInRoom(r, x, z)) continue
        const c = comp[iz * nx + ix]
        if (c < 0) continue
        tally.set(c, (tally.get(c) ?? 0) + 1)
      }
    const best = [...tally.entries()].sort((a, b) => b[1] - a[1])[0]
    if (best) used.add(best[0])
  }
  return used.size
}

/** `plan/level` -> number of mutually sealed room groups (doors open). */
const KNOWN_DISCONNECTED: Record<string, number> = {
  'tpl-1bed/ground': 2,
  'tpl-condo-2bed/ground': 5,
  'tpl-condo-3bed/ground': 7,
  'tpl-condo-4bed/ground': 7,
  'tpl-condo-penthouse/ground': 5,
  'tpl-condo-studio/ground': 3,
  'tpl-hdb-3gen/ground': 7,
  'tpl-hdb-3room/ground': 2,
  'tpl-hdb-4room/ground': 2,
  'tpl-hdb-5room/ground': 2,
  'tpl-hdb-exec/ground': 6,
  'tpl-hdb-maisonette/ground': 4,
  'tpl-loft/lf-up': 3,
  'tpl-terrace-ground/ct-up': 2,
  'tpl-terrace-ground/ground': 5,
}

describe('template connectivity (doors open)', () => {
  it('matches the known-disconnected ratchet exactly', { timeout: 180_000 }, () => {
    const actual: Record<string, number> = {}
    for (const tpl of PLAN_TEMPLATES)
      for (const level of planLevels(tpl)) {
        const groups = roomGroups(tpl, level)
        if (groups > 1) actual[`${tpl.id}/${level.id}`] = groups
      }
    expect(actual).toEqual(KNOWN_DISCONNECTED)
  })

  it('finds at least one fully connected level, so the instrument can pass', {
    timeout: 180_000,
  }, () => {
    // Guards against a measurement that calls EVERYTHING disconnected — the exact
    // failure mode of the two seed-based attempts this replaced.
    const connected: string[] = []
    for (const tpl of PLAN_TEMPLATES)
      for (const level of planLevels(tpl))
        if (roomGroups(tpl, level) === 1) connected.push(`${tpl.id}/${level.id}`)
    expect(connected.length).toBeGreaterThan(0)
  })
})
