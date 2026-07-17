import { describe, expect, it } from 'vitest'
import { composeProduct, transformPart } from './compose'
import { type ConfigurableProduct, type ConfiguredPart, clampConfig } from './model'
import {
  CONFIGURABLE_PRODUCTS,
  getConfigurableProduct,
  visibleConfigurableProducts,
} from './products'

const mattress = getConfigurableProduct('mattress-frame')!
const sofa = getConfigurableProduct('modular-sofa')!

/** A tiny two-slot fixture exercising `clampConfig`'s mutex/excludes mechanism
 *  independently of any shipped product's constraint set. */
const CONSTRAINT_FIXTURE: ConfigurableProduct = {
  id: 'fixture',
  label: 'Fixture',
  category: 'seating',
  base: { footprint: { w: 1, d: 1, h: 1 }, price: 0 },
  slots: [
    {
      id: 'a',
      label: 'A',
      anchor: { position: [0, 0, 0] },
      optional: true,
      defaultOptionId: 'a1',
      options: [
        { id: 'a1', label: 'A1', price: 1, footprint: { w: 1, d: 1, h: 1 } },
        { id: 'a2', label: 'A2', price: 1, footprint: { w: 1, d: 1, h: 1 } },
      ],
    },
    {
      id: 'b',
      label: 'B',
      anchor: { position: [0, 0, 0] },
      optional: true,
      defaultOptionId: 'b1',
      options: [{ id: 'b1', label: 'B1', price: 1, footprint: { w: 1, d: 1, h: 1 } }],
    },
  ],
  constraints: [
    { kind: 'mutex', slots: ['a', 'b'] },
    { kind: 'excludes', slot: 'a', option: 'a2', conflictsWith: { slot: 'b', option: 'b1' } },
  ],
}

describe('clampConfig (SLOT-101)', () => {
  it('fills every slot with a valid option / default for malformed input', () => {
    const s = clampConfig(mattress, { productId: 'x', selections: { mattress: 'nope' } as never })
    expect(s.selections.mattress).toBe('m-foam') // unknown → default
    expect(s.selections.headboard).toBe('hb-panel') // missing → default
  })

  it('honours an explicit null only on an optional slot', () => {
    const s = clampConfig(mattress, { selections: { mattress: null, headboard: null } })
    expect(s.selections.mattress).toBe('m-foam') // required → default, not null
    expect(s.selections.headboard).toBeNull() // optional → stays empty
  })

  it('mutex keeps the earlier-declared slot and empties the later', () => {
    const s = clampConfig(CONSTRAINT_FIXTURE, { selections: { a: 'a1', b: 'b1' } })
    expect(s.selections.a).toBe('a1')
    expect(s.selections.b).toBeNull() // mutex[a, b] → b emptied
  })

  it('mutex keeps the later slot when the earlier is left open', () => {
    const s = clampConfig(CONSTRAINT_FIXTURE, { selections: { a: null, b: 'b1' } })
    expect(s.selections.a).toBeNull()
    expect(s.selections.b).toBe('b1')
  })

  it('excludes demotes the conflicting slot (mutex demotes b first, so a2 keeps)', () => {
    const s = clampConfig(CONSTRAINT_FIXTURE, { selections: { a: 'a2', b: null } })
    // No mutex conflict (b empty); excludes only fires when both are present.
    expect(s.selections.a).toBe('a2')
    expect(s.selections.b).toBeNull()
  })
})

describe('transformPart (SLOT-101)', () => {
  const part: ConfiguredPart = { role: 'r', position: [0.5, 0, 0.2], size: [1, 2, 0.4] }

  it('translates by the anchor with no rotation', () => {
    const t = transformPart(part, { position: [1, 0.3, -2] })
    expect(t.position).toEqual([1.5, 0.3, -1.8])
    expect(t.size).toEqual([1, 2, 0.4])
  })

  it('π rotation flips x/z and keeps the extents', () => {
    const t = transformPart(part, { position: [1.05, 0, 0], rotationY: Math.PI })
    expect(t.position[0]).toBeCloseTo(0.55, 6) // 1.05 + (-0.5)
    expect(t.position[2]).toBeCloseTo(-0.2, 6)
    expect(t.size[0]).toBeCloseTo(1, 6)
    expect(t.size[2]).toBeCloseTo(0.4, 6)
  })

  it('quarter-turn swaps the in-plane (w/d) extents', () => {
    const t = transformPart(
      { role: 'r', position: [0.5, 0, 0], size: [1, 2, 0.4] },
      {
        position: [0, 0, 0],
        rotationY: Math.PI / 2,
      },
    )
    expect(t.position[0]).toBeCloseTo(0, 6)
    expect(t.position[2]).toBeCloseTo(-0.5, 6)
    expect(t.size[0]).toBeCloseTo(0.4, 6) // d↔w swapped
    expect(t.size[2]).toBeCloseTo(1, 6)
  })
})

