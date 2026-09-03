import { describe, expect, it } from 'vitest'
import { BUILTIN_CATALOG } from '../furniture/builtinCatalog'
import type { FurnitureDef, FurnitureItem, ParamProps } from '../furniture/types'
import {
  buildFloorLoadingReport,
  CONCRETE_RAISE_LIMIT_M,
  estimateItemWeightKg,
  SLAB_LOAD_LIMIT,
} from './floorLoading'

function def(id: string, w: number, d: number, name = id): FurnitureDef {
  return { id, name, defaultFootprint: { w, d, h: 1 } } as unknown as FurnitureDef
}
function item(defId: string, props: ParamProps = {}): FurnitureItem {
  return {
    id: `it-${defId}`,
    defId,
    position: [0, 0],
    rotation: 0,
    props,
  } as unknown as FurnitureItem
}

describe('estimateItemWeightKg', () => {
  it('assigns a static weight to heavy suspects', () => {
    expect(estimateItemWeightKg('aquarium', {})).toBeGreaterThan(0)
    expect(estimateItemWeightKg('bathtub', {})).toBeGreaterThan(0)
    expect(estimateItemWeightKg('piano', {})).toBeGreaterThan(0)
  })

  it('weights a table only when it carries a stone/masonry material', () => {
    expect(estimateItemWeightKg('dining-table', {})).toBe(0)
    expect(estimateItemWeightKg('dining-table', { top: 'marble' })).toBeGreaterThan(0)
    expect(estimateItemWeightKg('side-table', { material: 'granite' })).toBeGreaterThan(0)
  })

  it('weights any bookcase (loaded) and ignores ordinary items', () => {
    expect(estimateItemWeightKg('bookshelf', {})).toBeGreaterThan(0)
    expect(estimateItemWeightKg('dining-chair', {})).toBe(0)
    expect(estimateItemWeightKg('sofa-3', {})).toBe(0)
  })
})

describe('buildFloorLoadingReport — density', () => {
  const catalog: Record<string, FurnitureDef> = {
    aquarium: def('aquarium', 0.6, 0.4, 'Aquarium'),
    'dining-chair': def('dining-chair', 0.5, 0.5, 'Dining chair'),
    'dining-table': def('dining-table', 1.6, 0.9, 'Dining table'),
    'side-table': def('side-table', 0.5, 0.5, 'Side table'),
  }

  it('flags a heavy item whose density exceeds the slab guideline', () => {
    const r = buildFloorLoadingReport([item('aquarium')], catalog)
    expect(r.exceeding).toHaveLength(1)
    expect(r.exceeding[0].name).toBe('Aquarium')
    expect(r.exceeding[0].densityKgM2).toBeGreaterThan(SLAB_LOAD_LIMIT)
    expect(r.hasConcern).toBe(true)
  })

  it('ignores ordinary (non-heavy) items entirely', () => {
    const r = buildFloorLoadingReport([item('dining-chair')], catalog)
    expect(r.exceeding).toHaveLength(0)
    expect(r.watch).toHaveLength(0)
    expect(r.hasConcern).toBe(false)
  })

  it('classifies a heavy-but-spread item as watch, not exceeding', () => {
    // Marble on a large dining table: 160 kg / (1.6*0.9=1.44 m²) ≈ 111 kg/m² < 150.
    const r = buildFloorLoadingReport([item('dining-table', { top: 'marble' })], catalog)
    expect(r.exceeding).toHaveLength(0)
    expect(r.watch).toHaveLength(1)
    expect(r.watch[0].densityKgM2).toBeLessThan(SLAB_LOAD_LIMIT)
  })

  it('flags a marble top on a small footprint as exceeding', () => {
    // 160 kg / (0.5*0.5=0.25 m²) = 640 kg/m².
    const r = buildFloorLoadingReport([item('side-table', { material: 'granite' })], catalog)
    expect(r.exceeding).toHaveLength(1)
    expect(r.exceeding[0].densityKgM2).toBe(640)
  })

  it('scales the footprint by the item scale props', () => {
    const spread = buildFloorLoadingReport([item('aquarium', { scale: 3 })], catalog)
    const tight = buildFloorLoadingReport([item('aquarium')], catalog)
    expect(spread.exceeding[0]?.densityKgM2 ?? spread.watch[0].densityKgM2).toBeLessThan(
      tight.exceeding[0].densityKgM2,
    )
  })
})

