import { describe, expect, it } from 'vitest'
import type { MaterialDef } from '../materials/types'
import type { FloorPlan, PlanRoom, PlanWall } from './types'
import {
  planWallTileCoursing,
  WALL_EDGE_MIN_FRACTION,
  wallFaceTileCoursing,
} from './wallTileCoursing'

const TILE_300_600 = {
  id: 'wall-tile-white',
  name: 'Glazed porcelain tile (white, 300×600)',
  moduleMm: [300, 600],
} as unknown as MaterialDef

const NO_MODULE = { id: 'wall-paint', name: 'Paint' } as unknown as MaterialDef

const wall = (id: string, x1: number, z1: number, x2: number, z2: number): PlanWall =>
  ({ id, start: [x1, z1], end: [x2, z2], thickness: 'internal' }) as unknown as PlanWall

const room = (id: string, name: string, x: number, z: number, w: number, d: number): PlanRoom =>
  ({ id, name, origin: [x, z], width: w, depth: d }) as unknown as PlanRoom

describe('acrossRun via wallFaceTileCoursing — horizontal setting-out', () => {
  const face = (runM: number, mod = TILE_300_600) =>
    wallFaceTileCoursing(
      wall('w', 0, 0, runM, 0),
      'Bath wall 01',
      room('r', 'Bath', 0, 0, 2, 2),
      mod,
      2.4,
      0,
    )!

  it('gives whole tiles and NO cut when the run divides exactly', () => {
    // 2.4 m / 300 mm = 8 tiles exactly.
    const f = face(2.4)
    expect(f.fullTilesAcross).toBe(8)
    expect(f.endCutMm).toBe(0)
    expect(f.setOutFromStartMm).toBe(0)
  })

  it('never leaves an end cut under HALF a tile — the wall rule, not the floor rule', () => {
    // This is the load-bearing difference from `tileCoursing.ts`, which accepts
    // down to a quarter module. Swept, not spot-checked.
    for (let runMm = 300; runMm <= 6000; runMm += 5) {
      const f = face(runMm / 1000)
      if (f.endCutMm > 0) {
        expect(
          f.endCutMm,
          `run ${runMm} mm gave a ${f.endCutMm} mm end cut`,
        ).toBeGreaterThanOrEqual(300 * WALL_EDGE_MIN_FRACTION)
      }
    }
  })

  it('shifts the field by half a module rather than accepting a thin cut', () => {
    // 2.5 m run, 300 module: 8 full + 100 leftover → naive 50 mm cuts (too
    // thin). Shifted: 7 full + (100 + 300) / 2 = 200 mm cuts.
    const f = face(2.5)
    expect(f.fullTilesAcross).toBe(7)
    expect(f.endCutMm).toBeCloseTo(200, 6)
  })

  it('keeps both end cuts equal, so the run reads symmetrical', () => {
    // Only one cut value is reported precisely because they are equal by
    // construction; assert the geometry closes.
    const f = face(2.5)
    expect(f.endCutMm * 2 + f.fullTilesAcross * 300).toBeCloseTo(f.faceMm[0], 6)
  })

  it('reports a run narrower than one tile as a single cut face', () => {
    const f = face(0.14)
    expect(f.fullTilesAcross).toBe(0)
    expect(f.endCutMm).toBeCloseTo(70, 6)
  })
})

describe('courses — vertical setting-out from the ceiling down', () => {
  const face = (heightM: number) =>
    wallFaceTileCoursing(
      wall('w', 0, 0, 2.4, 0),
      'Bath wall 01',
      room('r', 'Bath', 0, 0, 2, 2),
      TILE_300_600,
      heightM,
      0,
    )!

  it('puts the cut course at the BOTTOM, full courses above', () => {
    // 2.4 m at 600 mm = 4 exact courses, no cut.
    const exact = face(2.4)
    expect(exact.fullCourses).toBe(4)
    expect(exact.bottomCutMm).toBe(0)
    // 2.6 m = 4 full courses from the top + a 200 mm cut at the bottom.
    const f = face(2.6)
    expect(f.fullCourses).toBe(4)
    expect(f.bottomCutMm).toBeCloseTo(200, 6)
  })

  it('flags a bottom cut under half a course but does NOT silently adjust it', () => {
    // 2.5 m: 4 full + 100 mm — under half of 600. The fix is a decision (drop
    // the tiled height, change module, accept), not arithmetic.
    const f = face(2.5)
    expect(f.bottomCutMm).toBeCloseTo(100, 6)
    expect(f.bottomSliver).toBe(true)
    // Crucially, the course count is untouched — no borrowing happened.
    expect(f.fullCourses).toBe(4)
  })

  it('does not flag a healthy bottom cut', () => {
    // 2.7 m = 4 full courses + a 300 mm cut, exactly half a course.
    expect(face(2.7).bottomSliver).toBe(false)
    // An exact fit has no cut at all.
    expect(face(2.4).bottomSliver).toBe(false)
  })

  it('flags the STANDARD SG ceiling with a 600 mm course — the case this sheet is for', () => {
    // 2.6 m is the app's default ceiling height and the common SG figure. With
    // a 600 mm-tall tile that leaves a 200 mm bottom cut: under half a course,
    // so unacceptable by trade practice. This is not a contrived fixture — it
    // is the DEFAULT configuration, and it is precisely the decision the
    // designer should be making before the tiler starts rather than after.
    const f = face(2.6)
    expect(f.fullCourses).toBe(4)
    expect(f.bottomCutMm).toBeCloseTo(200, 6)
    expect(f.bottomSliver).toBe(true)
  })
})

