// @vitest-environment happy-dom
/**
 * The material model used to bind only albedo / normal / roughness / AO, so a
 * scan's metalness, opacity and displacement maps had nowhere to go. These
 * tests pin the three additions:
 *  - `metalnessMap` + the scalar driven to 1 (three MULTIPLIES the scalar by
 *    the map, so leaving the default 0 would zero the map out entirely);
 *  - `alphaMap` via alpha-TEST rather than blending (a blended surface would
 *    join the sorted transparent pass and fight the wall-reveal fade, which
 *    animates `opacity` on these same materials);
 *  - displacement carried on `userData`, NOT bound to `displacementMap` — that
 *    displaces vertices and the shell's floors are low-poly boxes.
 */
import { Texture } from 'three'
import { describe, expect, it } from 'vitest'
import { buildMaterial, disposeCachedMaterial } from './cache'
import { NO_IBL_METALNESS, setIblActive } from './iblSignal'
import type { TexturedMaterialDef } from './types'

function def(id: string): TexturedMaterialDef {
  return {
    id,
    name: id,
    category: 'floor',
    kind: 'textured',
    source: 'ambientcg',
    swatch: '#888888',
    textures: { albedo: 'a.webp' },
    uvScale: [1, 1],
  }
}

const tex = () => new Texture()

describe('metalness map', () => {
  it('binds the map and drives the scalar to 1 so the map is authoritative', () => {
    const id = 'test:metal:1'
    disposeCachedMaterial(id)
    const m = buildMaterial(def(id), { albedo: tex(), metalness: tex() })
    expect(m.metalnessMap).not.toBeNull()
    expect(m.metalness).toBe(1)
    disposeCachedMaterial(id)
  })

  it('leaves the scalar at 0 when there is no map (unchanged behaviour)', () => {
    const id = 'test:metal:none'
    disposeCachedMaterial(id)
    const m = buildMaterial(def(id), { albedo: tex() })
    expect(m.metalnessMap).toBeNull()
    expect(m.metalness).toBe(0)
    disposeCachedMaterial(id)
  })
})

describe('opacity map', () => {
  it('uses alpha-test, never alpha blending', () => {
    const id = 'test:opacity:1'
    disposeCachedMaterial(id)
    const m = buildMaterial(def(id), { albedo: tex(), opacity: tex() })
    expect(m.alphaMap).not.toBeNull()
    expect(m.alphaTest).toBeGreaterThan(0)
    // Blending would break sorting against the shell and the reveal fade.
    expect(m.transparent).toBe(false)
    disposeCachedMaterial(id)
  })
})

describe('displacement map', () => {
  it('is carried on userData and NOT bound as three displacementMap', () => {
    const id = 'test:disp:1'
    disposeCachedMaterial(id)
    const d = tex()
    const m = buildMaterial(def(id), { albedo: tex(), displacement: d })
    expect(m.userData.displacementMap).toBe(d)
    // Vertex displacement on a low-poly box would do nothing but cost memory.
    expect(m.displacementMap).toBeNull()
    disposeCachedMaterial(id)
  })
})

describe('uv scale applies to every bound map', () => {
  it('repeats metalness and opacity with the rest', () => {
    const id = 'test:uv:1'
    disposeCachedMaterial(id)
    const d = { ...def(id), uvScale: [2, 4] as [number, number] }
    const m = buildMaterial(d, { albedo: tex(), metalness: tex(), opacity: tex() })
    for (const t of [m.map, m.metalnessMap, m.alphaMap]) {
      expect(t?.repeat.x).toBeCloseTo(0.5)
      expect(t?.repeat.y).toBeCloseTo(0.25)
    }
    disposeCachedMaterial(id)
  })
})

describe('metalness map without image-based lighting', () => {
  it('caps the scalar so a scanned metal keeps its albedo on a no-IBL tier', () => {
    // Regression: driving the scalar to a flat 1 made a metalness-mapped scan
    // render as dead grey on the DEFAULT Performance tier (scene.environment
    // null) — the same "grey box" failure NO_IBL_METALNESS fixes for the
    // procedural metal presets. Verified in Chrome before this cap existed.
    setIblActive(false)
    const id = 'test:metal:noibl'
    disposeCachedMaterial(id)
    const m = buildMaterial(def(id), { albedo: tex(), metalness: tex() })
    expect(m.metalnessMap).not.toBeNull()
    expect(m.metalness).toBeLessThanOrEqual(NO_IBL_METALNESS)
    disposeCachedMaterial(id)
    setIblActive(true)
  })

  it('scopes the cache entry by IBL state so a tier switch rebuilds', () => {
    const id = 'test:metal:tierswap'
    setIblActive(true)
    const lit = buildMaterial(def(id), { albedo: tex(), metalness: tex() })
    expect(lit.metalness).toBe(1)
    setIblActive(false)
    const unlit = buildMaterial(def(id), { albedo: tex(), metalness: tex() })
    // A shared cache key would have served the fully-metallic one straight back.
    expect(unlit).not.toBe(lit)
    expect(unlit.metalness).toBeLessThanOrEqual(NO_IBL_METALNESS)
    setIblActive(true)
  })

  it('leaves a def with no metalness map out of the IBL-scoped key', () => {
    const id = 'test:plain:shared'
    setIblActive(true)
    const a = buildMaterial(def(id), { albedo: tex() })
    setIblActive(false)
    // No metalness map ⇒ IBL is irrelevant ⇒ same cache entry, no churn.
    expect(buildMaterial(def(id), { albedo: tex() })).toBe(a)
    setIblActive(true)
  })
})