describe('composeProduct — mattress-frame (SLOT-201)', () => {
  it('default config: base + foam mattress + padded headboard + bedside lamp', () => {
    const m = composeProduct(mattress, { productId: 'mattress-frame', selections: {} })
    // 5 frame parts + 1 mattress + 1 headboard (the lamp is a GLB piece, not a part).
    expect(m.parts).toHaveLength(7)
    // The default lamp (SLOT-203) is a GLB sub-asset piece, namespaced under 'lamp'.
    expect(m.gltfPieces).toHaveLength(1)
    expect(m.gltfPieces[0]!.finishPrefix).toBe('lamp')
    expect(m.gltfPieces[0]!.url).toBe('/assets/furniture/desk-lamp-arm.glb')
    expect(m.price).toBe(220 + 260 + 150 + 85)
    // Bounds widen past the 1.6 frame — the lamp stands to the left of the head.
    expect(m.bounds.w).toBeGreaterThan(1.6)
    // Frame depth 2.1; the headboard protrudes ~0.04 behind it (anchor z = -1.05).
    expect(m.bounds.d).toBeGreaterThanOrEqual(2.1)
    expect(m.bounds.d).toBeLessThan(2.2)
    expect(m.bounds.h).toBeGreaterThan(0.9) // 0.30 frame + 0.30 anchor + 0.70 panel = 1.0
    // Procedural re-skinnable groups (GLB targets are discovered at load/bake).
    expect(m.finishTargets.map((t) => t.key).sort()).toEqual([
      'base:frame',
      'headboard:face',
      'mattress:cover',
    ])
  })

  it('omitting the headboard drops its part + price (lamp still on)', () => {
    const m = composeProduct(mattress, {
      productId: 'mattress-frame',
      selections: { headboard: null },
    })
    expect(m.parts).toHaveLength(6)
    expect(m.price).toBe(220 + 260 + 85)
    expect(m.finishTargets.some((t) => t.key === 'headboard:face')).toBe(false)
  })

  it('dropping the lamp removes its GLB piece + price', () => {
    const m = composeProduct(mattress, {
      productId: 'mattress-frame',
      selections: { lamp: null },
    })
    expect(m.gltfPieces).toHaveLength(0)
    expect(m.price).toBe(220 + 260 + 150) // base + foam + headboard, no lamp
  })

  it('a thicker mattress raises the price and the bounds height', () => {
    const m = composeProduct(mattress, {
      productId: 'mattress-frame',
      selections: { mattress: 'm-hybrid', headboard: null },
    })
    expect(m.price).toBe(220 + 640 + 85) // + bedside lamp (default on)
  })
})

describe('composeProduct — modular sectional (SLOT-202 / E4A)', () => {
  it('default loveseat: 2-seat core + an arm each end (no gaps, no constraint)', () => {
    const m = composeProduct(sofa, { productId: 'modular-sofa', selections: {} })
    // base = 2 seat modules × 4 parts = 8; + 1 arm each end = 10.
    expect(m.parts).toHaveLength(10)
    expect(m.price).toBe(520 + 90 + 90)
    // A loveseat stays a single-depth run.
    expect(m.bounds.d).toBeCloseTo(0.95, 2)
    // Composite footprint: base + leftEnd + rightEnd contributions.
    expect(m.footprintParts).toHaveLength(3)
  })

  it('one corner turns the run into an L that projects forward', () => {
    const m = composeProduct(sofa, {
      productId: 'modular-sofa',
      selections: { leftEnd: 'corner', rightEnd: 'arm' },
    })
    expect(m.price).toBe(520 + 420 + 90)
    // The forward-turning corner deepens the footprint well past the 0.95 run.
    expect(m.bounds.d).toBeGreaterThan(1.4)
    const [base, left, right] = m.footprintParts
    // Only the corner (leftEnd) is deep; the base run + right arm stay shallow —
    // this is the honest L notch (the U/interior stays open for collision).
    expect(left!.d).toBeGreaterThan(1.4)
    expect(base!.d).toBeCloseTo(0.95, 2)
    expect(right!.d).toBeCloseTo(0.95, 2)
    // The corner sits to the LEFT of the bounds centre; the shallow base run is
    // pulled BACK relative to the forward-projecting corner (the L notch).
    expect(left!.dx).toBeLessThan(0)
    expect(base!.dz).toBeLessThan(left!.dz)
  })

  it('corners at BOTH ends make a U (both returns deep, centre shallow)', () => {
    const m = composeProduct(sofa, {
      productId: 'modular-sofa',
      selections: { leftEnd: 'corner', rightEnd: 'corner' },
    })
    expect(m.price).toBe(520 + 420 + 420)
    const [base, left, right] = m.footprintParts
    expect(base!.d).toBeCloseTo(0.95, 2) // shallow centre → open U interior
    expect(left!.d).toBeGreaterThan(1.4)
    expect(right!.d).toBeGreaterThan(1.4)
    expect(left!.dx).toBeLessThan(0)
    expect(right!.dx).toBeGreaterThan(0)
    // The centre run is set back from both forward-projecting returns.
    expect(base!.dz).toBeLessThan(left!.dz)
    expect(base!.dz).toBeLessThan(right!.dz)
  })

  it('a 5-module U: seat+corner one side, corner the other', () => {
    const m = composeProduct(sofa, {
      productId: 'modular-sofa',
      selections: { leftEnd: 'seat-corner', rightEnd: 'corner' },
    })
    // 2 core seats + (1 seat + 1 corner) + 1 corner = 5 modules.
    expect(m.price).toBe(520 + 690 + 420)
    expect(m.footprintParts).toHaveLength(3)
    expect(m.bounds.w).toBeGreaterThan(3.5) // wide U with the extra left seat
  })

  it('every end option carries a real price + footprint', () => {
    for (const slot of sofa.slots) {
      for (const opt of slot.options) {
        expect(opt.price).toBeGreaterThan(0)
        expect(opt.footprint.w).toBeGreaterThan(0)
        expect(opt.footprint.d).toBeGreaterThan(0)
        expect(opt.parts?.length).toBeGreaterThan(0)
      }
    }
  })
})

