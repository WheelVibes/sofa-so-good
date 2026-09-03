import { describe, expect, it } from 'vitest'
import { buildCollisionWalls } from '../collision/wallsFromState'
import { buildDefaultPlan } from '../floorplan/defaultPlan'
import type { FloorPlan } from '../floorplan/types'
import type { FurnitureDef, FurnitureItem } from '../furniture/types'
import { findNarrowGaps } from './walkway'

// A synthetic 1 m × 1 m parametric box so the footprint is fully deterministic
// (no GLB bbox cache involved): itemFootprint reads width/depth from props.
const BOX: FurnitureDef = {
  kind: 'parametric',
  id: 'box' as never,
  name: 'Box',
  category: 'others',
  primitive: 'Bed' as never,
  defaultFootprint: { w: 1, d: 1, h: 1 },
  paramSchema: [],
}

// A mounted variant (e.g. wall art) and a noClip variant (e.g. a rug) — both
// must be excluded from circulation pinch checks.
const MOUNTED: FurnitureDef = { ...BOX, id: 'mounted' as never, mounted: true }
const RUG: FurnitureDef = { ...BOX, id: 'rug' as never, noClip: true }

const defs: Record<string, FurnitureDef> = {
  box: BOX,
  mounted: MOUNTED,
  rug: RUG,
}

let seq = 0
function mk(defId: string, x: number, z: number, levelId?: string): FurnitureItem {
  return {
    id: `i-${defId}-${seq++}`,
    defId: defId as never,
    position: [x, z],
    rotation: 0,
    levelId,
    props: { width: 1, depth: 1 },
  }
}

// A wall-less custom plan so wall-pinch checks contribute nothing — keeps the
// item↔item cases isolated. (Custom plans now DO get per-level wall pinches,
// so an empty wall set is the isolation mechanism, not the custom id.)
const customPlan = { ...buildDefaultPlan(), id: 'custom-test-plan', walls: [], openings: [] }

