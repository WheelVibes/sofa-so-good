/**
 * Walkable floor with NO CEILING above it — a hole to the sky, in shipped templates.
 *
 * **How this was found and why nothing else catches it.** Ceilings are rendered PER ROOM
 * (`PlanShell.tsx` maps `lp.rooms` to `PlanRoomCeiling`), so any area inside the perimeter that no
 * room rect covers has a floor — the plan slab spans the footprint — and no ceiling. Every existing
 * plan guard reasons about rooms, walls, openings and sightlines; none asks whether the ROOM SET
 * covers the FOOTPRINT, so a gap in that coverage is invisible to all of them.
 *
 * **Confirmed in the running app, not just in arithmetic** (`ray-probe.mjs`, `v0.31.7.229`):
 *
 * | plan / point | ray up | ray down |
 * | --- | --- | --- |
 * | `tpl-hdb-4room` (7.75, 1.3) | **NOTHING — leaves the scene** | floor at y = −0.01 |
 * | `tpl-hdb-jumbo` (4.5, 4.0) | **NOTHING — leaves the scene** | floor at y = −0.01 |
 * | `tpl-hdb-4room` living room (7.4, 5.0), control | ceiling at y = 2.6 | — |
 *
 * So it is walkable, it is open to the sky, and it is the same defect class as items `(w)` and
 * `(x)`: geometry the templates imply but never build.
 *
 * **The numbers are a RATCHET, not a target.** Each entry is what the template measures today, so
 * the guard fails if a plan edit makes any of them worse, and a fix means lowering a number here.
 * Wall footprints are excluded (half-thickness plus a 3 cm margin) so the figure is walkable floor
 * rather than the gaps between rooms that walls legitimately occupy.
 */
import { describe, expect, it } from 'vitest'
import { PLAN_TEMPLATES } from './templates'
import type { FloorPlan } from './types'

/** Ceiling-less walkable area in m², measured today. Lowering an entry is a fix. */
const KNOWN_CEILING_HOLES: Readonly<Record<string, number>> = {
  'tpl-hdb-jumbo': 45.9,
  'tpl-condo-penthouse': 16.8,
  'tpl-hdb-exec': 14.2,
  'tpl-condo-4bed': 13.1,
  'tpl-hdb-3gen': 12.6,
  'tpl-hdb-4room': 10.7,
  'tpl-condo-3bed': 9.3,
  'tpl-hdb-5room': 8.6,
  'tpl-hdb-maisonette': 8.5,
  'tpl-hdb-3room': 8.4,
  'tpl-condo-1bed': 5.0,
  'tpl-condo-2bed': 4.0,
  'tpl-hdb-2room': 2.9,
  'tpl-studio': 0.9,
  'tpl-condo-1study': 0.8,
  'tpl-loft': 0.6,
  // Below the 0.5 m2 cut my first scan printed at, so it did not appear in the survey; the
  // per-template assertion found it. Kept explicit rather than folded into the tolerance.
  'tpl-terrace-ground': 0.5,
}

const STEP = 0.1

/** Is (x, z) inside any room rect or its L-extension? */
function inAnyRoom(t: FloorPlan, x: number, z: number): boolean {
  return (t.rooms ?? []).some((r) => {
    const [rx, rz] = r.origin
    if (x >= rx && x <= rx + r.width && z >= rz && z <= rz + r.depth) return true
    const e = r.extension
    if (!e) return false
    const ex = rx + e.offset[0]
    const ez = rz + e.offset[1]
    return x >= ex && x <= ex + e.width && z >= ez && z <= ez + e.depth
  })
}

function ceilingLessArea(t: FloorPlan): number {
  const [W, D] = t.extent
  let open = 0
  for (let x = 0.25; x < W - 0.25; x += STEP) {
    for (let z = 0.25; z < D - 0.25; z += STEP) {
      const inRoom = (t.rooms ?? []).some((r) => {
        const [rx, rz] = r.origin
        if (x >= rx && x <= rx + r.width && z >= rz && z <= rz + r.depth) return true
        const e = r.extension
        if (!e) return false
        const ex = rx + e.offset[0]
        const ez = rz + e.offset[1]
        return x >= ex && x <= ex + e.width && z >= ez && z <= ez + e.depth
      })
      if (inRoom) continue
      const inWall = t.walls.some((w) => {
        const half = (w.thickness === 'external' ? 0.2 : 0.1) / 2 + 0.03
        const [ax, az] = w.start
        const [bx, bz] = w.end
        const dx = bx - ax
        const dz = bz - az
        const len2 = dx * dx + dz * dz
        const s = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / len2))
        return Math.hypot(x - (ax + s * dx), z - (az + s * dz)) <= half
      })
      if (inWall) continue
      open += 1
    }
  }
  return open * STEP * STEP
}

/**
 * Ceiling-less area a WALKER CAN ACTUALLY REACH, m², measured today.
 *
 * Added because `v0.31.7.229` called all of it "walkable" on the strength of two raycasts, and
 * that is too broad. Flood-filling from the largest room's centre, with door and window spans
 * treated as passable, splits the templates in two: the jumbo's holes are 92 % reachable
 * (42.3 of 45.9) and `tpl-condo-3bed`'s are 100 %, but `tpl-hdb-exec` is 29 % (4.1 of 14.2),
 * `tpl-hdb-3gen` is 9 % (1.1 of 12.6) and `tpl-condo-4bed` is under 0.5 m² of 13.1 — those are
 * SEALED voids behind walls, and a walker never sees them.
 *
 * This is the priority signal: reachable area is what shows up as sky in a frame.
 */
