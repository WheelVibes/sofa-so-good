/**
 * A room a template calls DOUBLE-HEIGHT must actually be double height.
 *
 * **The defect this locks down (item `(w)`, v0.31.7.208).** `tpl-loft`'s "Open Living" is the
 * whole point of that template — a double-height volume with a sleeping mezzanine over the rear
 * band. It was authored as an ordinary room: no `ceilingHeight` override, so it took the plan's
 * 3.0 m, while the loft above reaches 5.5 m. `planGeometry.ts` builds walls at
 * `wall.topHeight ?? plan.ceilingHeight`, so the exterior wall stopped at 3.0 m and the 2.5 m band
 * between the two had NO WALL AT ALL. Standing on the mezzanine, a raycast through the frame
 * centre at eye level hit nothing: the volume was open to the sky. From the ground floor a ceiling
 * lid closed it off at head height instead.
 *
 * **Why a test and not just the fix.** Nothing else notices. Every enclosure, sightline and
 * window guard in this repo works in PLAN — they ask which walls bound a room, never how tall
 * those walls are — so a wall that stops 2.5 m short is invisible to all of them, and the symptom
 * only appears in a frame aimed deliberately over a parapet. This asserts the geometry directly:
 * a room whose ceiling rises past the storey above's floor must be enclosed to its own full
 * height on every side that faces outdoors.
 */
import { describe, expect, it } from 'vitest'
import { PLAN_TEMPLATES } from './templates'
import type { FloorPlan, PlanWall } from './types'

/** Segments of `wall` in plan, as [start, end] along its own axis, ignoring height. */
function spanZ(w: PlanWall): [number, number] {
  return [Math.min(w.start[1], w.end[1]), Math.max(w.start[1], w.end[1])]
}
function spanX(w: PlanWall): [number, number] {
  return [Math.min(w.start[0], w.end[0]), Math.max(w.start[0], w.end[0])]
}

/** Rooms whose ceiling rises above the lowest upper storey's floor — genuine double-height. */
function doubleHeightRooms(plan: FloorPlan) {
  const upper = plan.upperLevels ?? []
  if (upper.length === 0) return []
  const lowestUpper = Math.min(...upper.map((l) => l.elevation))
  return (plan.rooms ?? []).filter((r) => (r.ceilingHeight ?? plan.ceilingHeight) > lowestUpper)
}

