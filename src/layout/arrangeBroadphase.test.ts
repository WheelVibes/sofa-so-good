import { describe, expect, it } from 'vitest'
import { broadphaseNeighbours, canPlace } from '../collision/placement'
import { BUILTIN_CATALOG } from '../furniture/builtinCatalog'
import type { FurnitureDef, FurnitureItem } from '../furniture/types'

/**
 * ARRANGE-GRID equivalence proof. The auto-arrange tidy pass restricts each
 * candidate placement's item-vs-item scan to its footprint neighbourhood via
 * `broadphaseNeighbours` (PERF-003 pattern). This asserts that doing so yields
 * the IDENTICAL `canPlace` boolean as scanning the full `others` list — the same
 * way `collision/broadphasePlacement.test.ts` proved the drag-path broadphase.
 */

const defs = BUILTIN_CATALOG
const ctx = (others: FurnitureItem[]) => ({ others, defs, doors: {}, walls: [] as never[] })

// A dense-ish scene of static obstacles (no walls → only item-vs-item matters).
const scene: FurnitureItem[] = [
  { id: 'a', defId: 'sofa-3seat', position: [2, 2], rotation: 0, props: {} },
  { id: 'b', defId: 'bed-double', position: [8, 3], rotation: Math.PI / 2, props: {} },
  { id: 'c', defId: 'coffee-table', position: [2.4, 4.2], rotation: 0, props: {} },
  { id: 'd', defId: 'dining-table-4', position: [12, 9], rotation: 0.4, props: {} },
  { id: 'e', defId: 'armchair', position: [5, 8], rotation: -0.8, props: {} },
  { id: 'f', defId: 'side-table', position: [3.1, 2.1], rotation: 0, props: {} },
  { id: 'g', defId: 'nightstand', position: [8, 5], rotation: 0, props: {} },
]

describe('broadphaseNeighbours ≡ full canPlace scan (ARRANGE-GRID)', () => {
  const movedDef: FurnitureDef = defs['armchair']
  const moved = (cx: number, cz: number, rot = 0): FurnitureItem => ({
    id: 'cand',
    defId: 'armchair',
    position: [cx, cz],
    rotation: rot,
    props: {},
  })

  it('matches the full scan at every probe position + rotation', () => {
    let overlapsSeen = 0
    let clearSeen = 0
    for (let cx = 0; cx <= 14; cx += 0.5) {
      for (let cz = 0; cz <= 11; cz += 0.5) {
        for (const rot of [0, Math.PI / 4, Math.PI / 2]) {
          const cand = moved(cx, cz, rot)
          const full = canPlace(cand, movedDef, ctx(scene))
          const near = broadphaseNeighbours(cand, movedDef, scene, defs)
          const broad = canPlace(cand, movedDef, ctx(near))
          expect(broad).toBe(full)
          if (full) clearSeen++
          else overlapsSeen++
        }
      }
    }
    // Sweep must exercise BOTH outcomes so the equality isn't trivially true.
    expect(overlapsSeen).toBeGreaterThan(0)
    expect(clearSeen).toBeGreaterThan(0)
  })

  it('a pruned far item genuinely could not collide (full scan agrees)', () => {
    const cand = moved(12, 9) // onto the far dining table d
    const near = broadphaseNeighbours(cand, movedDef, scene, defs)
    const nearIds = new Set(near.map((it) => it.id))
    expect(nearIds.has('d')).toBe(true) // the table under it is kept
    expect(nearIds.has('a')).toBe(false) // the distant sofa is pruned
    expect(canPlace(cand, movedDef, ctx(scene))).toBe(canPlace(cand, movedDef, ctx(near)))
  })

  describe('edge cases', () => {
    const cand = moved(2, 2)

    it('empty others → empty neighbour set, same result', () => {
      expect(broadphaseNeighbours(cand, movedDef, [], defs)).toEqual([])
      expect(canPlace(cand, movedDef, ctx([]))).toBe(canPlace(cand, movedDef, ctx([])))
    })

    it('single other (overlapping) is kept', () => {
      const others = [scene[0]] // sofa at [2,2] — candidate overlaps it
      const near = broadphaseNeighbours(cand, movedDef, others, defs)
      expect(near).toHaveLength(1)
      expect(canPlace(cand, movedDef, ctx(near))).toBe(canPlace(cand, movedDef, ctx(others)))
      expect(canPlace(cand, movedDef, ctx(near))).toBe(false)
    })

    it('single other (far away) is pruned, result unchanged (clear)', () => {
      const others = [scene[3]] // dining table far at [12,9]
      const near = broadphaseNeighbours(cand, movedDef, others, defs)
      expect(near).toHaveLength(0)
      expect(canPlace(cand, movedDef, ctx(near))).toBe(canPlace(cand, movedDef, ctx(others)))
      expect(canPlace(cand, movedDef, ctx(near))).toBe(true)
    })

    it('defless others are dropped (they never collide)', () => {
      const ghost: FurnitureItem = {
        id: 'x',
        defId: 'NOPE',
        position: [2, 2],
        rotation: 0,
        props: {},
      }
      const near = broadphaseNeighbours(cand, movedDef, [ghost], defs)
      expect(near).toEqual([])
      expect(canPlace(cand, movedDef, ctx([ghost]))).toBe(canPlace(cand, movedDef, ctx(near)))
    })

    it('dense cluster: every candidate over a tight pile matches full scan', () => {
      // A tight pile of overlapping pieces around the origin.
      const pile: FurnitureItem[] = Array.from({ length: 8 }, (_, i) => ({
        id: `p${i}`,
        defId: 'side-table',
        position: [3 + (i % 4) * 0.3, 3 + Math.floor(i / 4) * 0.3],
        rotation: 0,
        props: {},
      }))
      for (let cx = 2; cx <= 5; cx += 0.25) {
        for (let cz = 2; cz <= 5; cz += 0.25) {
          const c = moved(cx, cz)
          const near = broadphaseNeighbours(c, movedDef, pile, defs)
          expect(canPlace(c, movedDef, ctx(near))).toBe(canPlace(c, movedDef, ctx(pile)))
        }
      }
    })
  })
})
