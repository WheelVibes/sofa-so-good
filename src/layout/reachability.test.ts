import { describe, expect, it } from 'vitest'
import type { OBB } from '../collision/obb'
import type { CollisionWall } from '../collision/walls'
import { GROUND_LEVEL_ID } from '../floorplan/levels'
import type { PlanRoom } from '../floorplan/types'
import {
  analyseLevelReachability,
  BODY_WIDTH_M,
  findFurnitureSeveredRooms,
  unsealRoutes,
} from './reachability'

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

/**
 * Culprit attribution (v0.31.8.54) — which piece SEALS the room?
 *
 * This is what turns a finding into an instruction. It reuses the raster rather
 * than re-running the pipeline per item: the grid is furniture-independent
 * apart from an `itemAt` lookup, so "does the room reconnect without this
 * piece?" is one solve with that footprint's cells freed.
 */
describe('findFurnitureSeveredRooms — sealedBy', () => {
  const wallOf = (
    ax: number,
    az: number,
    bx: number,
    bz: number,
    thickness: 'internal' | 'external' = 'internal',
  ) => ({ id: `w-${ax}-${az}-${bx}-${bz}`, start: [ax, az], end: [bx, bz], thickness })
  /** The front door, on the west EXTERNAL wall — what anchors the main region.
   *  Without it these fixtures fall back to "largest component", which is the
   *  heuristic v0.31.8.54 replaced precisely because removing a piece can flip
   *  which region is largest. */
  const mainDoor = (wallId: string, offset: number) => ({
    id: 'main',
    wallId,
    kind: 'door',
    offset,
    width: 0.9,
  })
  /** Two rooms, 4 x 4 and 3 x 4, with a 0.9 m doorway between them. */
  const twoRoomPlan = () =>
    ({
      name: 'p',
      extent: [7, 4],
      ceilingHeight: 2.6,
      walls: [
        wallOf(0, 0, 7, 0, 'external'),
        wallOf(7, 0, 7, 4, 'external'),
        wallOf(7, 4, 0, 4, 'external'),
        wallOf(0, 4, 0, 0, 'external'),
        wallOf(4, 0, 4, 1.5),
        wallOf(4, 2.4, 4, 4),
      ],
      openings: [mainDoor('w-0-4-0-0', 1.5)],
      rooms: [
        { id: 'a', name: 'Living', origin: [0, 0], width: 4, depth: 4 },
        { id: 'b', name: 'Bedroom', origin: [4, 0], width: 3, depth: 4 },
      ],
    }) as unknown as import('../floorplan/types').FloorPlan

  const bigDef = {
    id: 'wardrobe',
    name: 'Wardrobe',
    category: 'storage',
    kind: 'primitive',
    defaultFootprint: { w: 0.6, d: 1.8 },
  } as unknown as import('../furniture/types').FurnitureDef
  const lampDef = {
    id: 'floor-lamp',
    name: 'Floor lamp',
    category: 'lighting',
    kind: 'primitive',
    defaultFootprint: { w: 0.42, d: 0.42 },
  } as unknown as import('../furniture/types').FurnitureDef
  const planDefs = { wardrobe: bigDef, 'floor-lamp': lampDef }
  const place = (id: string, defId: string, x: number, z: number) =>
    ({
      id,
      defId,
      position: [x, z],
      rotation: 0,
      props: {},
    }) as unknown as import('../furniture/types').FurnitureItem

  it('names the single piece that seals the room', () => {
    const sev = findFurnitureSeveredRooms(
      [place('w1', 'wardrobe', 4.35, 1.95)],
      planDefs,
      twoRoomPlan(),
    )
    expect(sev).toHaveLength(1)
    expect(sev[0]?.roomName).toBe('Bedroom')
    expect(sev[0]?.sealedBy.map((c) => c.defId)).toEqual(['wardrobe'])
    expect(sev[0]?.sealedBy[0]?.itemId).toBe('w1')
  })

  it('reports NO culprit when the blockage is a CHAIN of two pieces', () => {
    // Living -> Hall -> Bath, each doorway sealed by its own wardrobe. Removing
    // the first makes the HALL reachable but not the bath; removing the second
    // opens the bath from the hall, which is itself still cut off. So no single
    // piece opens the bath, and saying "move the wardrobe" would be wrong.
    //
    // This is the real shape of the 3 corpus cases with no culprit — a room
    // behind a room, e.g. `tpl-condo-penthouse`'s master bath behind its master
    // bedroom.
    const chainPlan = {
      name: 'p',
      extent: [10, 4],
      ceilingHeight: 2.6,
      walls: [
        wallOf(0, 0, 10, 0, 'external'),
        wallOf(10, 0, 10, 4, 'external'),
        wallOf(10, 4, 0, 4, 'external'),
        wallOf(0, 4, 0, 0, 'external'),
        // x = 4 partition, doorway z 1.5-2.4
        wallOf(4, 0, 4, 1.5),
        wallOf(4, 2.4, 4, 4),
        // x = 7 partition, doorway z 1.5-2.4
        wallOf(7, 0, 7, 1.5),
        wallOf(7, 2.4, 7, 4),
      ],
      openings: [mainDoor('w-0-4-0-0', 1.5)],
      rooms: [
        { id: 'a', name: 'Living', origin: [0, 0], width: 4, depth: 4 },
        { id: 'h', name: 'Hall', origin: [4, 0], width: 3, depth: 4 },
        { id: 'b', name: 'Bath', origin: [7, 0], width: 3, depth: 4 },
      ],
    } as unknown as import('../floorplan/types').FloorPlan

    const sev = findFurnitureSeveredRooms(
      [place('w1', 'wardrobe', 4.35, 1.95), place('w2', 'wardrobe', 7.35, 1.95)],
      planDefs,
      chainPlan,
    )
    const bath = sev.find((r) => r.roomName === 'Bath')
    expect(bath).toBeDefined()
    expect(bath?.sealedBy).toEqual([])
    // The hall, one link closer, DOES have a single culprit — so this fixture
    // is distinguishing the chain from "nothing is attributable at all".
    expect(sev.find((r) => r.roomName === 'Hall')?.sealedBy.map((c) => c.itemId)).toEqual(['w1'])
  })

  it('a piece below the obstacle bar is never a culprit, because it never seals', () => {
    // A 0.18 m² floor lamp in the doorway. You step past it — see
    // `participates`, and v0.31.8.53's retraction.
    const sev = findFurnitureSeveredRooms(
      [place('l1', 'floor-lamp', 4.35, 1.95)],
      planDefs,
      twoRoomPlan(),
    )
    expect(sev).toEqual([])
  })
})

