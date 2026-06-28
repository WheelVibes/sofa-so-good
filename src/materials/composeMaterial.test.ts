import { describe, expect, it } from 'vitest'
import {
  COMPOSE_TEXTURES,
  composedMaterialDef,
  composeMaterialId,
  isComposedMaterialId,
  isTintMaterialId,
  parseComposedMaterialId,
  parseTintMaterialId,
  tintedMaterialDef,
  tintMaterialId,
} from './composeMaterial'
import type { MaterialDef } from './types'

describe('composeMaterial', () => {
  it('round-trips an id through compose → parse', () => {
    const id = composeMaterialId('wood', '#b88f5d')
    expect(id).toBe('compose:wood:#b88f5d')
    const parts = parseComposedMaterialId(id)
    expect(parts?.pattern).toBe('wood')
    expect(parts?.color).toBe('#b88f5d')
    expect(parts?.texture.uvScale).toEqual([1.9, 1.2])
  })

  it('recognises composed ids and rejects others', () => {
    expect(isComposedMaterialId('compose:tile:#fff')).toBe(true)
    expect(isComposedMaterialId('#b88f5d')).toBe(false)
    expect(isComposedMaterialId('floor-wood-oak')).toBe(false)
    expect(isComposedMaterialId('mat:foo')).toBe(false)
  })

  it('rejects malformed / unknown ids', () => {
    expect(parseComposedMaterialId('floor-wood-oak')).toBeNull()
    expect(parseComposedMaterialId('compose:wood')).toBeNull() // no colour
    expect(parseComposedMaterialId('compose:notapattern:#fff')).toBeNull()
    expect(parseComposedMaterialId('compose:wood:notacolour')).toBeNull()
    expect(parseComposedMaterialId('compose:wood:#zzz')).toBeNull()
  })

  it('accepts 3-, 6- and 8-digit hex colours', () => {
    expect(parseComposedMaterialId('compose:tile:#fff')?.color).toBe('#fff')
    expect(parseComposedMaterialId('compose:tile:#ffffff')?.color).toBe('#ffffff')
    expect(parseComposedMaterialId('compose:tile:#ffffff80')?.color).toBe('#ffffff80')
  })

  it('synthesises a procedural def from a composed id', () => {
    const def = composedMaterialDef('compose:marble:#dcd6c8', 'wall')
    expect(def).not.toBeNull()
    expect(def?.kind).toBe('procedural')
    expect(def?.pattern).toBe('marble')
    expect(def?.swatch).toBe('#dcd6c8')
    expect(def?.category).toBe('wall')
    expect(def?.uvScale).toEqual([1.6, 1.6])
    expect(def?.id).toBe('compose:marble:#dcd6c8')
  })

  it('defaults the def category to floor and returns null for bad ids', () => {
    expect(composedMaterialDef('compose:wood:#b88f5d')?.category).toBe('floor')
    expect(composedMaterialDef('floor-wood-oak')).toBeNull()
  })

  it('every curated texture composes + parses back to itself', () => {
    for (const t of COMPOSE_TEXTURES) {
      const id = composeMaterialId(t.pattern, '#abcdef')
      const parts = parseComposedMaterialId(id)
      expect(parts?.pattern).toBe(t.pattern)
      expect(parts?.texture.uvScale).toEqual(t.uvScale)
    }
  })
})

describe('tintMaterial (recolour an existing material)', () => {
  const proceduralBase: MaterialDef = {
    id: 'floor-wood-oak',
    name: 'Oak planks',
    category: 'floor',
    kind: 'procedural',
    pattern: 'wood',
    swatch: '#b88f5d',
    uvScale: [1.9, 1.2],
  }
  const texturedBase: MaterialDef = {
    id: 'polyhaven:wood_floor_deck',
    name: 'Wood floor deck',
    category: 'floor',
    kind: 'textured',
    source: 'polyhaven',
    swatch: '#ffffff',
    textures: { albedo: 'https://example/albedo.jpg' },
    uvScale: [2, 2],
  }

  it('round-trips a tint id (base id with no colon)', () => {
    const id = tintMaterialId('floor-wood-oak', '#3aa0ff')
    expect(id).toBe('tint:floor-wood-oak:#3aa0ff')
    expect(isTintMaterialId(id)).toBe(true)
    expect(parseTintMaterialId(id)).toEqual({
      baseId: 'floor-wood-oak',
      color: '#3aa0ff',
      scale: 1,
    })
  })

  it('keeps a colon-bearing base id intact (provider slug)', () => {
    const id = tintMaterialId('polyhaven:wood_floor_deck', '#cc8844')
    expect(parseTintMaterialId(id)).toEqual({
      baseId: 'polyhaven:wood_floor_deck',
      color: '#cc8844',
      scale: 1,
    })
  })

  it('rejects non-tint / malformed ids', () => {
    expect(isTintMaterialId('compose:wood:#fff')).toBe(false)
    expect(parseTintMaterialId('tint:base')).toBeNull()
    expect(parseTintMaterialId('tint:base:notacolour')).toBeNull()
    expect(parseTintMaterialId('floor-wood-oak')).toBeNull()
  })

  it('tints a procedural base by overriding its swatch (keeps pattern/uvScale)', () => {
    const def = tintedMaterialDef('tint:floor-wood-oak:#3aa0ff', proceduralBase)
    expect(def?.kind).toBe('procedural')
    expect(def?.swatch).toBe('#3aa0ff')
    expect(def?.id).toBe('tint:floor-wood-oak:#3aa0ff')
    if (def?.kind === 'procedural') expect(def.pattern).toBe('wood')
  })

  it('tints a textured (Poly Haven) base — swatch multiplies the albedo, textures kept', () => {
    const id = tintMaterialId('polyhaven:wood_floor_deck', '#cc8844')
    const def = tintedMaterialDef(id, texturedBase)
    expect(def?.kind).toBe('textured')
    expect(def?.swatch).toBe('#cc8844')
    if (def?.kind === 'textured') expect(def.textures.albedo).toBe('https://example/albedo.jpg')
  })

  it('returns null for a malformed tint id', () => {
    expect(tintedMaterialDef('tint:bad', proceduralBase)).toBeNull()
  })
})