describe('double-height volumes are enclosed to their own height', () => {
  it("tpl-loft's Open Living IS a double-height room, not a 3.0 m one", () => {
    const loft = PLAN_TEMPLATES.find((t) => t.id === 'tpl-loft')
    expect(loft).toBeTruthy()
    const plan = loft as FloorPlan
    const open = (plan.rooms ?? []).find((r) => r.id === 'lf-open')
    expect(open, 'lf-open is the double-height volume').toBeTruthy()
    const top = Math.max(
      ...(plan.upperLevels ?? []).map((l) => l.elevation + (l.ceilingHeight ?? 0)),
    )
    // The volume runs the full height of the building, not the plan's default storey.
    expect(open?.ceilingHeight).toBe(top)
    expect(open?.ceilingHeight).toBeGreaterThan(plan.ceilingHeight)
  })

  it('every external wall bounding the void reaches the void ceiling', () => {
    const plan = PLAN_TEMPLATES.find((t) => t.id === 'tpl-loft') as FloorPlan
    const rooms = doubleHeightRooms(plan)
    expect(rooms.length, 'the fixture only means something if a void exists').toBe(1)
    const room = rooms[0]!
    const h = room.ceilingHeight ?? plan.ceilingHeight
    const [rz0, rz1] = [room.origin[1], room.origin[1] + room.depth]
    const [rx0, rx1] = [room.origin[0], room.origin[0] + room.width]
    // A wall bounds the void when it RUNS ALONG one of the room's edges: its constant axis sits
    // on that edge (within half a wall thickness) and its long axis overlaps the room by more
    // than a corner touch. Requiring overlap on BOTH axes cannot work — every axis-aligned wall
    // has one degenerate span, so that version matched zero walls and made this check vacuous.
    const short: string[] = []
    // Count what was EXAMINED, for exactly that reason.
    const bounding: string[] = []
    const EDGE = 0.3
    for (const w of plan.walls) {
      if (w.thickness !== 'external') continue
      const [wz0, wz1] = spanZ(w)
      const [wx0, wx1] = spanX(w)
      const vertical = wx1 - wx0 < 0.01
      const alongEdge = vertical
        ? Math.min(Math.abs(wx0 - rx0), Math.abs(wx0 - rx1)) < EDGE &&
          Math.min(wz1, rz1) - Math.max(wz0, rz0) > 0.2
        : Math.min(Math.abs(wz0 - rz0), Math.abs(wz0 - rz1)) < EDGE &&
          Math.min(wx1, rx1) - Math.max(wx0, rx0) > 0.2
      if (!alongEdge) continue
      bounding.push(w.id)
      const top = w.topHeight ?? plan.ceilingHeight
      if (top < h - 0.01) short.push(`${w.id} (top ${top} < ${h})`)
    }
    // North plus the void-side halves of east and west.
    expect(bounding.sort(), 'the void must be bounded by real external walls').toEqual([
      'lf-e',
      'lf-n',
      'lf-w',
    ])
    expect(
      short,
      'these external walls bound the double-height volume but stop below its ceiling — the band above them renders as open sky',
    ).toEqual([])
  })

  it('walls NOT bounding the void stop at the MEZZANINE FLOOR, not the void ceiling', () => {
    // The complement matters: raising every wall to 5.5 would put ground geometry coplanar with
    // the loft's own external walls, which occupy the same planes from 3.3 m up. They still must
    // not stop at the ground CEILING either — see the envelope-continuity test below.
    const plan = PLAN_TEMPLATES.find((t) => t.id === 'tpl-loft') as FloorPlan
    const rear = plan.walls.filter((w) => w.id === 'lf-s' || w.id.endsWith('-rear'))
    expect(rear.length).toBeGreaterThanOrEqual(3)
    const loftFloor = Math.min(...(plan.upperLevels ?? []).map((l) => l.elevation))
    for (const w of rear) expect(w.topHeight).toBe(loftFloor)
  })
})

describe('a multi-storey envelope has no unwalled slab band', () => {
  /**
   * A storey's exterior wall must reach the NEXT storey's floor, not its own ceiling.
   *
   * Measured `v0.31.7.209`, **magnitude corrected in `.210`**: `tpl-hdb-maisonette` ground walls
   * topped out at 2.6 m under an upper storey whose walls start at 2.9 m, and
   * `tpl-terrace-ground` at 3.0 m under 3.3 m. The gap in the WALLS is 0.3 m, but the open band is
   * **0.05 m**: `LevelSlab` is a 0.25 m box hung under the storey above (`PlanShell.tsx` positions
   * it at level-local -0.125 with height 0.25), so it fills 2.65-2.9 across the whole footprint on
   * both these templates, and only 2.60-2.65 is actually open.
   *
   * Read that constant before quoting a number here. `.209` published "a 0.3 m ring" and argued a
   * horizontal ray at 2.75 m "hits nothing by construction" - at 2.75 m the slab is there, and the
   * ray hits it in BOTH arms. The slit is real: at **2.62 m** a ray crosses the whole building to
   * the sky pre-fix and stops at the envelope post-fix, confirmed one-variable on both templates
   * with `ray-probe.mjs`.
   */
  const multi = PLAN_TEMPLATES.filter((t) => (t.upperLevels ?? []).length > 0)

  it('finds the multi-storey templates at all', () => {
    // Three today. A filter that matched none would make every check below vacuous.
    expect(multi.length).toBeGreaterThanOrEqual(3)
  })

  it.each(
    multi.map((t) => [t.id, t] as const),
  )('%s: every external ground wall reaches the storey above', (_id, plan) => {
    const lowestUpper = Math.min(...(plan.upperLevels ?? []).map((l) => l.elevation))
    const short = plan.walls
      .filter((w) => w.thickness === 'external')
      .filter((w) => (w.topHeight ?? plan.ceilingHeight) < lowestUpper - 0.01)
      .map((w) => `${w.id} (top ${w.topHeight ?? plan.ceilingHeight} < ${lowestUpper})`)
    expect(
      short,
      'these external walls stop below the floor of the storey above — the slab band between them is open envelope',
    ).toEqual([])
  })
})