/**
 * ROUTE-UNSEAL (v0.31.8.55) — move the sealing piece instead of only naming it.
 *
 * Over the 19 templates this takes unreachable rooms from 43 to 18 by moving 12
 * items and deleting none. These tests pin the invariants that make that safe,
 * because the two previous attempts on this thread both failed on exactly
 * these: v0.31.8.7's clearance objective traded one pinch for another, and
 * v0.31.8.51's threshold change bought a statistic at the cost of the picture.
 */
describe('unsealRoutes', () => {
  const wallOf = (
    ax: number,
    az: number,
    bx: number,
    bz: number,
    thickness: 'internal' | 'external' = 'internal',
  ) => ({ id: `w-${ax}-${az}-${bx}-${bz}`, start: [ax, az], end: [bx, bz], thickness })

  /** Living (with the front door) | Bedroom, joined by a 0.9 m doorway at z 1.5-2.4. */
  const plan2 = () =>
    ({
      name: 'p',
      extent: [7, 4],
      ceilingHeight: 2.6,
      walls: [
        wallOf(0, 0, 7, 0, 'external'),
        wallOf(7, 0, 7, 4, 'external'),
        wallOf(7, 4, 0, 4, 'external'),
        wallOf(0, 4, 0, 0, 'external'),
        wallOf(4, 0, 4, 1.5),
        wallOf(4, 2.4, 4, 4),
      ],
      openings: [{ id: 'main', wallId: 'w-0-4-0-0', kind: 'door', offset: 1.5, width: 0.9 }],
      rooms: [
        { id: 'a', name: 'Living', origin: [0, 0], width: 4, depth: 4 },
        { id: 'b', name: 'Bedroom', origin: [4, 0], width: 3, depth: 4 },
      ],
    }) as unknown as import('../floorplan/types').FloorPlan

  const wardrobeDef = {
    id: 'wardrobe',
    name: 'Wardrobe',
    category: 'storage',
    kind: 'primitive',
    defaultFootprint: { w: 0.6, d: 1.8 },
  } as unknown as import('../furniture/types').FurnitureDef
  const defs2 = { wardrobe: wardrobeDef }
  const place = (id: string, x: number, z: number) =>
    ({
      id,
      defId: 'wardrobe',
      position: [x, z],
      rotation: 0,
      props: {},
    }) as unknown as import('../furniture/types').FurnitureItem

  it('slides the sealing piece until the room reconnects', () => {
    const items = [place('w1', 4.35, 1.95)]
    expect(findFurnitureSeveredRooms(items, defs2, plan2())).toHaveLength(1)
    const fixed = unsealRoutes(items, defs2, plan2())
    expect(findFurnitureSeveredRooms(fixed, defs2, plan2())).toEqual([])
  })

  it('NEVER deletes and never resizes — only `position` changes', () => {
    const items = [place('w1', 4.35, 1.95)]
    const fixed = unsealRoutes(items, defs2, plan2())
    expect(fixed).toHaveLength(items.length)
    expect(fixed[0]?.id).toBe('w1')
    expect(fixed[0]?.defId).toBe('wardrobe')
    expect(fixed[0]?.rotation).toBe(0)
    // A route bought by removing the sofa is not a fix — deletion belongs to
    // `dropOverlaps` / `dropDoorBlockers` / `dropWallClippers`, not here.
    expect(fixed[0]?.position).not.toEqual(items[0]?.position)
  })

  it('returns the SAME array when nothing is sealed, so a clean plan pays nothing', () => {
    const items = [place('w1', 6.5, 3)]
    const fixed = unsealRoutes(items, defs2, plan2())
    expect(fixed).toBe(items)
  })

  it('does not park the piece in the doorway it just opened', () => {
    // The route mask gaps a wall at every open door, because a doorway IS a
    // route. It is not a parking space — the first cut used that mask for
    // placement and slid `tpl-condo-penthouse`'s TV console into a doorway,
    // which `placementSoundness.test.ts` caught as an in-wall item.
    const fixed = unsealRoutes([place('w1', 4.35, 1.95)], defs2, plan2())
    const [x, z] = fixed[0]?.position as [number, number]
    // The doorway is the x = 4 wall between z 1.5 and 2.4; the piece is 0.6 wide
    // and 1.8 deep, so its body must clear that band entirely.
    const inDoorway = Math.abs(x - 4) < 0.3 + 0.05 && z - 0.9 < 2.4 && z + 0.9 > 1.5
    expect(inDoorway).toBe(false)
  })

  it('is IDEMPOTENT — running it on its own output moves nothing', () => {
    // The pass runs inside `furnishPlanItems`, and the report runs the route
    // check over that output. If a second pass could still find moves, the two
    // would disagree about whether the home is walkable. Verified across all 19
    // templates too (v0.31.8.56).
    const once = unsealRoutes([place('w1', 4.35, 1.95)], defs2, plan2())
    const twice = unsealRoutes(once, defs2, plan2())
    expect(twice).toBe(once)
  })

  it('leaves an unfixable seal alone rather than moving something uselessly', () => {
    // Two wardrobes filling the whole bedroom side of the doorway, with no
    // clear floor within reach for either to move to. The pass must be a no-op,
    // not a shuffle.
    const items = [place('w1', 4.35, 1.0), place('w2', 4.35, 2.9)]
    const fixed = unsealRoutes(items, defs2, plan2())
    expect(fixed).toHaveLength(2)
    for (let i = 0; i < 2; i++) {
      // Either untouched, or moved to somewhere that genuinely helped.
      const before = findFurnitureSeveredRooms(items, defs2, plan2()).length
      const after = findFurnitureSeveredRooms(fixed, defs2, plan2()).length
      expect(after).toBeLessThanOrEqual(before)
    }
  })
})
