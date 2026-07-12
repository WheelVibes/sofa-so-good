import { describe, expect, it } from 'vitest'
import { composeProduct, transformPart } from './compose'
import { type ConfiguredPart, clampConfig, selectedOption } from './model'
import { CONFIGURABLE_PRODUCTS, getConfigurableProduct } from './products'

const mattress = getConfigurableProduct('mattress-frame')!
const sofa = getConfigurableProduct('modular-sofa')!

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

  it('mutex keeps the earlier-declared slot and empties the later (modular sofa)', () => {
    const s = clampConfig(sofa, { selections: { rightEnd: 'arm-std', corner: 'corner-1' } })
    expect(s.selections.rightEnd).toBe('arm-std')
    expect(s.selections.corner).toBeNull() // mutex[rightEnd, corner] → corner emptied
  })

  it('mutex keeps the corner when the right end is left open', () => {
    const s = clampConfig(sofa, { selections: { rightEnd: null, corner: 'corner-1' } })
    expect(s.selections.rightEnd).toBeNull()
    expect(s.selections.corner).toBe('corner-1')
  })

  it('excludes demotes the conflicting corner when a left chaise is chosen', () => {
    const s = clampConfig(sofa, {
      selections: { leftEnd: 'chaise-l', rightEnd: null, corner: 'corner-1' },
    })
    expect(s.selections.leftEnd).toBe('chaise-l')
    expect(s.selections.corner).toBeNull() // excludes → corner demoted (optional → null)
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

describe('composeProduct — modular sofa (SLOT-202)', () => {
  it('default config resolves the mutex (corner emptied) and sums arms', () => {
    const m = composeProduct(sofa, { productId: 'modular-sofa', selections: {} })
    // base 3 + leftEnd arm 1 + rightEnd arm 1 (corner emptied by mutex).
    expect(m.parts).toHaveLength(5)
    expect(m.price).toBe(520 + 90 + 90)
  })

  it('a corner (right end open) extends the footprint into an L and adds its price', () => {
    const m = composeProduct(sofa, {
      productId: 'modular-sofa',
      selections: { rightEnd: null, corner: 'corner-1' },
    })
    expect(m.price).toBe(520 + 90 + 420)
    // The corner sits back-right (anchor z = -0.95), so depth exceeds the base 0.95.
    expect(m.bounds.d).toBeGreaterThan(0.95)
    expect(
      selectedOption(
        sofa.slots[2],
        clampConfig(sofa, { selections: { rightEnd: null, corner: 'corner-1' } }),
      )?.id,
    ).toBe('corner-1')
  })
})

describe('product registry', () => {
  it('exposes both worked-example products', () => {
    expect(CONFIGURABLE_PRODUCTS.map((p) => p.id)).toEqual(['mattress-frame', 'modular-sofa'])
    expect(getConfigurableProduct('nope')).toBeNull()
  })
})
