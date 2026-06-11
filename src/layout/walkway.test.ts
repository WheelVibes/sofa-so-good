import { describe, expect, it } from 'vitest'
import { buildCollisionWalls } from '../collision/wallsFromState'
import { buildDefaultPlan } from '../floorplan/defaultPlan'
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

// A custom (non-default) plan so wall checks are skipped — keeps the item↔item
// cases isolated from the default flat's wall geometry.
const customPlan = { ...buildDefaultPlan(), id: 'custom-test-plan' }

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