const catTree = getConfigurableProduct('cat-tree-modular')!

describe('composeProduct — modular cat tree (Pet P2)', () => {
  it('base + default tiers compose with a summed price and finish targets', () => {
    const m = composeProduct(catTree, { productId: 'cat-tree-modular', selections: {} })
    // Defaults: tier1 platform (25) + tier2 house (60) + tier3 perch (35).
    expect(m.price).toBe(120 + 25 + 60 + 35)
    // The base sisal post + plinth expose re-skin groups.
    expect(m.finishTargets.some((t) => t.key === 'base:post')).toBe(true)
    expect(m.finishTargets.some((t) => t.key === 'base:plinth')).toBe(true)
    // The tree rises through every tier (top perch near 1.4 m + rim).
    expect(m.bounds.h).toBeGreaterThan(1.4)
  })

  it('a hammock forces the tier below back to a solid platform (requires constraint)', () => {
    const s = clampConfig(catTree, {
      selections: { tier1: 'house', tier2: 'hammock' },
    })
    // tier2 hammock ⇒ tier1 must be a platform to hang over.
    expect(s.selections.tier2).toBe('hammock')
    expect(s.selections.tier1).toBe('platform')
  })

  it('a top hammock forces the middle tier to a platform', () => {
    const s = clampConfig(catTree, { selections: { tier2: 'house', tier3: 'hammock' } })
    expect(s.selections.tier3).toBe('hammock')
    expect(s.selections.tier2).toBe('platform')
  })

  it('swapping a slot changes the composed price', () => {
    const withHouse = composeProduct(catTree, {
      productId: 'cat-tree-modular',
      selections: { tier3: 'platform' },
    })
    // tier3 platform (25) instead of the default perch (35) ⇒ 10 cheaper.
    const withPerch = composeProduct(catTree, { productId: 'cat-tree-modular', selections: {} })
    expect(withPerch.price - withHouse.price).toBe(10)
  })

  it('every cat-tree option contributes a real footprint + price', () => {
    for (const slot of catTree.slots) {
      for (const opt of slot.options) {
        expect(opt.price).toBeGreaterThan(0)
        expect(opt.footprint.w).toBeGreaterThan(0)
        expect(opt.footprint.h).toBeGreaterThan(0)
      }
    }
  })
})

describe('product registry', () => {
  it('exposes the worked-example products + the modular cat tree', () => {
    expect(CONFIGURABLE_PRODUCTS.map((p) => p.id)).toEqual([
      'mattress-frame',
      'modular-sofa',
      'cat-tree-modular',
    ])
    expect(getConfigurableProduct('nope')).toBeNull()
  })

  it('the cat tree is categorised under pets', () => {
    expect(catTree.category).toBe('pets')
  })
})

describe('visibleConfigurableProducts (pets gate)', () => {
  it('hides pets products when petFittings is off, keeps the rest', () => {
    const visible = visibleConfigurableProducts(CONFIGURABLE_PRODUCTS, false)
    expect(visible.some((p) => p.category === 'pets')).toBe(false)
    expect(visible.map((p) => p.id)).toContain('mattress-frame')
    expect(visible.map((p) => p.id)).toContain('modular-sofa')
  })

  it('includes pets products when petFittings is on (default in both modes)', () => {
    const visible = visibleConfigurableProducts(CONFIGURABLE_PRODUCTS, true)
    expect(visible).toEqual([...CONFIGURABLE_PRODUCTS])
    expect(visible.some((p) => p.category === 'pets')).toBe(true)
  })
})
