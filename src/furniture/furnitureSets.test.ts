import { describe, expect, it } from 'vitest'
import { canPlace } from '../collision/placement'
import { BUILTIN_CATALOG } from './builtinCatalog'
import { FURNITURE_SETS } from './furnitureSets'
import type { FurnitureItem } from './types'
import { defaultParamProps } from './types'

describe('furniture sets', () => {
  it('have unique ids and at least two items each', () => {
    const ids = new Set(FURNITURE_SETS.map((s) => s.id))
    expect(ids.size).toBe(FURNITURE_SETS.length)
    for (const s of FURNITURE_SETS) expect(s.items.length).toBeGreaterThanOrEqual(2)
  })

  it('every set item references a known catalog def', () => {
    for (const s of FURNITURE_SETS) {
      for (const it of s.items) {
        expect(BUILTIN_CATALOG[it.defId], `${s.id}: ${it.defId}`).toBeDefined()
      }
    }
  })

  it('lay out without solid items overlapping (rugs/mounted/different-height exempt)', () => {
    // Drop each set at the origin and check every piece against the ones before
    // it — ungrouped, so canPlace tests real geometry (it already exempts noClip
    // rugs and non-overlapping vertical spans). Catches a mis-placed offset.
    for (const set of FURNITURE_SETS) {
      const placed: FurnitureItem[] = []
      for (let i = 0; i < set.items.length; i++) {
        const e = set.items[i]
        const def = BUILTIN_CATALOG[e.defId]
        if (!def) continue
        const props = def.kind === 'parametric' ? { ...defaultParamProps(def), ...e.props } : {}
        const item: FurnitureItem = {
          id: `${set.id}-${i}`,
          defId: e.defId,
          position: [e.dx, e.dz],
          rotation: e.rotation,
          props,
        }
        // walls: [] isolates the check to item-vs-item (the set is dropped into
        // whatever room the user picks, so wall fit isn't the set's concern).
        const ok = canPlace(item, def, {
          others: placed,
          defs: BUILTIN_CATALOG,
          doors: {},
          walls: [],
        })
        expect(ok, `${set.id}: ${e.defId} (#${i}) overlaps an earlier piece`).toBe(true)
        placed.push(item)
      }
    }
  })
})
