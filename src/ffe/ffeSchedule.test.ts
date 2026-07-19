import { describe, expect, it } from 'vitest'
import type { FloorPlan } from '../floorplan/types'
import type { BuiltinGltfDef, FurnitureItem } from '../furniture/types'
import { buildFfeSchedule } from './ffeSchedule'

const plan = {
  id: 'p',
  name: 'P',
  ceilingHeight: 2.8,
  extent: [10, 10],
  walls: [],
  openings: [],
  rooms: [
    { id: 'living', name: 'Living', origin: [0, 0], width: 5, depth: 5 },
    { id: 'bed', name: 'Bedroom', origin: [5, 0], width: 5, depth: 5 },
  ],
} as unknown as FloorPlan

const sofa: BuiltinGltfDef = {
  id: 'sofa',
  name: 'Sofa',
  category: 'seating',
  kind: 'gltf',
  source: 'builtin',
  url: '/s.glb',
  license: 'CC0',
  defaultFootprint: { w: 2, d: 0.9, h: 0.8 },
}
const bed: BuiltinGltfDef = {
  ...sofa,
  id: 'bed',
  name: 'Bed',
  category: 'beds',
  defaultFootprint: { w: 1.5, d: 2, h: 0.5 },
}
const defs = { sofa, bed }

const at = (defId: string, x: number, z: number): FurnitureItem => ({
  id: `${defId}-${x}-${z}`,
  defId,
  position: [x, z],
  rotation: 0,
  props: {},
})

describe('buildFfeSchedule', () => {
  it('aggregates identical items per room with quantity + line totals + real dims', () => {
    const rows = buildFfeSchedule(plan, [at('sofa', 1, 1), at('sofa', 2, 2)], defs)
    expect(rows).toHaveLength(1)
    const r = rows[0]!
    expect(r.room).toBe('Living')
    expect(r.name).toBe('Sofa')
    expect(r.source).toBe('Built-in')
    expect(r.qty).toBe(2)
    expect(r.w).toBeCloseTo(2)
    expect(r.d).toBeCloseTo(0.9)
    expect(r.h).toBeCloseTo(0.8)
    expect(r.total).toBeCloseTo(2 * r.unit)
  })

  it('separates items by room and orders by plan room order', () => {
    const rows = buildFfeSchedule(plan, [at('bed', 6, 1), at('sofa', 1, 1)], defs)
    // Living (plan index 0) before Bedroom (index 1).
    expect(rows.map((r) => r.room)).toEqual(['Living', 'Bedroom'])
  })

  it('puts items outside any room in an Unassigned group, last', () => {
    const rows = buildFfeSchedule(plan, [at('sofa', 1, 1), at('bed', 50, 50)], defs)
    expect(rows[rows.length - 1]!.room).toBe('Unassigned')
  })

  it('skips items with an unresolvable def', () => {
    const ghost = { ...at('sofa', 1, 1), defId: 'missing' }
    expect(buildFfeSchedule(plan, [ghost], defs)).toHaveLength(0)
  })

  it('carries an instance URL/remarks (ITEM-META) onto its row', () => {
    const withMeta: FurnitureItem = {
      ...at('sofa', 1, 1),
      meta: { url: 'https://example.com/sofa', remarks: 'existing — retain' },
    }
    const rows = buildFfeSchedule(plan, [withMeta], defs)
    expect(rows).toHaveLength(1)
    expect(rows[0]!.url).toBe('https://example.com/sofa')
    expect(rows[0]!.remarks).toBe('existing — retain')
  })

  it('aggregates instances with no metadata plainly (url/remarks blank)', () => {
    const rows = buildFfeSchedule(plan, [at('sofa', 1, 1), at('sofa', 2, 2)], defs)
    expect(rows[0]!.url).toBe('')
    expect(rows[0]!.remarks).toBe('')
  })

  it('keeps two same-def instances with DIFFERENT metadata as separate rows (not silently merged)', () => {
    const a: FurnitureItem = { ...at('sofa', 1, 1), meta: { remarks: 'existing — retain' } }
    const b: FurnitureItem = { ...at('sofa', 2, 2), meta: { remarks: 'client to purchase' } }
    const rows = buildFfeSchedule(plan, [a, b], defs)
    expect(rows).toHaveLength(2)
    expect(rows.every((r) => r.qty === 1)).toBe(true)
    expect(rows.map((r) => r.remarks).sort()).toEqual(['client to purchase', 'existing — retain'])
  })

  it('still aggregates two instances that share the SAME metadata', () => {
    const a: FurnitureItem = { ...at('sofa', 1, 1), meta: { remarks: 'existing — retain' } }
    const b: FurnitureItem = { ...at('sofa', 2, 2), meta: { remarks: 'existing — retain' } }
    const rows = buildFfeSchedule(plan, [a, b], defs)
    expect(rows).toHaveLength(1)
    expect(rows[0]!.qty).toBe(2)
  })

  it('carries user-defined custom key/value fields (ITEM-META `meta.custom`) onto the row', () => {
    const withCustom: FurnitureItem = {
      ...at('sofa', 1, 1),
      meta: { custom: [{ key: 'Fabric', value: 'Linen' }] },
    }
    const rows = buildFfeSchedule(plan, [withCustom], defs)
    expect(rows[0]!.custom).toEqual({ Fabric: 'Linen' })
  })

  it('defaults custom to {} when the item carries none', () => {
    const rows = buildFfeSchedule(plan, [at('sofa', 1, 1)], defs)
    expect(rows[0]!.custom).toEqual({})
  })

  it('last-one-wins for a duplicate key within one item', () => {
    const dup: FurnitureItem = {
      ...at('sofa', 1, 1),
      meta: {
        custom: [
          { key: 'Color', value: 'Blue' },
          { key: 'Color', value: 'Green' },
        ],
      },
    }
    const rows = buildFfeSchedule(plan, [dup], defs)
    expect(rows[0]!.custom).toEqual({ Color: 'Green' })
  })

  it('keeps two same-def instances with DIFFERENT custom fields as separate rows', () => {
    const a: FurnitureItem = {
      ...at('sofa', 1, 1),
      meta: { custom: [{ key: 'Fabric', value: 'Linen' }] },
    }
    const b: FurnitureItem = {
      ...at('sofa', 2, 2),
      meta: { custom: [{ key: 'Fabric', value: 'Velvet' }] },
    }
    const rows = buildFfeSchedule(plan, [a, b], defs)
    expect(rows).toHaveLength(2)
    expect(rows.map((r) => r.custom.Fabric).sort()).toEqual(['Linen', 'Velvet'])
  })
})