const KNOWN_REACHABLE_HOLES: Readonly<Record<string, number>> = {
  'tpl-hdb-jumbo': 42.3,
  'tpl-condo-penthouse': 15.9,
  'tpl-condo-3bed': 9.3,
  'tpl-hdb-5room': 7.9,
  'tpl-hdb-4room': 7.8,
  'tpl-hdb-maisonette': 7.4,
  'tpl-hdb-3room': 4.8,
  'tpl-hdb-exec': 4.1,
  'tpl-condo-1bed': 4.0,
  'tpl-condo-2bed': 2.9,
  'tpl-hdb-2room': 2.5,
  'tpl-hdb-3gen': 1.1,
  'tpl-studio': 0.9,
  'tpl-condo-1study': 0.8,
  'tpl-loft': 0.6,
  // Both sit under the 0.5 m2 cut my survey printed at, and the per-template assertion found
  // them — the same way it caught `tpl-terrace-ground` in the total measure.
  'tpl-terrace-ground': 0.5,
  'tpl-condo-4bed': 0.4,
}

/** Reachable, ceiling-less, non-wall area in m². Openings are passable; walls are not. */
function reachableCeilingLessArea(t: FloorPlan): number {
  const [W, D] = t.extent
  const nx = Math.floor((W - 0.5) / STEP)
  const nz = Math.floor((D - 0.5) / STEP)
  const at = (i: number, k: number) => [0.25 + i * STEP, 0.25 + k * STEP] as const
  const near = (x: number, z: number, w: FloorPlan['walls'][number], pad: number) => {
    const [ax, az] = w.start
    const [bx, bz] = w.end
    const dx = bx - ax
    const dz = bz - az
    const len2 = dx * dx + dz * dz
    const s = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / len2))
    const half = (w.thickness === 'external' ? 0.2 : 0.1) / 2 + pad
    return {
      hit: Math.hypot(x - (ax + s * dx), z - (az + s * dz)) <= half,
      along: s * Math.sqrt(len2),
    }
  }
  const blocked = (x: number, z: number) =>
    t.walls.some((w) => {
      const { hit, along } = near(x, z, w, 0)
      if (!hit) return false
      return !(t.openings ?? []).some(
        (o) => o.wallId === w.id && along >= o.offset && along <= o.offset + o.width,
      )
    })
  const wallFoot = (x: number, z: number) => t.walls.some((w) => near(x, z, w, 0.03).hit)
  const big = [...(t.rooms ?? [])].sort((a, b) => b.width * b.depth - a.width * a.depth)[0]
  if (!big) return 0
  const start: [number, number] = [
    Math.round((big.origin[0] + big.width / 2 - 0.25) / STEP),
    Math.round((big.origin[1] + big.depth / 2 - 0.25) / STEP),
  ]
  const id = (i: number, k: number) => i * 10000 + k
  const seen = new Set<number>([id(start[0], start[1])])
  const stack: [number, number][] = [start]
  let open = 0
  while (stack.length) {
    const [i, k] = stack.pop() as [number, number]
    const [x, z] = at(i, k)
    if (!inAnyRoom(t, x, z) && !wallFoot(x, z)) open += 1
    for (const [di, dk] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const ni = i + di
      const nk = k + dk
      if (ni < 0 || nk < 0 || ni >= nx || nk >= nz) continue
      if (seen.has(id(ni, nk))) continue
      const [x2, z2] = at(ni, nk)
      if (blocked(x2, z2)) continue
      seen.add(id(ni, nk))
      stack.push([ni, nk])
    }
  }
  return open * STEP * STEP
}

describe('templates do not leave walkable floor without a ceiling', () => {
  it('measures SOME area — a probe that found nothing would make every check below vacuous', () => {
    // The loft at 0.6 m² and the jumbo at 45.9 m² in the same run is what shows the measure
    // discriminates rather than flagging everything.
    const jumbo = PLAN_TEMPLATES.find((t) => t.id === 'tpl-hdb-jumbo') as FloorPlan
    expect(ceilingLessArea(jumbo)).toBeGreaterThan(20)
    const loft = PLAN_TEMPLATES.find((t) => t.id === 'tpl-loft') as FloorPlan
    expect(ceilingLessArea(loft)).toBeLessThan(2)
  })

  it.each(
    PLAN_TEMPLATES.map((t) => [t.id, t] as const),
  )('%s: REACHABLE ceiling-less area does not grow', (id, plan) => {
    const area = reachableCeilingLessArea(plan as FloorPlan)
    const known = KNOWN_REACHABLE_HOLES[id] ?? 0
    expect(
      area,
      `${id} has ${area.toFixed(1)} m2 of ceiling-less floor a walker can REACH (allowed ${known}). ` +
        'This is the half that shows up as sky in a frame — a sealed void does not.',
    ).toBeLessThanOrEqual(known + 0.35)
  })

  it.each(
    PLAN_TEMPLATES.map((t) => [t.id, t] as const),
  )('%s: ceiling-less walkable area does not grow', (id, plan) => {
    const area = ceilingLessArea(plan as FloorPlan)
    const known = KNOWN_CEILING_HOLES[id] ?? 0
    expect(
      area,
      `${id} has ${area.toFixed(1)} m2 of walkable floor with no ceiling above it (allowed ${known}). ` +
        'Ceilings are per ROOM, so any footprint area no room covers renders a hole to the sky — ' +
        'confirmed by raycast in v0.31.7.229. Cover it with a room (a corridor room counts) or ' +
        'wall it off; do not raise this number.',
    ).toBeLessThanOrEqual(known + 0.35)
  })
})