describe('findNarrowGaps', () => {
  // Two 1 m boxes centred on z=0: A spans x∈[-0.5,0.5]. A second box centred at
  // x=cx spans [cx-0.5, cx+0.5], so the clear edge-to-edge gap is cx - 1.

  it('flags a tight gap (0.5 m, between sofaToCoffee and walkwayMin)', () => {
    const a = mk('box', 0, 0)
    const b = mk('box', 1.5, 0) // gap = 0.5
    const gaps = findNarrowGaps([a, b], defs, customPlan)
    expect(gaps).toHaveLength(1)
    expect(gaps[0]!.severity).toBe('tight')
    expect(gaps[0]!.gap).toBeCloseTo(0.5, 5)
    expect(new Set([gaps[0]!.a, gaps[0]!.b])).toEqual(new Set([a.id, b.id]))
    expect(gaps[0]!.wall).toBe(false)
  })

  it('flags a sub-ideal gap (0.75 m, between walkwayMin and walkwayIdeal)', () => {
    const a = mk('box', 0, 0)
    const b = mk('box', 1.75, 0) // gap = 0.75
    const gaps = findNarrowGaps([a, b], defs, customPlan)
    expect(gaps).toHaveLength(1)
    expect(gaps[0]!.severity).toBe('sub-ideal')
    expect(gaps[0]!.gap).toBeCloseTo(0.75, 5)
  })

  it('does NOT flag a comfortable 1.2 m gap', () => {
    const a = mk('box', 0, 0)
    const b = mk('box', 2.2, 0) // gap = 1.2 (≥ walkwayIdeal)
    expect(findNarrowGaps([a, b], defs, customPlan)).toHaveLength(0)
  })

  it('does NOT flag an intentional close gap (0.3 m ≤ sofaToCoffee)', () => {
    const a = mk('box', 0, 0)
    const b = mk('box', 1.3, 0) // gap = 0.3 — arm's reach, not a walkway
    expect(findNarrowGaps([a, b], defs, customPlan)).toHaveLength(0)
  })

  it('does NOT flag overlapping footprints (that is a separate check)', () => {
    const a = mk('box', 0, 0)
    const b = mk('box', 0.3, 0) // footprints overlap → gap 0
    expect(findNarrowGaps([a, b], defs, customPlan)).toHaveLength(0)
  })

  it('ignores pieces that are far apart (beyond the proximity cutoff)', () => {
    const a = mk('box', 0, 0)
    const b = mk('box', 5, 5) // centres ~7 m apart
    expect(findNarrowGaps([a, b], defs, customPlan)).toHaveLength(0)
  })

  it('skips mounted items (wall art) and noClip items (rugs)', () => {
    const a = mk('box', 0, 0)
    const art = mk('mounted', 1.5, 0) // tight to A, but mounted
    const rug = mk('rug', 0, 1.5) // tight to A, but noClip
    expect(findNarrowGaps([a, art, rug], defs, customPlan)).toHaveLength(0)
  })

  it('reports each unordered pair at most once', () => {
    const a = mk('box', 0, 0)
    const b = mk('box', 1.5, 0) // tight to A on +x (gap 0.5)
    const c = mk('box', -1.5, 0) // tight to A on -x (gap 0.5)
    const gaps = findNarrowGaps([a, b, c], defs, customPlan)
    // a↔b and a↔c are tight; b↔c are ~2 m apart edge-to-edge (≥ ideal), so the
    // result is exactly two pairs, neither duplicated.
    expect(gaps).toHaveLength(2)
    const keys = gaps.map((g) => [g.a, g.b].sort().join('|'))
    expect(new Set(keys).size).toBe(2)
  })

  it('flags an item pinched against a wall on the default flat', () => {
    // On the default plan the wall pass runs. Position a box a 0.7 m clear gap
    // (in the sub-ideal band) off the midpoint of the longest wall, on its
    // interior side, so a wall pinch is guaranteed.
    const plan = buildDefaultPlan()
    const walls = buildCollisionWalls({})
    const longest = walls.reduce((m, w) =>
      Math.hypot(w.bx - w.ax, w.bz - w.az) > Math.hypot(m.bx - m.ax, m.bz - m.az) ? w : m,
    )
    const mx = (longest.ax + longest.bx) / 2
    const mz = (longest.az + longest.bz) / 2
    const len = Math.hypot(longest.bx - longest.ax, longest.bz - longest.az)
    // Unit normal to the wall.
    const nx = -(longest.bz - longest.az) / len
    const nz = (longest.bx - longest.ax) / len
    // The box (half-extent 0.5) centre must sit thickness/2 + 0.5 + gap off the
    // centerline. Use a 0.7 m clear gap (sub-ideal). Try both normal directions
    // and keep whichever lands inside the flat (flagged).
    const off = longest.thickness / 2 + 0.5 + 0.7
    for (const sgn of [1, -1]) {
      const box = mk('box', mx + sgn * nx * off, mz + sgn * nz * off)
      const res = findNarrowGaps([box], defs, plan).filter((g) => g.wall)
      if (res.length > 0) {
        expect(res.every((g) => g.b.startsWith('wall:'))).toBe(true)
        expect(res.every((g) => g.gap > 0 && g.gap < 0.9)).toBe(true)
        return
      }
    }
    throw new Error('expected a wall pinch to be flagged')
  })

  it('returns nothing for an empty design', () => {
    expect(findNarrowGaps([], defs, customPlan)).toHaveLength(0)
  })

  describe('multi-storey level gating (F13/ML3)', () => {
    it('does NOT pair items on different storeys; same storey still pairs', () => {
      const ground = mk('box', 0, 0)
      const upper = mk('box', 1.5, 0, 'lvl-2') // would be a 0.5 m tight gap
      expect(findNarrowGaps([ground, upper], defs, customPlan)).toHaveLength(0)
      // Both on the same upper storey → the pinch is real again.
      const upperA = mk('box', 0, 0, 'lvl-2')
      const gaps = findNarrowGaps([upperA, upper], defs, customPlan)
      expect(gaps).toHaveLength(1)
      expect(gaps[0]!.severity).toBe('tight')
    })

    it('does NOT pinch an upper-storey item against the ground-floor walls', () => {
      // Same geometry as the default-flat wall-pinch test above, but the box
      // sits on an upper storey — the flat's walls are the ground floor's, so
      // no wall pinch may be reported for either candidate position.
      const plan = buildDefaultPlan()
      const walls = buildCollisionWalls({})
      const longest = walls.reduce((m, w) =>
        Math.hypot(w.bx - w.ax, w.bz - w.az) > Math.hypot(m.bx - m.ax, m.bz - m.az) ? w : m,
      )
      const mx = (longest.ax + longest.bx) / 2
      const mz = (longest.az + longest.bz) / 2
      const len = Math.hypot(longest.bx - longest.ax, longest.bz - longest.az)
      const nx = -(longest.bz - longest.az) / len
      const nz = (longest.bx - longest.ax) / len
      const off = longest.thickness / 2 + 0.5 + 0.7
      for (const sgn of [1, -1]) {
        const box = mk('box', mx + sgn * nx * off, mz + sgn * nz * off, 'lvl-2')
        expect(findNarrowGaps([box], defs, plan).filter((g) => g.wall)).toHaveLength(0)
      }
    })
  })
})

