import { describe, expect, it } from 'vitest'
import type { PlanVec2 } from '../floorplan/types'
import { pointInPolygon } from '../floorplan/types'
import type { FurnitureDef, FurnitureItem } from '../furniture/types'
import { type ScatterPlacement, scatterInRoom } from './scatterInRoom'

// A 6 m × 4 m rectangular room at the origin.
const RECT: PlanVec2[] = [
  [0, 0],
  [6, 0],
  [6, 4],
  [0, 4],
]

// An L-shaped (concave) room: a 6×6 square with a 3×3 notch cut from the
// top-right corner. The notch interior (e.g. (4.5, 4.5)) is OUTSIDE the room.
const L_SHAPE: PlanVec2[] = [
  [0, 0],
  [6, 0],
  [6, 3],
  [3, 3],
  [3, 6],
  [0, 6],
]

const FOOTPRINT = { w: 0.5, d: 0.5, h: 0.5 }

/** Min centre-to-centre distance between any pair of placements. */
function minPairDistance(ps: ScatterPlacement[]): number {
  let min = Number.POSITIVE_INFINITY
  for (let i = 0; i < ps.length; i++) {
    for (let j = i + 1; j < ps.length; j++) {
      const dx = ps[i]!.position[0] - ps[j]!.position[0]
      const dz = ps[i]!.position[1] - ps[j]!.position[1]
      min = Math.min(min, Math.hypot(dx, dz))
    }
  }
  return min
}

