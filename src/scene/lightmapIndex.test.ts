// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { createLightmapResolver, type LightmapIndex, parseLightmapIndex } from './lightmapIndex'

const valid = () => ({
  version: 1,
  pass: 'visibility',
  uv: 'box-atlas-3x2',
  maps: [
    { key: 'aaaa1111', file: 'aaaa1111.png', object: 'Mesh_116', area: 34.2 },
    { key: 'bbbb2222', file: 'bbbb2222.png' },
  ],
})

describe('parseLightmapIndex', () => {
  it('accepts a real index and keeps provenance', () => {
    const r = parseLightmapIndex(valid())
    expect('index' in r).toBe(true)
    if (!('index' in r)) return
    expect(r.index.maps).toHaveLength(2)
    expect(r.index.maps[0].object).toBe('Mesh_116')
  })

  it('rejects a UV layout it does not implement, rather than loading it', () => {
    // The dangerous case: a set baked in another layout loads fine, looks plausible, and is
    // wrong on every texel. Refusing beats rendering it.
    const r = parseLightmapIndex({ ...valid(), uv: 'lightmap-packed' })
    expect(r).toEqual({ error: 'unsupported uv layout lightmap-packed (need box-atlas-3x2)' })
  })

  it('rejects a future version', () => {
    expect(parseLightmapIndex({ ...valid(), version: 2 })).toEqual({
      error: 'unsupported index version 2 (need 1)',
    })
  })

  it.each([
    ['not an object', 42, 'index is not an object'],
    ['null', null, 'index is not an object'],
    ['no maps array', { version: 1, uv: 'box-atlas-3x2' }, 'index has no maps array'],
    ['empty maps', { version: 1, uv: 'box-atlas-3x2', maps: [] }, 'index lists no maps'],
    [
      'entry without file',
      { version: 1, uv: 'box-atlas-3x2', maps: [{ key: 'a' }] },
      'a map entry is missing key or file',
    ],
  ])('returns an error for %s instead of throwing', (_label, input, error) => {
    // Degrading to today's render is always acceptable; breaking the scene is not.
    expect(parseLightmapIndex(input)).toEqual({ error })
  })
})

describe('createLightmapResolver', () => {
  const index = () => (parseLightmapIndex(valid()) as { index: LightmapIndex }).index

  it('resolves a key to a URL and normalises a missing trailing slash', () => {
    const a = createLightmapResolver(index(), '/assets/lm')
    const b = createLightmapResolver(index(), '/assets/lm/')
    expect(a.urlFor('aaaa1111')).toBe('/assets/lm/aaaa1111.png')
    expect(b.urlFor('aaaa1111')).toBe('/assets/lm/aaaa1111.png')
  })

  it('counts hits and misses', () => {
    const r = createLightmapResolver(index(), '/lm')
    r.urlFor('aaaa1111')
    r.urlFor('nope')
    r.urlFor('bbbb2222')
    expect(r.stats()).toEqual({ looked: 3, hit: 2, missed: 1, rate: 2 / 3 })
  })

  it('does NOT cry wolf on a zero hit rate before enough lookups', () => {
    // The scene mounts progressively; judging after two lookups would warn on every load.
    const r = createLightmapResolver(index(), '/lm', 20)
    r.urlFor('nope')
    expect(r.describeHitRate().suspect).toBe(false)
  })

  it('flags a sustained zero hit rate as a bug WHEN coverage was expected', () => {
    // This is the property that caught keys hashed in Blender space matching 0 of 385 meshes.
    const r = createLightmapResolver(index(), '/lm', 5)
    for (let i = 0; i < 6; i += 1) r.urlFor(`miss${i}`)
    const d = r.describeHitRate(true)
    expect(d.suspect).toBe(true)
    expect(d.message).toContain('ZERO matched')
    expect(d.message).toContain('coordinate frame')
  })

  it('stays quiet on zero hits when coverage was NOT expected', () => {
    // With one shared index across all baked plans, an unbaked or user-edited layout matching
    // nothing is the normal state -- warning there would cry wolf on the common case.
    const r = createLightmapResolver(index(), '/lm', 5)
    for (let i = 0; i < 6; i += 1) r.urlFor(`miss${i}`)
    const d = r.describeHitRate()
    expect(d.suspect).toBe(false)
    expect(d.message).toContain('no maps for this plan')
  })

  it('does not flag a partial hit rate — the shell is mapped, furniture is not', () => {
    // 118 of 385 meshes matching is the expected, correct state: only shell meshes are baked.
    const r = createLightmapResolver(index(), '/lm', 5)
    for (let i = 0; i < 9; i += 1) r.urlFor(`miss${i}`)
    r.urlFor('aaaa1111')
    expect(r.describeHitRate().suspect).toBe(false)
    expect(r.describeHitRate().message).toContain('1/10')
  })
})