describe('wallFaceTileCoursing — honesty guards', () => {
  const w = wall('w', 0, 0, 2.4, 0)
  const r = room('r', 'Bath', 0, 0, 2, 2)

  it('returns null for a finish with no SPECIFIED module', () => {
    expect(wallFaceTileCoursing(w, 'n', r, NO_MODULE, 2.4, 0)).toBeNull()
  })

  it('returns null for no finish at all', () => {
    expect(wallFaceTileCoursing(w, 'n', r, undefined, 2.4, 0)).toBeNull()
  })

  it('returns null for a degenerate face rather than dividing by zero', () => {
    expect(wallFaceTileCoursing(wall('z', 1, 1, 1, 1), 'n', r, TILE_300_600, 2.4, 0)).toBeNull()
    expect(wallFaceTileCoursing(w, 'n', r, TILE_300_600, 0, 0)).toBeNull()
  })

  it('carries the opening count through as a verify-on-site note', () => {
    expect(wallFaceTileCoursing(w, 'n', r, TILE_300_600, 2.4, 2)!.openings).toBe(2)
  })

  it('counts part tiles in the total, since a cut still consumes one', () => {
    // 2.5 x 2.5 m: 7 full + 2 cut columns = 9; 4 full + 1 cut course = 5.
    const f = wallFaceTileCoursing(wall('w', 0, 0, 2.5, 0), 'n', r, TILE_300_600, 2.5, 0)!
    expect(f.tileCount).toBe(9 * 5)
  })
})

describe('planWallTileCoursing — per storey', () => {
  const plan = (): FloorPlan =>
    ({
      id: 'p',
      name: 'p',
      extent: [6, 4],
      ceilingHeight: 2.6,
      walls: [
        wall('bath-n', 0, 0, 2.4, 0),
        wall('bath-s', 0, 2, 2.4, 2),
        wall('dry-n', 3, 0, 6, 0),
      ],
      openings: [
        { id: 'd', wallId: 'bath-s', kind: 'door', offset: 0.5, width: 0.7, sill: 0, head: 2.1 },
      ],
      rooms: [room('bath', 'Bath', 0, 0, 2.4, 2), room('dry', 'Bedroom', 3, 0, 3, 2)],
    }) as unknown as FloorPlan

  const materials = { 'wall-tile-white': TILE_300_600, 'wall-paint': NO_MODULE }

  it('produces a face per tiled wall, named by the SHARED allocator', () => {
    const { rows } = planWallTileCoursing(
      plan(),
      { bath: 'wall-tile-white', dry: 'wall-paint' },
      materials,
    )
    expect(rows.map((r) => r.wallId).sort()).toEqual(['bath-n', 'bath-s'])
    // Names match the elevation sheet's convention rather than a new scheme.
    expect(rows.every((r) => /^Bath wall \d\d$/.test(r.wallName))).toBe(true)
  })

  it('omits a painted room and REPORTS the omission', () => {
    const { rows, omittedFaces } = planWallTileCoursing(
      plan(),
      { bath: 'wall-tile-white', dry: 'wall-paint' },
      materials,
    )
    expect(rows.some((r) => r.roomId === 'dry')).toBe(false)
    // The bedroom's own wall was considered and skipped — not invisible.
    expect(omittedFaces).toBeGreaterThan(0)
  })

  it('attaches the opening count to the right face', () => {
    const { rows } = planWallTileCoursing(plan(), { bath: 'wall-tile-white' }, materials)
    expect(rows.find((r) => r.wallId === 'bath-s')!.openings).toBe(1)
    expect(rows.find((r) => r.wallId === 'bath-n')!.openings).toBe(0)
  })

  it("uses a room's OWN ceiling height for the tiled run when it has one", () => {
    const p = plan()
    p.rooms[0]!.ceilingHeight = 2.2
    const { rows } = planWallTileCoursing(p, { bath: 'wall-tile-white' }, materials)
    expect(rows[0]!.faceMm[1]).toBeCloseTo(2200, 6)
  })

  it('tiles a half-height wall only to its own top', () => {
    const p = plan()
    ;(p.walls[0] as { topHeight?: number }).topHeight = 1.2
    const { rows } = planWallTileCoursing(p, { bath: 'wall-tile-white' }, materials)
    expect(rows.find((r) => r.wallId === 'bath-n')!.faceMm[1]).toBeCloseTo(1200, 6)
  })

  it('does not throw on an empty or malformed plan', () => {
    expect(() => planWallTileCoursing({} as unknown as FloorPlan, {}, {})).not.toThrow()
    expect(() => planWallTileCoursing(null as unknown as FloorPlan, {}, {})).not.toThrow()
  })
})

