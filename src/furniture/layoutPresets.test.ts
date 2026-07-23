import { describe, expect, it } from 'vitest'
import { canPlace } from '../collision/placement'
import { buildDefaultPlan } from '../floorplan/defaultPlan'
import { findNarrowGaps } from '../layout/walkway'
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

  // 15 s: the all-presets loop brushes the default 5 s under full-suite/parallel
  // load (passes in ~2 s isolated) — headroom, same as placementSoundness.
  it('every preset produces a collision-valid layout', { timeout: 15000 }, () => {
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

describe('preset circulation quality (TODO follow-up: bedrooms auto-spaced)', () => {
  it('no preset has a TIGHT pinch between two LARGE circulation pieces', () => {
    // The walkway checker deliberately also flags intentional adjacencies
    // (ottoman-by-chair, lamp-by-shelf, plant-by-bed, basin-by-WC) as advisory
    // hints for the user. The regression guard for shipped presets is
    // stricter-scoped: pieces people walk AROUND (≥0.5 m² footprint both
    // sides) must never pinch below 0.5 m — genuinely impassable; 0.5–0.6
    // stays an acceptable snug-HDB adjacency the in-app checker still hints.
    const area = (defId: string) => {
      const fp = BUILTIN_CATALOG[defId]?.defaultFootprint
      return fp ? fp.w * fp.d : 0
    }
    const offenders: string[] = []
    for (const preset of LAYOUT_PRESETS) {
      const items = buildPresetItems(preset)
      const byId = new Map(items.map((i) => [i.id, i] as const))
      const gaps = findNarrowGaps(items, BUILTIN_CATALOG, buildDefaultPlan())
      for (const g of gaps) {
        if (g.wall || g.severity !== 'tight' || g.gap >= 0.5) continue
        const a = byId.get(g.a)
        const b = byId.get(g.b)
        if (!a || !b) continue
        if (area(a.defId) < 0.5 || area(b.defId) < 0.5) continue
        // Coffee tables pair with seating at arm's reach by design
        // (CLEARANCE.sofaToCoffee) — the canonical intentional adjacency.
        if (a.defId === 'coffee-table' || b.defId === 'coffee-table') continue
        offenders.push(`${preset.id}: ${g.a} ↔ ${g.b} gap ${g.gap.toFixed(2)} m`)
      }
    }
    expect(offenders, offenders.join('\n')).toEqual([])
  })
})
