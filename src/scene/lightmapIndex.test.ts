// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { createLightmapResolver, type LightmapIndex, parseLightmapIndex } from './lightmapIndex'

const CTX = 'ctxaaaa'
const valid = () => ({
  version: 2,
  pass: 'visibility',
  uv: 'box-atlas-3x2',
  maps: [
    { key: 'aaaa1111', file: 'aaaa1111.png', ctx: CTX, object: 'Mesh_116', area: 34.2 },
    { key: 'bbbb2222', file: 'bbbb2222.png', ctx: CTX },
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

  it('rejects a version it does not implement', () => {
    expect(parseLightmapIndex({ ...valid(), version: 3 })).toEqual({
      error: 'unsupported index version 3 (need 2)',
    })
  })

  it('rejects a v1 set, whose maps carry no plan context', () => {
    // Not pedantry: a v1 map could be applied to the wrong plan, because a mesh key alone is
    // not a sufficient identity -- 20 of 65 meshes collided between two real HDB plans.
    expect(parseLightmapIndex({ ...valid(), version: 1 })).toEqual({
      error: 'unsupported index version 1 (need 2)',
    })
  })

  it('rejects a map entry with no context', () => {
    const bad = valid()
    bad.maps = [{ key: 'aaaa1111', file: 'a.png' } as never]
    expect(parseLightmapIndex(bad)).toEqual({ error: 'map aaaa1111 has no plan context' })
  })

  it.each([
    ['not an object', 42, 'index is not an object'],
    ['null', null, 'index is not an object'],
    ['no maps array', { version: 2, uv: 'box-atlas-3x2' }, 'index has no maps array'],
    ['empty maps', { version: 2, uv: 'box-atlas-3x2', maps: [] }, 'index lists no maps'],
    [
      'entry without file',
      { version: 2, uv: 'box-atlas-3x2', maps: [{ key: 'a' }] },
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
    expect(a.urlFor('aaaa1111', CTX)).toBe('/assets/lm/aaaa1111.png')
    expect(b.urlFor('aaaa1111', CTX)).toBe('/assets/lm/aaaa1111.png')
  })

  it('counts hits and misses', () => {
    const r = createLightmapResolver(index(), '/lm')
    r.urlFor('aaaa1111', CTX)
    r.urlFor('nope', CTX)
    r.urlFor('bbbb2222', CTX)
    expect(r.stats()).toEqual({ looked: 3, hit: 2, missed: 1, rate: 2 / 3 })
  })

  it('does NOT cry wolf on a zero hit rate before enough lookups', () => {
    // The scene mounts progressively; judging after two lookups would warn on every load.
    const r = createLightmapResolver(index(), '/lm', 20)
    r.urlFor('nope', CTX)
    expect(r.describeHitRate().suspect).toBe(false)
  })

  it('flags a sustained zero hit rate as a bug WHEN coverage was expected', () => {
    // This is the property that caught keys hashed in Blender space matching 0 of 385 meshes.
    const r = createLightmapResolver(index(), '/lm', 5)
    for (let i = 0; i < 6; i += 1) r.urlFor(`miss${i}`, CTX)
    const d = r.describeHitRate(true)
    expect(d.suspect).toBe(true)
    expect(d.message).toContain('ZERO matched')
    expect(d.message).toContain('coordinate frame')
  })

  it('stays quiet on zero hits when coverage was NOT expected', () => {
    // With one shared index across all baked plans, an unbaked or user-edited layout matching
    // nothing is the normal state -- warning there would cry wolf on the common case.
    const r = createLightmapResolver(index(), '/lm', 5)
    for (let i = 0; i < 6; i += 1) r.urlFor(`miss${i}`, CTX)
    const d = r.describeHitRate()
    expect(d.suspect).toBe(false)
    expect(d.message).toContain('no maps for this plan')
  })

  it('does not flag a partial hit rate — the shell is mapped, furniture is not', () => {
    // 118 of 385 meshes matching is the expected, correct state: only shell meshes are baked.
    const r = createLightmapResolver(index(), '/lm', 5)
    for (let i = 0; i < 9; i += 1) r.urlFor(`miss${i}`, CTX)
    r.urlFor('aaaa1111', CTX)
    expect(r.describeHitRate().suspect).toBe(false)
    expect(r.describeHitRate().message).toContain('1/10')
  })
})

describe('parseLightmapIndex — fields that were silently dropped', () => {
  const base = {
    version: 2,
    pass: 'visibility',
    uv: 'box-atlas-3x2',
    maps: [
      {
        key: 'k1',
        file: 'a.png',
        ctx: 'c1',
        slots: [
          [1, 0],
          [2, 1],
        ],
      },
    ],
  }

  it('carries `slots` through to the entry', () => {
    // It did not. The field existed on the interface and on the resolver, and the parse never
    // copied it, so `slotsFor` returned null for every key ever baked.
    const r = parseLightmapIndex(base)
    expect('index' in r).toBe(true)
    if (!('index' in r)) return
    expect(r.index.maps[0]?.slots).toEqual([
      [1, 0],
      [2, 1],
    ])
  })

  it('makes `slotsFor` actually return those slots', () => {
    const r = parseLightmapIndex(base)
    if (!('index' in r)) throw new Error('parse failed')
    const res = createLightmapResolver(r.index, '/assets/lm')
    expect(res.slotsFor('k1', 'c1')).toEqual([
      [1, 0],
      [2, 1],
    ])
  })

  it('drops malformed slot pairs rather than trusting them', () => {
    const r = parseLightmapIndex({
      ...base,
      maps: [{ key: 'k1', file: 'a.png', ctx: 'c1', slots: [[1], 'x', [0, 0]] }],
    })
    if (!('index' in r)) throw new Error('parse failed')
    expect(r.index.maps[0]?.slots).toEqual([[0, 0]])
  })

  it('REFUSES a non-unit --encode instead of misreading it by a power', () => {
    const r = parseLightmapIndex({ ...base, encode: 0.5 })
    expect('error' in r).toBe(true)
    if ('error' in r) expect(r.error).toContain('encode')
  })

  it('accepts an explicit encode of 1, and an index with no encode field', () => {
    expect('index' in parseLightmapIndex({ ...base, encode: 1 })).toBe(true)
    expect('index' in parseLightmapIndex(base)).toBe(true)
  })
})

describe('parseLightmapIndex — the bake `scale`', () => {
  const base = {
    version: 2,
    pass: 'irradiance',
    uv: 'box-atlas-3x2',
    maps: [{ key: 'k1', file: 'a.png', ctx: 'c1' }],
  }

  it('carries a valid scale through', () => {
    const r = parseLightmapIndex({ ...base, scale: 3.3 })
    if (!('index' in r)) throw new Error('parse failed')
    expect(r.index.scale).toBe(3.3)
  })

  it('leaves scale undefined when the index has none — a visibility set is already 0..1', () => {
    const r = parseLightmapIndex(base)
    if (!('index' in r)) throw new Error('parse failed')
    expect(r.index.scale).toBeUndefined()
  })

  it('REFUSES a scale that would blank or invert every surface', () => {
    // 0 blanks the shell, a negative inverts it, NaN makes every texel NaN. None of these
    // should degrade to 1.0, which would misread the map by whatever the real factor was.
    for (const bad of [0, -2, Number.NaN, Number.POSITIVE_INFINITY, '3' as unknown]) {
      const r = parseLightmapIndex({ ...base, scale: bad })
      expect('error' in r, `scale ${String(bad)} should be refused`).toBe(true)
    }
  })
})
