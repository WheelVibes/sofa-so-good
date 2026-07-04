import { describe, expect, it } from 'vitest'
import { ROOMS } from '../constants'
import type { RoomId } from '../types'
import { computeRoomFloorRects, type FloorRect, rectMinus } from './floorRects'

/**
 * `rectMinus`/`computeRoomFloorRects` are pure, deterministic geometry: they
 * decide which room's finish paints every square metre of floor in the
 * default move-in 4-room HDB (`src/apartment/constants.ts`'s `ROOMS`). A bug
 * here is invisible in the type system — it shows up as z-fighting or a
 * neighbouring room's finish bleeding across a wall on the app's own default
 * plan. `rectMinus` was module-private; it is now exported (visibility only,
 * same implementation — see its docstring) so its exact-geometry cases can be
 * asserted directly instead of only indirectly through `computeRoomFloorRects`.
 */

function area(r: FloorRect): number {
  return (r.x1 - r.x0) * (r.z1 - r.z0)
}

function totalArea(rects: FloorRect[]): number {
  return rects.reduce((sum, r) => sum + area(r), 0)
}

function rectsOverlap(a: FloorRect, b: FloorRect): boolean {
  const eps = 1e-6
  return a.x0 < b.x1 - eps && b.x0 < a.x1 - eps && a.z0 < b.z1 - eps && b.z0 < a.z1 - eps
}

function containsPoint(r: FloorRect, x: number, z: number): boolean {
  return x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1
}

/** Rebuilds a room's own raw (pre-subtraction) rects straight from `ROOMS`'s
 *  origin/width/depth/extension fields — the same shape `floorRects.ts`'s
 *  private `roomRects` builds, but computed independently here as the test's
 *  "expected" fixture (not a re-import of the code under test). */
function rawRoomRects(id: RoomId): FloorRect[] {
  const r = ROOMS[id]
  const main: FloorRect = {
    x0: r.origin[0],
    z0: r.origin[1],
    x1: r.origin[0] + r.width,
    z1: r.origin[1] + r.depth,
  }
  if (!r.extension) return [main]
  const ext: FloorRect = {
    x0: r.origin[0] + r.extension.offset[0],
    z0: r.origin[1] + r.extension.offset[1],
    x1: r.origin[0] + r.extension.offset[0] + r.extension.width,
    z1: r.origin[1] + r.extension.offset[1] + r.extension.depth,
  }
  return [main, ext]
}

describe('rectMinus (a \\ b)', () => {
  const a: FloorRect = { x0: 0, z0: 0, x1: 4, z1: 4 }

  it('returns [a] unchanged when there is no overlap', () => {
    const b: FloorRect = { x0: 10, z0: 10, x1: 12, z1: 12 }
    expect(rectMinus(a, b)).toEqual([a])
  })

  it('treats exactly-touching edges as no overlap (epsilon guard)', () => {
    const b: FloorRect = { x0: 4, z0: 0, x1: 8, z1: 4 }
    expect(rectMinus(a, b)).toEqual([a])
  })

  it('returns [] when b fully covers a', () => {
    const b: FloorRect = { x0: -1, z0: -1, x1: 5, z1: 5 }
    expect(rectMinus(a, b)).toEqual([])
  })

  it('returns [] for identical rects', () => {
    const b: FloorRect = { ...a }
    expect(rectMinus(a, b)).toEqual([])
  })

  it('splits into a single strip on a partial edge overlap', () => {
    const b: FloorRect = { x0: 2, z0: 0, x1: 6, z1: 4 }
    const out = rectMinus(a, b)
    expect(out).toEqual([{ x0: 0, z0: 0, x1: 2, z1: 4 }])
    // Remaining area = a's area minus the intersection (2 x 4).
    expect(totalArea(out)).toBeCloseTo(area(a) - 2 * 4, 9)
  })

  it('splits into two sub-rects on a corner overlap, tiling a \\ b exactly', () => {
    const b: FloorRect = { x0: 2, z0: 2, x1: 6, z1: 6 }
    const out = rectMinus(a, b)
    expect(out).toEqual([
      { x0: 0, z0: 0, x1: 2, z1: 4 },
      { x0: 2, z0: 0, x1: 4, z1: 2 },
    ])
    expect(rectsOverlap(out[0], out[1])).toBe(false)
    expect(totalArea(out)).toBeCloseTo(area(a) - 2 * 2, 9)
  })

  it('clips correctly when b is far larger than a in extent (b larger than a)', () => {
    const b: FloorRect = { x0: 2, z0: -10, x1: 20, z1: 10 }
    const out = rectMinus(a, b)
    expect(out).toEqual([{ x0: 0, z0: 0, x1: 2, z1: 4 }])
  })

  it('produces no degenerate zero-area rect when the overlap is flush with an edge of a', () => {
    // b is flush with a's left, top, and bottom edges — only a genuine right
    // remainder strip should come out, never a zero-width "left" sliver.
    const b: FloorRect = { x0: 0, z0: 0, x1: 2, z1: 4 }
    const out = rectMinus(a, b)
    expect(out).toEqual([{ x0: 2, z0: 0, x1: 4, z1: 4 }])
    for (const r of out) {
      expect(r.x1 - r.x0).toBeGreaterThan(0)
      expect(r.z1 - r.z0).toBeGreaterThan(0)
    }
  })
})

