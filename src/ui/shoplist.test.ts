import { describe, expect, it } from 'vitest'
import type { FloorPlan } from '../floorplan/types'
import { ITEM_PRICE } from '../furniture/furniturePrices'
import type { BuiltinGltfDef, FurnitureItem, IkeaGltfDef } from '../furniture/types'
import {
  buildShopList,
  buildShopListHtml,
  GENERIC_RETAILER,
  type ShopList,
  sanitizeUrl,
} from './shoplist'

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
  id: 'sofa-3seat',
  name: 'Sofa',
  category: 'seating',
  kind: 'gltf',
  source: 'builtin',
  url: '/s.glb',
  license: 'CC0',
  defaultFootprint: { w: 2, d: 0.9, h: 0.8 },
}

const billy: IkeaGltfDef = {
  id: 'ikea-billy',
  name: 'BILLY',
  category: 'storage',
  kind: 'gltf',
  source: 'ikea',
  groupKey: 'billy',
  activeVariant: 'white',
  uploadedAt: '2026-01-01',
  license: 'IKEA',
  attribution: 'IKEA',
  defaultFootprint: { w: 0.8, d: 0.28, h: 2.02 },
  variants: [
    {
      finish: 'white',
      label: 'White',
      articleNumber: '002.638.50',
      url: 'https://www.ikea.com/sg/en/p/billy-00263850/',
      assetId: null,
      price: 89,
      glbMaterials: [],
    },
    {
      finish: 'oak',
      label: 'Oak',
      articleNumber: '404.773.32',
      url: 'javascript:alert(1)', // hostile URL — must never become a link
      assetId: null,
      price: 129,
      glbMaterials: [],
    },
  ],
}

const defs = { 'sofa-3seat': sofa, 'ikea-billy': billy }

const at = (defId: string, x: number, z: number, props: FurnitureItem['props'] = {}) =>
  ({
    id: `${defId}-${x}-${z}-${JSON.stringify(props)}`,
    defId,
    position: [x, z],
    rotation: 0,
    props,
  }) as FurnitureItem

describe('buildShopList', () => {
  it('groups identical defIds (per room) with quantity + line and group totals', () => {
    const list = buildShopList(plan, [at('sofa-3seat', 1, 1), at('sofa-3seat', 2, 2)], defs)
    expect(list.groups).toHaveLength(1)
    const g = list.groups[0]!
    expect(g.retailer).toBe(GENERIC_RETAILER)
    expect(g.estimated).toBe(true)
    expect(g.lines).toHaveLength(1)
    const line = g.lines[0]!
    expect(line.qty).toBe(2)
    expect(line.room).toBe('Living')
    expect(line.unit).toBe(ITEM_PRICE['sofa-3seat'])
    expect(line.total).toBe(2 * line.unit)
    expect(g.total).toBe(line.total)
    expect(list.grandTotal).toBe(line.total)
    expect(list.itemCount).toBe(2)
  })

  it('splits the same def across rooms into separate lines, in plan room order', () => {
    const list = buildShopList(plan, [at('sofa-3seat', 6, 1), at('sofa-3seat', 1, 1)], defs)
    expect(list.groups[0]!.lines.map((l) => l.room)).toEqual(['Living', 'Bedroom'])
  })

  it('buckets IKEA items under IKEA (variant price + SKU), generic last', () => {
    const list = buildShopList(
      plan,
      [at('sofa-3seat', 1, 1), at('ikea-billy', 2, 2, { variant: 'oak' })],
      defs,
    )
    expect(list.groups.map((g) => g.retailer)).toEqual(['IKEA', GENERIC_RETAILER])
    const ikea = list.groups[0]!
    expect(ikea.estimated).toBe(false)
    expect(ikea.lines[0]!.name).toBe('BILLY (oak)')
    expect(ikea.lines[0]!.unit).toBe(129) // per-variant price, not the white one
    expect(ikea.lines[0]!.sku).toBe('404.773.32')
    expect(list.grandTotal).toBe(ikea.total + list.groups[1]!.total)
  })

  it('keeps different variants of one def as separate lines', () => {
    const list = buildShopList(
      plan,
      [at('ikea-billy', 1, 1, { variant: 'white' }), at('ikea-billy', 2, 2, { variant: 'oak' })],
      defs,
    )
    expect(list.groups[0]!.lines).toHaveLength(2)
  })

  it('attaches product links only when includeRetailerLinks is set, and only valid http(s) URLs', () => {
    const items = [
      at('ikea-billy', 1, 1, { variant: 'white' }),
      at('ikea-billy', 2, 2, { variant: 'oak' }),
      at('sofa-3seat', 3, 3),
    ]
    const noLinks = buildShopList(plan, items, defs)
    for (const g of noLinks.groups) for (const l of g.lines) expect(l.url).toBeUndefined()

    const linked = buildShopList(plan, items, defs, { includeRetailerLinks: true })
    const ikeaLines = linked.groups.find((g) => g.retailer === 'IKEA')!.lines
    const white = ikeaLines.find((l) => l.name.includes('white'))!
    const oak = ikeaLines.find((l) => l.name.includes('oak'))!
    expect(white.url).toBe('https://www.ikea.com/sg/en/p/billy-00263850/')
    expect(oak.url).toBeUndefined() // javascript: URL rejected
    const generic = linked.groups.find((g) => g.retailer === GENERIC_RETAILER)!
    expect(generic.lines[0]!.url).toBeUndefined() // no real URL on a builtin def
  })

  it('marks an out-of-room item Unassigned and orders it last; skips unknown defs', () => {
    const list = buildShopList(
      plan,
      [
        at('sofa-3seat', 50, 50),
        at('sofa-3seat', 1, 1),
        { ...at('sofa-3seat', 1, 1), defId: 'nope' },
      ],
      defs,
    )
    expect(list.groups[0]!.lines.map((l) => l.room)).toEqual(['Living', 'Unassigned'])
    expect(list.itemCount).toBe(2)
  })
})

