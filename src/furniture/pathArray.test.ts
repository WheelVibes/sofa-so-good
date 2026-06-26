import { describe, expect, it } from 'vitest'
import {
  PATH_ARRAY_MAX_COUNT,
  type PathPlacement,
  type PathPoint,
  pathArrayPlacements,
} from './pathArray'

function expectPos(p: PathPlacement, x: number, z: number) {
  expect(p.position[0]).toBeCloseTo(x, 9)
  expect(p.position[1]).toBeCloseTo(z, 9)
}

// A straight 10 m line along +X.
const LINE: PathPoint[] = [
  [0, 0],
  [10, 0],
]

// An L: 3 m along +X, then 4 m along +Z (total 7 m, bend at (3,0)).
const L_PATH: PathPoint[] = [
  [0, 0],
  [3, 0],
  [3, 4],
]

describe('pathArrayPlacements', () => {
  // ── edge cases ────────────────────────────────────────────────────────────

  it('returns [] for fewer than 2 points', () => {
    expect(pathArrayPlacements([], { count: 5 })).toEqual([])
    expect(pathArrayPlacements([[0, 0]], { count: 5 })).toEqual([])
  })

  it('returns [] for a zero-length path (all points coincide)', () => {
    const pts: PathPoint[] = [
      [2, 2],
      [2, 2],
      [2, 2],
    ]
    expect(pathArrayPlacements(pts, { count: 5 })).toEqual([])
  })

  it('returns [] for count < 1 in count mode', () => {
    expect(pathArrayPlacements(LINE, { count: 0 })).toEqual([])
    expect(pathArrayPlacements(LINE, { count: -2 })).toEqual([])
  })

  it('returns [] for spacing ≤ 0 in spacing mode', () => {
    expect(pathArrayPlacements(LINE, { mode: 'spacing', spacing: 0 })).toEqual([])
    expect(pathArrayPlacements(LINE, { mode: 'spacing', spacing: -1 })).toEqual([])
  })

  it('floors a fractional count', () => {
    expect(pathArrayPlacements(LINE, { count: 4.9 })).toHaveLength(4)
  })

  it('caps count at PATH_ARRAY_MAX_COUNT', () => {
    const pl = pathArrayPlacements(LINE, { count: PATH_ARRAY_MAX_COUNT + 50 })
    expect(pl).toHaveLength(PATH_ARRAY_MAX_COUNT)
  })

  it('count=1 lands a single copy at the path start', () => {
    const pl = pathArrayPlacements(LINE, { count: 1 })
    expect(pl).toHaveLength(1)
    expectPos(pl[0], 0, 0)
  })

  it('skips zero-length segments without producing NaN', () => {
    // duplicate vertex in the middle of an otherwise valid line
    const pts: PathPoint[] = [
      [0, 0],
      [5, 0],
      [5, 0], // duplicate → zero-length segment
      [10, 0],
    ]
    const pl = pathArrayPlacements(pts, { count: 3 })
    expect(pl).toHaveLength(3)
    for (const p of pl) {
      expect(Number.isNaN(p.rotation)).toBe(false)
      expect(Number.isNaN(p.position[0])).toBe(false)
    }
    expectPos(pl[0], 0, 0)
    expectPos(pl[1], 5, 0)
    expectPos(pl[2], 10, 0)
  })

  // ── arc-length spacing (count mode) ───────────────────────────────────────

  it('open line, count 5 → 5 evenly arc-spaced copies inclusive of both ends', () => {
    const pl = pathArrayPlacements(LINE, { count: 5 })
    expect(pl).toHaveLength(5)
    // step = 10/(5-1) = 2.5
    expectPos(pl[0], 0, 0)
    expectPos(pl[1], 2.5, 0)
    expectPos(pl[2], 5, 0)
    expectPos(pl[3], 7.5, 0)
    expectPos(pl[4], 10, 0)
  })

  it('adjacent copies are equidistant along the path (arc-length, not chord)', () => {
    const pl = pathArrayPlacements(L_PATH, { count: 8 })
    expect(pl).toHaveLength(8)
    // total length = 7, step = 7/7 = 1.0 between consecutive arc params
    for (let i = 1; i < pl.length; i++) {
      expect((pl[i].t - pl[i - 1].t) * 7).toBeCloseTo(1, 9)
    }
  })

  it('samples correctly across an L bend (arc-length, not straight chord)', () => {
    // L: 3 m +X then 4 m +Z. count=3 over total 7 → step 3.5.
    const pl = pathArrayPlacements(L_PATH, { count: 3 })
    expect(pl).toHaveLength(3)
    expectPos(pl[0], 0, 0) // start
    expectPos(pl[1], 3, 0.5) // 3.5 m: 3 along +X then 0.5 up +Z
    expectPos(pl[2], 3, 4) // end (7 m)
  })

  it('t parameter spans [0, 1] inclusive for an open path', () => {
    const pl = pathArrayPlacements(LINE, { count: 4 })
    expect(pl[0].t).toBeCloseTo(0, 9)
    expect(pl[pl.length - 1].t).toBeCloseTo(1, 9)
  })

  // ── spacing mode ──────────────────────────────────────────────────────────

  it('spacing mode steps a fixed distance until the path is exhausted', () => {
    // 10 m line, 2.5 m spacing → copies at 0, 2.5, 5, 7.5, 10
    const pl = pathArrayPlacements(LINE, { mode: 'spacing', spacing: 2.5 })
    expect(pl).toHaveLength(5)
    expectPos(pl[0], 0, 0)
    expectPos(pl[4], 10, 0)
  })

  it('spacing larger than the whole path → a single copy at the start', () => {
    const pl = pathArrayPlacements(LINE, { mode: 'spacing', spacing: 50 })
    expect(pl).toHaveLength(1)
    expectPos(pl[0], 0, 0)
  })

  it('spacing mode is capped at PATH_ARRAY_MAX_COUNT', () => {
    // 10 m line, tiny spacing would yield thousands of copies
    const pl = pathArrayPlacements(LINE, { mode: 'spacing', spacing: 0.001 })
    expect(pl.length).toBeLessThanOrEqual(PATH_ARRAY_MAX_COUNT)
  })

  // ── tangent yaw (align) ───────────────────────────────────────────────────

  it('align=true: yaw faces along the path tangent (+X line → yaw π/2)', () => {
    // Along +X: dir=(1,0). Yaw θ with item +Z world = (sin θ, cos θ) = (1, 0) → θ = π/2.
    const pl = pathArrayPlacements(LINE, { count: 3, align: true })
    for (const p of pl) {
      expect(p.rotation).toBeCloseTo(Math.PI / 2, 9)
    }
  })

  it('align=true: yaw differs before and after a bend', () => {
    const pl = pathArrayPlacements(L_PATH, { count: 3, align: true })
    // copy before bend (at (1.5,0)) travels +X → yaw π/2.
    // Place copies to land clearly on each leg: use count=5 (step 1.75).
    const fine = pathArrayPlacements(L_PATH, { count: 5, align: true })
    // fine[1] at 1.75 m on the +X leg → yaw atan2(1,0) = π/2
    expect(fine[1].rotation).toBeCloseTo(Math.PI / 2, 9)
    // fine[3] at 5.25 m → on the +Z leg (dir 0,1) → yaw atan2(0,1) = 0
    expect(fine[3].rotation).toBeCloseTo(0, 9)
    expect(pl).toHaveLength(3)
  })

  it('align=false: every copy keeps baseRotation', () => {
    const pl = pathArrayPlacements(LINE, { count: 4, align: false, baseRotation: 1.23 })
    for (const p of pl) {
      expect(p.rotation).toBeCloseTo(1.23, 9)
    }
  })

  // ── closed loop ───────────────────────────────────────────────────────────

  it('closed square, count 4 → one copy per corner (exclusive seam)', () => {
    // 2x2 square, perimeter 8 m. count=4 → step 2 m starting at (0,0).
    const square: PathPoint[] = [
      [0, 0],
      [2, 0],
      [2, 2],
      [0, 2],
    ]
    const pl = pathArrayPlacements(square, { count: 4, closed: true })
    expect(pl).toHaveLength(4)
    expectPos(pl[0], 0, 0)
    expectPos(pl[1], 2, 0)
    expectPos(pl[2], 2, 2)
    expectPos(pl[3], 0, 2)
    // exclusive seam: last copy is NOT back at the start
    const d = Math.hypot(
      pl[3].position[0] - pl[0].position[0],
      pl[3].position[1] - pl[0].position[1],
    )
    expect(d).toBeGreaterThan(0.5)
  })

  it('closed loop spacing mode drops the wrap-around final stride', () => {
    // perimeter 8 m, spacing 2 → would step 0,2,4,6,(8=start). Drop the 8.
    const square: PathPoint[] = [
      [0, 0],
      [2, 0],
      [2, 2],
      [0, 2],
    ]
    const pl = pathArrayPlacements(square, { mode: 'spacing', spacing: 2, closed: true })
    expect(pl).toHaveLength(4)
    expectPos(pl[0], 0, 0)
  })

  it('open vs closed count mode differ in spacing', () => {
    const square: PathPoint[] = [
      [0, 0],
      [2, 0],
      [2, 2],
      [0, 2],
    ]
    const open = pathArrayPlacements(square, { count: 4, closed: false })
    const closed = pathArrayPlacements(square, { count: 4, closed: true })
    // open: total = 6 (3 segs), step 2 → ends at the last vertex (0,2)
    // closed: total = 8 (4 segs), step 2 → ends one stride before the seam
    expect(open[open.length - 1].t).toBeCloseTo(1, 9)
    expect(closed[closed.length - 1].t).toBeLessThan(1)
  })
})