describe('tile-scale parameter (CUSTOMIZE-MATERIAL-PARAMS)', () => {
  it('omits the @scale suffix at scale 1 (back-compat)', () => {
    expect(composeMaterialId('wood', '#b88f5d', 1)).toBe('compose:wood:#b88f5d')
    expect(tintMaterialId('floor-wood-oak', '#3aa0ff', 1)).toBe('tint:floor-wood-oak:#3aa0ff')
  })

  it('round-trips a composed scale and multiplies the uvScale', () => {
    const id = composeMaterialId('wood', '#b88f5d', 2)
    expect(id).toBe('compose:wood:#b88f5d@2')
    const parts = parseComposedMaterialId(id)
    expect(parts?.scale).toBe(2)
    // wood default uvScale is [1.9, 1.2] → doubled.
    const def = composedMaterialDef(id)
    expect(def?.uvScale).toEqual([3.8, 2.4])
  })

  it('round-trips a tint scale and multiplies the base uvScale', () => {
    const base: MaterialDef = {
      id: 'floor-wood-oak',
      name: 'Oak planks',
      category: 'floor',
      kind: 'procedural',
      pattern: 'wood',
      swatch: '#b88f5d',
      uvScale: [2, 2],
    }
    const id = tintMaterialId('floor-wood-oak', '#3aa0ff', 0.5)
    expect(parseTintMaterialId(id)?.scale).toBe(0.5)
    const def = tintedMaterialDef(id, base)
    if (def?.kind === 'procedural') expect(def.uvScale).toEqual([1, 1]) // [2,2] × 0.5
  })

  it('clamps an out-of-range or non-finite scale', () => {
    expect(parseComposedMaterialId('compose:wood:#b88f5d@99')?.scale).toBe(4)
    expect(parseComposedMaterialId('compose:wood:#b88f5d@0')?.scale).toBe(1)
    expect(parseComposedMaterialId('compose:wood:#b88f5d@x')?.scale).toBe(1)
  })

  it('legacy ids without @scale parse as scale 1', () => {
    expect(parseComposedMaterialId('compose:tile:#ffffff')?.scale).toBe(1)
    expect(parseTintMaterialId('tint:floor-wood-oak:#3aa0ff')?.scale).toBe(1)
  })

  it('round-trips a gloss/roughness override (~<rough>) and sets def.roughness', () => {
    const id = composeMaterialId('tile', '#ffffff', 1, 0.2)
    expect(id).toBe('compose:tile:#ffffff~0.2')
    const parts = parseComposedMaterialId(id)
    expect(parts?.roughness).toBe(0.2)
    expect(composedMaterialDef(id)?.roughness).toBe(0.2)
  })

  it('combines scale + gloss in one id (order-independent parse)', () => {
    const id = composeMaterialId('wood', '#b88f5d', 2, 0.4)
    expect(id).toBe('compose:wood:#b88f5d@2~0.4')
    const parts = parseComposedMaterialId(id)
    expect(parts?.scale).toBe(2)
    expect(parts?.roughness).toBe(0.4)
    // colour must still parse cleanly with both suffixes present.
    expect(parts?.color).toBe('#b88f5d')
  })

  it('omits roughness from the id when unset (back-compat)', () => {
    expect(composeMaterialId('wood', '#b88f5d', 1)).toBe('compose:wood:#b88f5d')
    expect(parseComposedMaterialId('compose:wood:#b88f5d')?.roughness).toBeUndefined()
  })

  it('clamps an out-of-range gloss override', () => {
    expect(parseComposedMaterialId('compose:tile:#fff~5')?.roughness).toBe(1)
    expect(parseComposedMaterialId('compose:tile:#fff~0')?.roughness).toBe(0.05)
  })
})