describe('sanitizeUrl', () => {
  it('accepts http/https, rejects everything else', () => {
    expect(sanitizeUrl('https://ikea.com/x')).toBe('https://ikea.com/x')
    expect(sanitizeUrl('  http://a.b/c ')).toBe('http://a.b/c')
    expect(sanitizeUrl('javascript:alert(1)')).toBeNull()
    expect(sanitizeUrl('data:text/html,hi')).toBeNull()
    expect(sanitizeUrl('//ikea.com/x')).toBeNull()
    expect(sanitizeUrl('')).toBeNull()
    expect(sanitizeUrl(undefined)).toBeNull()
  })
})

describe('buildShopListHtml', () => {
  const list = (over: Partial<ShopList> = {}): ShopList => ({
    groups: [
      {
        retailer: 'IKEA',
        estimated: false,
        total: 89,
        lines: [
          {
            name: 'BILLY (white)',
            room: 'Living',
            sku: '002.638.50',
            qty: 1,
            unit: 89,
            total: 89,
            url: 'https://www.ikea.com/sg/en/p/billy-00263850/',
          },
        ],
      },
      {
        retailer: GENERIC_RETAILER,
        estimated: true,
        total: 2400,
        lines: [{ name: 'Sofa', room: 'Living', sku: '', qty: 2, unit: 1200, total: 2400 }],
      },
    ],
    grandTotal: 2489,
    itemCount: 3,
    ...over,
  })

  it('escapes every user-controlled string (5-char escaping)', () => {
    const hostile = list()
    hostile.groups[1]!.lines[0]!.name = '<script>alert("x")</script>'
    const html = buildShopListHtml({
      title: `<b>"Flat" & 'mine'</b>`,
      note: '<img onerror=x>',
      list: hostile,
    })
    expect(html).not.toContain('<script>alert')
    expect(html).not.toContain('<img onerror')
    expect(html).not.toContain('<b>')
    expect(html).toContain('&lt;script&gt;')
    expect(html).toContain('&quot;Flat&quot; &amp; &#39;mine&#39;')
  })

  it('renders links only for valid URLs, with rel=noopener', () => {
    const withBadUrl = list()
    withBadUrl.groups[0]!.lines[0]!.url = 'javascript:alert(1)'
    expect(buildShopListHtml({ title: 'T', list: withBadUrl })).not.toContain('<a href')
    const html = buildShopListHtml({ title: 'T', list: list() })
    expect(html).toContain('href="https://www.ikea.com/sg/en/p/billy-00263850/"')
    expect(html).toContain('rel="noopener noreferrer"')
  })

  it('shows per-retailer + grand totals and the budget under/over context', () => {
    const html = buildShopListHtml({ title: 'T', budgetTarget: 3000, list: list() })
    expect(html).toContain('IKEA subtotal')
    expect(html).toContain(`${GENERIC_RETAILER} subtotal`)
    expect(html).toContain('$2,489') // grand total
    expect(html).toContain('$511 under') // 3000 − 2489
    const over = buildShopListHtml({ title: 'T', budgetTarget: 2000, list: list() })
    expect(over).toContain('$489 over')
  })

  it('handles an empty design gracefully', () => {
    const html = buildShopListHtml({
      title: 'T',
      list: { groups: [], grandTotal: 0, itemCount: 0 },
    })
    expect(html).toContain('No furniture placed yet')
  })
})
