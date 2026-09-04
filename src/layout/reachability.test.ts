import { describe, expect, it } from 'vitest'
import type { OBB } from '../collision/obb'
import type { CollisionWall } from '../collision/walls'
import { GROUND_LEVEL_ID } from '../floorplan/levels'
import type { PlanRoom } from '../floorplan/types'
import { analyseLevelReachability, BODY_WIDTH_M } from './reachability'

/**
 * BLOCKED-ROUTE-REACHABILITY (v0.31.8.52).
 *
 * v0.31.8.51 established what this file has to do. `walkway.ts` measures GAPS,
 * and no gap threshold can tell *"jammed together, walk around"* from *"this
 * pair seals the only way through"* — dropping its 0.40 m floor to try turned
 * every `sofa ↔ coffee-table` adjacency into a blocked route and halved the
 * corpus's circulation score. The distinction is a connectivity question, and
 * these tests are the ones that could not be written as a threshold.
 *
 * The ruler is the BODY, not a number: erode the free floor by half a body
 * width and see what is still connected.
 */

const room = (id: string, x: number, z: number, w: number, d: number): PlanRoom =>
  ({ id, name: id, origin: [x, z], width: w, depth: d }) as PlanRoom

/** An axis-aligned footprint centred at (cx, cz). */
const box = (cx: number, cz: number, w: number, d: number): OBB => ({
  cx,
  cz,
  hx: w / 2,
  hz: d / 2,
  rot: 0,
})

/** A thin wall segment (0.1 m) between two points. */
const wall = (ax: number, az: number, bx: number, bz: number): CollisionWall => ({
  ax,
  az,
  bx,
  bz,
  thickness: 0.1,
})

/**
 * The four perimeter walls around the bounding box of `rooms`. Every fixture
 * needs these: the check finds the interior by flooding INWARD from the grid
 * border with the doors closed, so a room with no walls has no envelope and no
 * interior — which is correct, and is why these helpers exist rather than a
 * "no walls means the rooms are the floor" special case in the module.
 */
function enclose(rooms: PlanRoom[]): CollisionWall[] {
  const x0 = Math.min(...rooms.map((r) => r.origin[0]))
  const z0 = Math.min(...rooms.map((r) => r.origin[1]))
  const x1 = Math.max(...rooms.map((r) => r.origin[0] + r.width))
  const z1 = Math.max(...rooms.map((r) => r.origin[1] + r.depth))
  return [wall(x0, z0, x1, z0), wall(x1, z0, x1, z1), wall(x1, z1, x0, z1), wall(x0, z1, x0, z0)]
}

/** `walls` are the INTERNAL partitions; the perimeter is added automatically.
 *  Doors are open and closed alike here (fixtures gap their walls by hand), so
 *  both wall sets are the same. */
const analyse = (rooms: PlanRoom[], walls: CollisionWall[], obbs: OBB[]) => {
  const all = [...enclose(rooms), ...walls]
  return analyseLevelReachability(rooms, all, obbs, GROUND_LEVEL_ID, undefined, all)
}