/**
 * **Corner course alignment (v0.31.8.14).** `TODO.md` recorded that "faces are
 * set out independently, so courses do not generally align around a corner",
 * and called fixing it a larger job needing a design decision about which
 * face's balance to sacrifice. **That premise is wrong**, and these tests pin
 * why: courses are struck from the TOP of each face down, and every face of a
 * room shares the room's ceiling height and its single per-room wall finish, so
 * the course grid is identical on all four faces BY CONSTRUCTION.
 *
 * Measured on the shipped flat: Bath/WC 1, Bath/WC 2 and the Kitchen each have
 * all four faces at one `(fullCourses, bottomCut)` pair, and
 * `cornerCourseSteps` is empty for all three.
 *
 * The point of pinning it is that the alignment is a CONSEQUENCE of the
 * ceiling-down rule rather than something anyone asked for — so a change to
 * that rule (striking from the floor up, say, or per-face heights) would break
 * it silently.
 */
describe('planWallTileCoursing — corner course alignment', () => {
  const materials = { 'wall-tile-white': TILE_300_600 }

  /** A 2.4 x 2 m wet room, all four faces tiled. */
  const wetRoom = (over: Partial<PlanWall> = {}, targetId = ''): FloorPlan =>
    ({
      id: 'p',
      name: 'p',
      extent: [6, 4],
      ceilingHeight: 2.4,
      walls: [
        wall('n', 0, 0, 2.4, 0),
        wall('e', 2.4, 0, 2.4, 2),
        wall('s', 0, 2, 2.4, 2),
        wall('w', 0, 0, 0, 2),
      ].map((w) => (w.id === targetId ? { ...w, ...over } : w)),
      openings: [],
      rooms: [room('bath', 'Bath', 0, 0, 2.4, 2)],
    }) as unknown as FloorPlan

  it('aligns every face by construction — no corner steps', () => {
    const res = planWallTileCoursing(wetRoom(), { bath: 'wall-tile-white' }, materials)
    expect(res.rows).toHaveLength(4)
    // One distinct course grid across all four faces.
    const grids = new Set(res.rows.map((r) => `${r.fullCourses}/${r.bottomCutMm}`))
    expect(grids.size).toBe(1)
    expect(res.cornerCourseSteps).toEqual([])
  })

  it('still aligns when a half-height face is a WHOLE number of courses', () => {
    // 1.2 m on a 600 mm module: joints at 600 mm either side of the corner.
    // This is the arm that stops the check firing on a benign knee wall.
    const res = planWallTileCoursing(
      wetRoom({ topHeight: 1.2 }, 'e'),
      { bath: 'wall-tile-white' },
      materials,
    )
    expect(res.cornerCourseSteps).toEqual([])
  })

  it('reports the step when a half-height face is OUT of phase', () => {
    // 1.1 m: that face's joint lands at 500 mm against 600 mm on its
    // neighbours — a 100 mm step, exactly (2400 - 1100) mod 600.
    const res = planWallTileCoursing(
      wetRoom({ topHeight: 1.1 }, 'e'),
      { bath: 'wall-tile-white' },
      materials,
    )
    expect(res.cornerCourseSteps).toHaveLength(1)
    expect(res.cornerCourseSteps[0]!.wallId).toBe('e')
    expect(res.cornerCourseSteps[0]!.stepMm).toBeCloseTo(100, 3)
    expect(res.cornerCourseSteps[0]!.roomName).toBe('Bath')
  })

  it('blames the MINORITY face even when it is the FIRST one', () => {
    // The arm that makes the majority rule falsifiable. With the odd face at
    // 'e' (as above) a reference of "whichever face comes first" gives the same
    // answer, so that fixture cannot tell the two rules apart. Putting the odd
    // face FIRST separates them: a first-face reference would report the three
    // AGREEING faces as stepped and let the real offender pass.
    const res = planWallTileCoursing(
      wetRoom({ topHeight: 1.1 }, 'n'),
      { bath: 'wall-tile-white' },
      materials,
    )
    expect(res.cornerCourseSteps.map((s) => s.wallId)).toEqual(['n'])
    expect(res.cornerCourseSteps[0]!.stepMm).toBeCloseTo(100, 3)
  })
})