describe('scatterInRoom', () => {
  it('places all requested copies inside the room polygon', () => {
    const res = scatterInRoom(RECT, FOOTPRINT, 6)
    expect(res.placed).toBe(6)
    expect(res.placements).toHaveLength(6)
    for (const p of res.placements) {
      expect(pointInPolygon(p.position[0], p.position[1], RECT)).toBe(true)
    }
  })

  it('keeps the WHOLE footprint inside the room (no corner clips a wall)', () => {
    const res = scatterInRoom(RECT, FOOTPRINT, 12)
    const hw = FOOTPRINT.w / 2
    const hd = FOOTPRINT.d / 2
    for (const p of res.placements) {
      const [cx, cz] = p.position
      for (const [sx, sz] of [
        [-hw, -hd],
        [hw, -hd],
        [hw, hd],
        [-hw, hd],
      ] as const) {
        expect(pointInPolygon(cx + sx, cz + sz, RECT)).toBe(true)
      }
    }
  })

  it('never overlaps: every pair is at least the footprint apart', () => {
    const res = scatterInRoom(RECT, FOOTPRINT, 30, { clearance: 0.1 })
    expect(res.placements.length).toBeGreaterThan(1)
    // Cell pitch is footprint + clearance = 0.6; centres can never be closer.
    expect(minPairDistance(res.placements)).toBeGreaterThanOrEqual(0.6 - 1e-9)
  })

  it('is deterministic for a fixed seed', () => {
    const a = scatterInRoom(RECT, FOOTPRINT, 8, { seed: 42 })
    const b = scatterInRoom(RECT, FOOTPRINT, 8, { seed: 42 })
    expect(b.placements).toEqual(a.placements)
  })

  it('differs by seed (which cells are chosen) but stays even', () => {
    const a = scatterInRoom(RECT, FOOTPRINT, 5, { seed: 1 })
    const b = scatterInRoom(RECT, FOOTPRINT, 5, { seed: 999 })
    // Same count, both even (>= pitch apart), but the chosen subset differs.
    expect(a.placed).toBe(5)
    expect(b.placed).toBe(5)
    expect(minPairDistance(a.placements)).toBeGreaterThanOrEqual(0.6 - 1e-9)
    expect(minPairDistance(b.placements)).toBeGreaterThanOrEqual(0.6 - 1e-9)
    const key = (ps: ScatterPlacement[]) =>
      ps
        .map((p) => `${p.position[0].toFixed(3)},${p.position[1].toFixed(3)}`)
        .sort()
        .join('|')
    expect(key(a.placements)).not.toEqual(key(b.placements))
  })

  it('spacing is even on a packed grid (full fill uses uniform pitch)', () => {
    // 6×4 room, footprint 0.5 + clearance 0.1 → pitch 0.6 → up to 10 cols × 6 rows.
    const res = scatterInRoom(RECT, FOOTPRINT, 200, { clearance: 0.1 })
    // Distinct X and Z coordinates should be uniformly spaced by the pitch.
    const xs = [...new Set(res.placements.map((p) => Number(p.position[0].toFixed(4))))].sort(
      (m, n) => m - n,
    )
    // Every gap between distinct columns is a positive integer multiple of the
    // 0.6 pitch (a column whose footprint clips the wall is simply skipped, so
    // adjacent occupied columns can be 1×, 2×, … the pitch apart — never off-grid).
    for (let i = 1; i < xs.length; i++) {
      const gap = xs[i]! - xs[i - 1]!
      const k = gap / 0.6
      expect(Math.abs(k - Math.round(k))).toBeLessThan(1e-4)
      expect(Math.round(k)).toBeGreaterThanOrEqual(1)
    }
  })

  it('caps at the number that fits and reports the shortfall (over-count)', () => {
    // Request far more than the ~60-cell grid can hold.
    const res = scatterInRoom(RECT, FOOTPRINT, 10_000, { clearance: 0.1 })
    expect(res.requested).toBe(10_000)
    expect(res.placed).toBeLessThan(10_000)
    expect(res.placed).toBeGreaterThan(0)
    expect(res.placements).toHaveLength(res.placed)
  })

  it('returns nothing for zero / negative count', () => {
    expect(scatterInRoom(RECT, FOOTPRINT, 0).placed).toBe(0)
    expect(scatterInRoom(RECT, FOOTPRINT, -5).placed).toBe(0)
    expect(scatterInRoom(RECT, FOOTPRINT, 0).requested).toBe(0)
  })

  it('returns nothing for a degenerate (sub-triangle / zero-area) polygon', () => {
    expect(
      scatterInRoom(
        [
          [0, 0],
          [1, 1],
        ] as PlanVec2[],
        FOOTPRINT,
        4,
      ).placed,
    ).toBe(0)
    const collinear: PlanVec2[] = [
      [0, 0],
      [1, 0],
      [2, 0],
    ]
    expect(scatterInRoom(collinear, FOOTPRINT, 4).placed).toBe(0)
  })

  it('returns nothing when the footprint is bigger than the room', () => {
    const tiny: PlanVec2[] = [
      [0, 0],
      [0.3, 0],
      [0.3, 0.3],
      [0, 0.3],
    ]
    expect(scatterInRoom(tiny, FOOTPRINT, 4).placed).toBe(0)
  })

  it('respects a concave (L-shaped) room — nothing lands in the notch', () => {
    const res = scatterInRoom(L_SHAPE, FOOTPRINT, 200)
    expect(res.placed).toBeGreaterThan(0)
    for (const p of res.placements) {
      expect(pointInPolygon(p.position[0], p.position[1], L_SHAPE)).toBe(true)
      // The notch (x>3 AND z>3) must be empty.
      const inNotch = p.position[0] > 3 && p.position[1] > 3
      expect(inNotch).toBe(false)
    }
  })

  it('respects existing items (collision-avoiding)', () => {
    // Block the centre of the room with a big existing item.
    const blockerDef = {
      id: 'blocker',
      kind: 'parametric',
      name: 'blocker',
      category: 'others',
      primitive: 'Bed',
      defaultFootprint: { w: 2, d: 2, h: 1 },
      paramSchema: [],
    } as unknown as FurnitureDef
    const blocker: FurnitureItem = {
      id: 'b1',
      defId: 'blocker',
      position: [3, 2],
      rotation: 0,
      props: { width: 2, depth: 2 },
    }
    const res = scatterInRoom(RECT, FOOTPRINT, 200, {
      existing: [blocker],
      defs: { blocker: blockerDef },
      clearance: 0.1,
    })
    expect(res.placed).toBeGreaterThan(0)
    // No placement may fall inside the blocker's 2×2 footprint (centre 3,2).
    for (const p of res.placements) {
      const insideBlocker =
        Math.abs(p.position[0] - 3) < 1 + FOOTPRINT.w / 2 &&
        Math.abs(p.position[1] - 2) < 1 + FOOTPRINT.d / 2
      expect(insideBlocker).toBe(false)
    }
  })

  it('carries the requested rotation onto every copy', () => {
    const res = scatterInRoom(RECT, FOOTPRINT, 4, { rotation: Math.PI / 2 })
    for (const p of res.placements) expect(p.rotation).toBeCloseTo(Math.PI / 2, 6)
  })
})