describe('buildFloorLoadingReport — raised platforms', () => {
  const catalog: Record<string, FurnitureDef> = {
    platform: def('platform', 2, 2, 'Raised platform'),
  }

  it('flags a concrete raise over 50 mm', () => {
    const r = buildFloorLoadingReport([item('platform', { height: 0.08 })], catalog)
    expect(r.platforms).toHaveLength(1)
    expect(r.platforms[0].raiseMm).toBe(80)
    expect(r.hasConcern).toBe(true)
  })

  it('does not flag a raise at or under the 50 mm threshold', () => {
    const r = buildFloorLoadingReport(
      [item('platform', { height: CONCRETE_RAISE_LIMIT_M })],
      catalog,
    )
    expect(r.platforms).toHaveLength(0)
  })
})

/**
 * **Selector audit (v0.31.8.21).** This is a STRUCTURAL check — it estimates
 * whether furniture exceeds the ~150 kg/m² slab guideline — so getting the
 * subject wrong mis-states load. Three faults found by measuring what the three
 * id regexes actually match against the real catalogue:
 *
 *  - `BOOKCASE_RE` matched `wall-shelf` and `cat-wall-shelf`, both
 *    `mounted: true`, and the loop's only guard was `if (!def) continue` — so a
 *    pair of WALL shelves added 400 kg of FLOOR loading. Live and wrong.
 *  - `TABLE_RE` matches `table-lamp`, `desk-plant`, `tabletop-decor` and
 *    `changing-table`. The first three are latent (no stone-capable finish
 *    option, so `hasStoneMaterial` cannot be satisfied) — verified rather than
 *    assumed — but `changing-table` declares `finish=concrete` and WAS being
 *    estimated at 160 kg.
 *  - `PLATFORM_RE` matches nothing at all.
 */
describe('floor loading — subject selection', () => {
  const at = (defId: string, props: Record<string, unknown> = {}) => ({
    id: `i-${defId}`,
    defId,
    position: [2, 2] as [number, number],
    rotation: 0,
    props,
  })

  it('does NOT count the catalogue wall shelves as floor load', () => {
    const rep = buildFloorLoadingReport(
      [at('wall-shelf'), at('cat-wall-shelf')] as never,
      BUILTIN_CATALOG,
    )
    const named = [...rep.exceeding, ...rep.watch].map((r) => r.defId)
    expect(named).not.toContain('wall-shelf')
    expect(named).not.toContain('cat-wall-shelf')
  })

  it('does NOT count a MOUNTED shelf in a load-bearing category', () => {
    // The arm that isolates the `mounted` guard. The two catalogue wall shelves
    // are `decor` and `pets`, so `CATEGORY_EXCLUDE` already stops them and the
    // test above passes with the guard removed — it was inert. This def is
    // `storage` (not excluded), matches BOOKCASE_RE, and is mounted, so only the
    // guard can reject it.
    const mountedShelf = {
      id: 'floating-bookshelf',
      name: 'Floating bookshelf',
      category: 'storage',
      mounted: true,
      defaultFootprint: { w: 0.9, d: 0.3, h: 0.3 },
    } as unknown as FurnitureDef
    const rep = buildFloorLoadingReport([at('floating-bookshelf')] as never, {
      ...BUILTIN_CATALOG,
      'floating-bookshelf': mountedShelf,
    })
    expect([...rep.exceeding, ...rep.watch].map((r) => r.defId)).not.toContain('floating-bookshelf')
  })

  it('still counts a floor-standing bookshelf', () => {
    // The mounted guard must not silence the real case — a packed full-height
    // bookcase is one of the heaviest things in a flat.
    const rep = buildFloorLoadingReport([at('bookshelf')] as never, BUILTIN_CATALOG)
    expect([...rep.exceeding, ...rep.watch].map((r) => r.defId)).toContain('bookshelf')
  })

  it('does NOT treat a concrete-finish changing table as a stone-topped table', () => {
    expect(estimateItemWeightKg('changing-table', { finish: 'concrete' }, 'kids')).toBe(0)
  })

  it('still treats a stone-topped dining table as heavy', () => {
    expect(estimateItemWeightKg('dining-table', { top: 'marble' }, 'tables')).toBeGreaterThan(0)
  })

  it('records that PLATFORM_RE matches nothing in the catalogue today', () => {
    // Pins the measurement so the branch cannot start firing unnoticed: the day
    // a platform-bed or tatami dais def is added, this fails and whoever adds it
    // sees that a raise check now applies to it.
    const PLATFORM_RE = /platform|dais|riser|podium|tatami/
    expect(Object.keys(BUILTIN_CATALOG).filter((id) => PLATFORM_RE.test(id))).toEqual([])
  })
})
