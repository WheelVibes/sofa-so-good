import { describe, expect, it } from 'vitest'
import {
  COMPOSE_TEXTURES,
  composedMaterialDef,
  composeMaterialId,
  isComposedMaterialId,
  parseComposedMaterialId,
} from './composeMaterial'

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
