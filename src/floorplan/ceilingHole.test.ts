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