describe('computeRoomFloorRects — simple non-overlapping pair', () => {
  // mainBedroom and bedroom2 share a wall but never overlap (nor does either
  // overlap any other room in the plan) — the simple case where subtraction
  // never fires and each room's output equals its own raw rect(s) unchanged.
  it('leaves non-overlapping rooms exactly as their raw rects', () => {
    const out = computeRoomFloorRects()
    expect(out.mainBedroom).toEqual(rawRoomRects('mainBedroom'))
    expect(out.bedroom2).toEqual(rawRoomRects('bedroom2'))
  })
})

describe('computeRoomFloorRects — L-shaped / overlapping case (livingDining vs bedroom3/corridor)', () => {
  // Documented in floorRects.ts + apartment/constants.ts: livingDining's main
  // rect genuinely overlaps bedroom3 and the corridor near the NW corner in
  // the source data. Both bedroom3 (9.69 m²) and the corridor (6.175 m²) have
  // smaller area than livingDining (24.295 m²), so they win the overlap and
  // livingDining's rendered floor is carved back to exclude it.
  it('the smaller rooms keep their full raw area; livingDining is carved back', () => {
    const out = computeRoomFloorRects()

    expect(out.bedroom3).toEqual(rawRoomRects('bedroom3'))
    expect(out.corridor).toEqual(rawRoomRects('corridor'))

    const rawLd = rawRoomRects('livingDining')
    const ldOut = out.livingDining
    expect(totalArea(ldOut)).toBeLessThan(totalArea(rawLd))

    // The carved-out pieces still tile only within livingDining's own raw
    // footprint (subtraction only ever shrinks, never relocates area)...
    for (const piece of ldOut) {
      const fitsSomeRawRect = rawLd.some(
        (rr) =>
          piece.x0 >= rr.x0 - 1e-6 &&
          piece.x1 <= rr.x1 + 1e-6 &&
          piece.z0 >= rr.z0 - 1e-6 &&
          piece.z1 <= rr.z1 + 1e-6,
      )
      expect(fitsSomeRawRect).toBe(true)
    }
    // ...and none of livingDining's remaining pieces re-overlap the rooms
    // that won the carve-out (no double-paint of the contested region).
    for (const piece of ldOut) {
      for (const other of [...out.bedroom3, ...out.corridor]) {
        expect(rectsOverlap(piece, other)).toBe(false)
      }
    }
  })
})

describe('computeRoomFloorRects — global tiling invariants over the real ROOMS dataset', () => {
  const interiorIds = (Object.keys(ROOMS) as RoomId[]).filter((id) => !ROOMS[id].external)
  const out = computeRoomFloorRects()

  it('returns an entry for every interior room and none for external rooms', () => {
    expect(Object.keys(out).sort()).toEqual([...interiorIds].sort())
    expect(out).not.toHaveProperty('acLedge')
  })

  it('no two rooms ever produce overlapping output rects', () => {
    for (let i = 0; i < interiorIds.length; i++) {
      for (let j = i + 1; j < interiorIds.length; j++) {
        for (const ra of out[interiorIds[i]]) {
          for (const rb of out[interiorIds[j]]) {
            expect(rectsOverlap(ra, rb)).toBe(false)
          }
        }
      }
    }
  })

  it("every output rect is a subset of one of its own room's raw rects", () => {
    for (const id of interiorIds) {
      const raw = rawRoomRects(id)
      for (const r of out[id]) {
        const fits = raw.some(
          (rr) =>
            r.x0 >= rr.x0 - 1e-6 &&
            r.x1 <= rr.x1 + 1e-6 &&
            r.z0 >= rr.z0 - 1e-6 &&
            r.z1 <= rr.z1 + 1e-6,
        )
        expect(fits).toBe(true)
      }
    }
  })

  it('tiles the union of all raw interior room rects with no gaps and no double-paint (grid sample)', () => {
    const rawByRoom = new Map(interiorIds.map((id) => [id, rawRoomRects(id)] as const))
    let minX = Number.POSITIVE_INFINITY
    let maxX = Number.NEGATIVE_INFINITY
    let minZ = Number.POSITIVE_INFINITY
    let maxZ = Number.NEGATIVE_INFINITY
    for (const rects of rawByRoom.values()) {
      for (const r of rects) {
        minX = Math.min(minX, r.x0)
        maxX = Math.max(maxX, r.x1)
        minZ = Math.min(minZ, r.z0)
        maxZ = Math.max(maxZ, r.z1)
      }
    }

    // Room coordinates are all multiples of 0.05 m (see constants.ts) — a
    // 0.025 m offset from the grid origin guarantees no sample point ever
    // lands exactly on a wall/rect boundary, so plain >=/<= containment
    // (no epsilon) is unambiguous.
    const step = 0.1
    let sampled = 0
    for (let x = minX + 0.025; x < maxX; x += step) {
      for (let z = minZ + 0.025; z < maxZ; z += step) {
        sampled++
        const rawHitCount = interiorIds.filter((id) =>
          rawByRoom.get(id)?.some((r) => containsPoint(r, x, z)),
        ).length
        const outHitCount = interiorIds.filter((id) =>
          out[id].some((r) => containsPoint(r, x, z)),
        ).length

        // Never double-painted, regardless of raw overlap.
        expect(outHitCount).toBeLessThanOrEqual(1)
        if (rawHitCount > 0) {
          // Some room's raw footprint covers this point — resolution must
          // assign it to exactly one room (no gap left unpainted).
          expect(outHitCount).toBe(1)
        } else {
          expect(outHitCount).toBe(0)
        }
      }
    }
    // Sanity: the grid actually covered a meaningful number of points.
    expect(sampled).toBeGreaterThan(1000)
  })
})