describe('custom-plan + per-level wall pinches (F13 remnant)', () => {
  const pinchPlan: FloorPlan = {
    id: 'custom-pinch',
    name: 'Pinch',
    ceilingHeight: 2.6,
    extent: [6, 5],
    walls: [
      { id: 'w1', start: [0.1, 0.1], end: [5.9, 0.1], thickness: 'external' },
      { id: 'w2', start: [5.9, 0.1], end: [5.9, 4.9], thickness: 'external' },
      { id: 'w3', start: [5.9, 4.9], end: [0.1, 4.9], thickness: 'external' },
      { id: 'w4', start: [0.1, 4.9], end: [0.1, 0.1], thickness: 'external' },
    ],
    openings: [],
    rooms: [{ id: 'r', name: 'Room', origin: [0.2, 0.2], width: 5.6, depth: 4.6 }],
    upperLevels: [
      {
        id: 'lvl-2',
        name: 'Upper',
        elevation: 2.9,
        // Narrower storey: its east wall sits at x=2.9 (vs 5.9 below).
        walls: [
          { id: 'uw1', start: [0.1, 0.1], end: [2.9, 0.1], thickness: 'external' },
          { id: 'uw2', start: [2.9, 0.1], end: [2.9, 4.9], thickness: 'external' },
          { id: 'uw3', start: [2.9, 4.9], end: [0.1, 4.9], thickness: 'external' },
          { id: 'uw4', start: [0.1, 4.9], end: [0.1, 0.1], thickness: 'external' },
        ],
        openings: [],
        rooms: [{ id: 'ur', name: 'Up', origin: [0.2, 0.2], width: 2.6, depth: 4.6 }],
      },
    ],
  }

  it('flags wall pinches on a custom plan (previously skipped entirely)', () => {
    // 1×1 box at (3, 1.2): bottom edge z=0.7, north wall inner face z=0.2 →
    // 0.5 m gap = a tight pinch; every other wall is comfortably far.
    const gaps = findNarrowGaps([mk('box', 3, 1.2)], defs, pinchPlan)
    const wallGaps = gaps.filter((g) => g.wall)
    expect(wallGaps).toHaveLength(1)
    // ~0.5–0.6 m depending on the wall-thickness convention — a real pinch
    // either way (the exact band is the classifier's concern, not this test's).
    expect(wallGaps[0]!.gap).toBeGreaterThan(0.4)
    expect(wallGaps[0]!.gap).toBeLessThan(0.9)
    expect(wallGaps[0]!.severity).toBeTruthy()
  })

  it("tests an upper-storey item against its OWN storey's walls", () => {
    // Box at (4.7, 2.45): on the GROUND its east wall (x=5.9) is ~0.6–0.7 m
    // away → pinch. On the UPPER storey the east wall sits at x=2.9 — over a
    // metre away on the far side — so the same spot has NO pinch up there.
    expect(findNarrowGaps([mk('box', 4.7, 2.45)], defs, pinchPlan).some((g) => g.wall)).toBe(true)
    expect(
      findNarrowGaps([mk('box', 4.7, 2.45, 'lvl-2')], defs, pinchPlan).some((g) => g.wall),
    ).toBe(false)
  })
})

/**
 * A wall between two pieces means there is no route between them to pinch
 * (v0.31.8.6). Measured over a 62-layout corpus: 22 of 59 reported pinches
 * (37%) had a wall between the two items, 18 of those in different rooms, and
 * every one of them was costing the design score real points for a gap nobody
 * can walk through.
 */
describe('findNarrowGaps — a wall between the pair', () => {
  /** Two boxes 0.45 m apart across x=0, optionally split by a wall on that line. */
  const fixture = (opts: { wall: boolean; door: boolean }): FloorPlan => {
    const walls: FloorPlan['walls'] = opts.wall
      ? [{ id: 'mid', start: [0, -3], end: [0, 3], thickness: 'internal' }]
      : []
    const openings: FloorPlan['openings'] = opts.door
      ? [{ id: 'd1', kind: 'door', wallId: 'mid', offset: 2.2, width: 0.9, sill: 0, head: 2.1 }]
      : []
    return { ...buildDefaultPlan(), id: 'custom-wall-between', walls, openings }
  }
  // Edge-to-edge gap 0.45 m, centred on the wall line at x=0, at z=0 — level
  // with the doorway when one exists (offset 2.2 of a 6 m wall spans z∈[-0.8,0.1]).
  const pair = () => {
    seq = 0
    return [mk('box', -0.725, 0), mk('box', 0.725, 0)]
  }
  const itemPinches = (plan: FloorPlan) => findNarrowGaps(pair(), defs, plan).filter((g) => !g.wall)

  it('reports the pinch when nothing is between them (control)', () => {
    const found = itemPinches(fixture({ wall: false, door: false }))
    expect(found).toHaveLength(1)
    expect(found[0]!.gap).toBeCloseTo(0.45, 3)
  })

  it('does NOT report it through a solid wall', () => {
    expect(itemPinches(fixture({ wall: true, door: false }))).toHaveLength(0)
  })

  it('DOES report it across a doorway — a doorway is a route', () => {
    // This is the arm that makes the door handling falsifiable rather than
    // assumed. The corpus cannot distinguish the two door states (0 pinches are
    // blocked only by a doorway), so without this fixture the choice to treat
    // doors as open would be untested. Same geometry as the arm above, one
    // opening added, and the two MUST disagree.
    const withDoor = itemPinches(fixture({ wall: true, door: true }))
    const withoutDoor = itemPinches(fixture({ wall: true, door: false }))
    expect(withDoor).toHaveLength(1)
    expect(withoutDoor).toHaveLength(0)
  })
})
