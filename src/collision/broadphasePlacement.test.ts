import { describe, expect, it } from 'vitest'
import { BUILTIN_CATALOG } from '../furniture/builtinCatalog'
import type { FurnitureItem } from '../furniture/types'
import { type AabbItem, buildGrid, queryRect } from './broadphase'
import { canPlace, itemFootprint } from './placement'

// Proves the invariant DragController's broadphase relies on (PERF-003): filtering
// canPlace's neighbour set to the moved item's grid neighbourhood gives the SAME
// result as scanning the whole scene — because an item whose footprint AABB does
// not overlap the moved item's AABB cannot have an overlapping OBB.

const defOf = (defId: string) => BUILTIN_CATALOG[defId]

const aabbOf = (it: FurnitureItem): AabbItem => {
  const obb = itemFootprint(it, defOf(it.defId))
  const c = Math.abs(Math.cos(obb.rot))
  const s = Math.abs(Math.sin(obb.rot))
  const hx = c * obb.hx + s * obb.hz
  const hz = s * obb.hx + c * obb.hz
  return {
    id: it.id,
    minX: obb.cx - hx,
    maxX: obb.cx + hx,
    minZ: obb.cz - hz,
    maxZ: obb.cz + hz,
  }
}

// A scattered scene of static items (no walls passed → only item-vs-item matters).
const scene: FurnitureItem[] = [
  { id: 'a', defId: 'sofa-3seat', position: [2, 2], rotation: 0, props: {} },
  { id: 'b', defId: 'bed-double', position: [8, 3], rotation: Math.PI / 2, props: {} },
  { id: 'c', defId: 'coffee-table', position: [2.4, 4.2], rotation: 0, props: {} },
  { id: 'd', defId: 'dining-table-4', position: [12, 9], rotation: 0.4, props: {} },
  { id: 'e', defId: 'armchair', position: [5, 8], rotation: -0.8, props: {} },
  { id: 'f', defId: 'side-table', position: [3.1, 2.1], rotation: 0, props: {} },
]

describe('broadphase canPlace equivalence (PERF-003)', () => {
  const grid = buildGrid(scene.map(aabbOf))

  // The dragged item sweeps a coarse lattice over the scene; at every spot the
  // broadphase-restricted result must equal the full-scan result.
  const moved = (cx: number, cz: number): FurnitureItem => ({
    id: 'drag',
    defId: 'armchair',
    position: [cx, cz],
    rotation: 0,
    props: {},
  })

  it('matches the full-scene scan at every probe position', () => {
    const movedDef = defOf('armchair')
    let overlapsSeen = 0
    let clearSeen = 0
    for (let cx = 0; cx <= 14; cx += 0.5) {
      for (let cz = 0; cz <= 11; cz += 0.5) {
        const item = moved(cx, cz)
        const full = canPlace(item, movedDef, { others: scene, defs: BUILTIN_CATALOG, doors: {} })

        const box = aabbOf(item)
        const nearIds = new Set(queryRect(grid, box))
        const near = scene.filter((it) => nearIds.has(it.id))
        const broad = canPlace(item, movedDef, { others: near, defs: BUILTIN_CATALOG, doors: {} })

        expect(broad).toBe(full)
        if (full) clearSeen++
        else overlapsSeen++
      }
    }
    // Sanity: the sweep exercised BOTH outcomes (so the equality isn't trivial).
    expect(overlapsSeen).toBeGreaterThan(0)
    expect(clearSeen).toBeGreaterThan(0)
  })

  it('a far item that the broadphase prunes genuinely could not collide', () => {
    // Drag the armchair onto the far dining table (id d); the broadphase set must
    // include d and exclude the distant sofa a.
    const item = moved(12, 9)
    const nearIds = new Set(queryRect(grid, aabbOf(item)))
    expect(nearIds.has('d')).toBe(true)
    expect(nearIds.has('a')).toBe(false)
    // And the pruned sofa really is non-colliding from here (full scan agrees).
    expect(
      canPlace(item, defOf('armchair'), { others: scene, defs: BUILTIN_CATALOG, doors: {} }),
    ).toBe(
      canPlace(item, defOf('armchair'), {
        others: scene.filter((it) => nearIds.has(it.id)),
        defs: BUILTIN_CATALOG,
        doors: {},
      }),
    )
  })
})
