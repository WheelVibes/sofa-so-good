import { describe, expect, it } from 'vitest'
import { canPlace } from '../collision/placement'
import { BUILTIN_CATALOG } from './builtinCatalog'
import { buildPresetItems, LAYOUT_PRESETS } from './layoutPresets'

describe('layoutPresets', () => {
  it('has unique preset ids', () => {
    const ids = new Set(LAYOUT_PRESETS.map((p) => p.id))
    expect(ids.size).toBe(LAYOUT_PRESETS.length)
  })

  it('every preset style key references a known catalog id', () => {
    for (const preset of LAYOUT_PRESETS) {
      for (const defId of Object.keys(preset.style)) {
        expect(BUILTIN_CATALOG[defId], `${preset.id}: ${defId}`).toBeDefined()
      }
    }
  })

  it('every preset produces a collision-valid layout', () => {
    for (const preset of LAYOUT_PRESETS) {
      const items = buildPresetItems(preset)
      const placed: typeof items = []
      for (const item of items) {
        const def = BUILTIN_CATALOG[item.defId]
        expect(def).toBeDefined()
        const ok = canPlace(item, def!, { others: placed, defs: BUILTIN_CATALOG, doors: {} })
        if (!ok) {
          throw new Error(
            `Preset ${preset.id}: item ${item.id} (${item.defId}) does not fit at [${item.position[0]}, ${item.position[1]}]`,
          )
        }
        placed.push(item)
      }
    }
  })
})
