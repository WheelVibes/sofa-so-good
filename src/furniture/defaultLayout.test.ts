import { describe, expect, it } from 'vitest'
import { canPlace } from '../collision/placement'
import { BUILTIN_CATALOG } from './builtinCatalog'
import { defaultLayout } from './defaultLayout'

describe('defaultLayout', () => {
  it('every entry references a known catalog id', () => {
    const items = defaultLayout()
    for (const it of items) {
      expect(BUILTIN_CATALOG[it.defId]).toBeDefined()
    }
  })

  it('every entry has a unique id', () => {
    const items = defaultLayout()
    const ids = new Set(items.map((i) => i.id))
    expect(ids.size).toBe(items.length)
  })

  it('every entry passes canPlace against the empty apartment', () => {
    const items = defaultLayout()
    const placed: typeof items = []
    for (const item of items) {
      const def = BUILTIN_CATALOG[item.defId]
      expect(def).toBeDefined()
      const ok = canPlace(item, def!, {
        others: placed,
        defs: BUILTIN_CATALOG,
        doors: {},
      })
      if (!ok) {
        // Surface which item failed so iteration on positions is fast.
        throw new Error(
          `Default item ${item.id} (${item.defId}) does not fit at [${item.position[0]}, ${item.position[1]}] rot=${item.rotation}`,
        )
      }
      placed.push(item)
    }
  })
})