describe('analyseLevelReachability', () => {
  it('reports an empty room as fully reachable', () => {
    const [r] = analyse([room('r', 0, 0, 4, 3)], [], [])
    expect(r).toBeDefined()
    expect(r?.walkableAreaM2).toBeGreaterThan(0)
    expect(r?.strandedAreaM2).toBeCloseTo(0, 5)
    expect(r?.isolated).toBe(false)
  })

  it('erodes by half a body width, so the walkable area is inset from the walls', () => {
    // A person 0.6 m wide standing in a 4 x 3 room can occupy a 3.4 x 2.4 band —
    // 0.3 m is unreachable on every side. That is 8.16 m² of a 12 m² room.
    const [r] = analyse([room('r', 0, 0, 4, 3)], [], [])
    expect(r?.walkableAreaM2).toBeGreaterThan(7.5)
    expect(r?.walkableAreaM2).toBeLessThan(8.8)
  })

  // ── The case a gap threshold cannot express ────────────────────────────────

  it('SEVERS a room when two pieces bridge it wall to wall', () => {
    // A 4 m wide room with two 1.9 m pieces meeting in the middle: the residual
    // slot is 0.2 m, so nothing gets past and the far end is cut off.
    const rooms = [room('r', 0, 0, 4, 6)]
    const obbs = [box(0.95, 3, 1.9, 0.6), box(3.05, 3, 1.9, 0.6)]
    const [r] = analyse(rooms, [], obbs)
    expect(r?.strandedAreaM2).toBeGreaterThan(2)
    expect(r?.isolated).toBe(false) // part of it IS still reachable
  })

  it('does NOT sever the same room when the two pieces leave a real doorway', () => {
    // Identical pieces, pulled apart to leave 1.0 m between them — a route.
    const rooms = [room('r', 0, 0, 4, 6)]
    const obbs = [box(0.75, 3, 1.5, 0.6), box(3.25, 3, 1.5, 0.6)]
    const [r] = analyse(rooms, [], obbs)
    expect(r?.strandedAreaM2).toBeCloseTo(0, 2)
  })

  it('treats a gap exactly at the body width as passable and below it as not', () => {
    // The ruler IS the body width — pinned on both sides of it with the same
    // fixture, so this cannot pass by accident.
    const rooms = [room('r', 0, 0, 4, 6)]
    const slot = (gap: number) => {
      const half = (4 - gap) / 2
      return [box(half / 2, 3, half, 0.6), box(4 - half / 2, 3, half, 0.6)]
    }
    const open = analyse(rooms, [], slot(BODY_WIDTH_M + 0.15))[0]
    const shut = analyse(rooms, [], slot(BODY_WIDTH_M - 0.25))[0]
    expect(open?.strandedAreaM2).toBeCloseTo(0, 2)
    expect(shut?.strandedAreaM2).toBeGreaterThan(2)
  })

  it('is silent about an arm’s-reach pair that blocks nothing', () => {
    // A sofa and a coffee table 0.3 m apart in the middle of a room: exactly the
    // pair v0.31.8.51's rejected fix reported as a blocked route. There is floor
    // all around them, so there is nothing to strand.
    const rooms = [room('r', 0, 0, 5, 5)]
    const obbs = [box(2.5, 2.0, 2.1, 0.9), box(2.5, 2.9, 1.1, 0.55)]
    const [r] = analyse(rooms, [], obbs)
    expect(r?.strandedAreaM2).toBeCloseTo(0, 2)
    expect(r?.isolated).toBe(false)
  })

  // ── Whole rooms ───────────────────────────────────────────────────────────

  it('marks a room ISOLATED when its only doorway is furnished shut', () => {
    // Two rooms side by side with a wall between them and a 0.9 m doorway (the
    // wall is authored as two stubs). A wardrobe parked across the opening cuts
    // the second room off entirely.
    const rooms = [room('a', 0, 0, 4, 4), room('b', 4, 0, 3, 4)]
    const walls = [wall(4, 0, 4, 1.5), wall(4, 2.4, 4, 4)]
    const clear = analyse(rooms, walls, [])
    expect(clear.find((r) => r.roomId === 'b')?.isolated).toBe(false)

    const blocked = analyse(rooms, walls, [box(4.35, 1.95, 0.6, 1.6)])
    expect(blocked.find((r) => r.roomId === 'b')?.isolated).toBe(true)
    // And room `a` — the larger one, so the storey's main region — is not.
    expect(blocked.find((r) => r.roomId === 'a')?.isolated).toBe(false)
  })

  it('a room too narrow for a body reports no walkable floor, and is not isolated', () => {
    // `isolated` means "you cannot walk IN", which presupposes there is somewhere
    // to walk to. A 0.4 m slot admits nobody at any point, so it has no walkable
    // floor and no finding — otherwise every shelter, store and duct riser in
    // the library would warn about being unreachable.
    const [r] = analyse([room('slot', 0, 0, 0.4, 3)], [], [])
    expect(r?.walkableAreaM2).toBeCloseTo(0, 5)
    expect(r?.strandedAreaM2).toBeCloseTo(0, 5)
    expect(r?.isolated).toBe(false)
  })

  it('ignores an item that is not on the floor plan area at all', () => {
    const rooms = [room('r', 0, 0, 4, 4)]
    const far = analyse(rooms, [], [box(50, 50, 2, 2)])[0]
    const none = analyse(rooms, [], [])[0]
    expect(far?.walkableAreaM2).toBeCloseTo(none?.walkableAreaM2 ?? -1, 5)
  })

  it('returns nothing for a storey with no rooms', () => {
    expect(analyse([], [], [])).toEqual([])
  })

  it('a wider body strands more floor than a narrower one, on the same layout', () => {
    // The monotonicity that makes `BODY_WIDTH_M` a meaningful knob rather than a
    // magic number: widen the body and routes close, never open.
    const rooms = [room('r', 0, 0, 4, 6)]
    const obbs = [box(0.85, 3, 1.7, 0.6), box(3.15, 3, 1.7, 0.6)] // 0.6 m slot
    const all = enclose(rooms)
    const narrow = analyseLevelReachability(rooms, all, obbs, GROUND_LEVEL_ID, 0.4, all)
    const wide = analyseLevelReachability(rooms, all, obbs, GROUND_LEVEL_ID, 0.9, all)
    expect(narrow[0]?.strandedAreaM2 ?? 0).toBeLessThan(wide[0]?.strandedAreaM2 ?? 0)
  })
})
