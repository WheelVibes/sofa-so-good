import { describe, expect, it } from 'vitest'
import { displayName, familyOf, fetchDimensions, tileSizeFor } from './pack-ambientcg.mjs'

describe('familyOf', () => {
  it('takes the leading letter run as the family', () => {
    expect(familyOf('Wood065')).toBe('Wood')
    expect(familyOf('WoodFloor008')).toBe('WoodFloor')
    expect(familyOf('PavingStones115B')).toBe('PavingStones')
  })

  it('keeps a variant suffix out of the family', () => {
    // `Metal048C` and `Metal048` are the same family, different scans.
    expect(familyOf('Metal048C')).toBe('Metal')
    expect(familyOf('Concrete044B')).toBe('Concrete')
  })
})

describe('displayName', () => {
  it('splits the CamelCase family and keeps the asset number', () => {
    expect(displayName('WoodFloor008')).toBe('Wood Floor 008')
    expect(displayName('PaintedPlaster018')).toBe('Painted Plaster 018')
    expect(displayName('Wood065')).toBe('Wood 065')
  })

  it('preserves a variant letter', () => {
    expect(displayName('Metal048C')).toBe('Metal 048C')
  })
})

describe('tileSizeFor — the scanned size beats the family guess', () => {
  const family = { category: 'floor', uvScale: [1.2, 1.2], interior: true }

  it('uses the real scanned size when ambientCG records one', () => {
    // Wood066 is a 0.4 m patch; the family table said 1.2 m, which stretched
    // every texel over 3x the floor (blurry, planks 3x too wide).
    const dims = new Map([['Wood066', 0.4]])
    expect(tileSizeFor('Wood066', family, dims)).toEqual({
      uvScale: [0.4, 0.4],
      uvScaleSource: 'scan',
    })
  })

  it('falls back to the family guess when the asset has no dimension', () => {
    expect(tileSizeFor('Wood999', family, new Map())).toEqual({
      uvScale: [1.2, 1.2],
      uvScaleSource: 'family',
    })
    expect(tileSizeFor('Wood999', family, undefined).uvScaleSource).toBe('family')
  })

  it('clamps a nonsense dimension rather than writing it into a UV', () => {
    expect(tileSizeFor('X', family, new Map([['X', 0.001]])).uvScale[0]).toBe(0.1)
    expect(tileSizeFor('X', family, new Map([['X', 40]])).uvScale[0]).toBe(8)
  })
})

describe('fetchDimensions', () => {
  const page = (assets, n = 100) => ({
    ok: true,
    json: async () => ({ foundAssets: assets.concat(Array(n - assets.length).fill({})) }),
  })

  it('collects centimetre dimensions as metres, skipping unrecorded ones', async () => {
    const fetchImpl = async () => ({
      ok: true,
      json: async () => ({
        foundAssets: [
          { assetId: 'Ground110', dimensionX: 210 },
          { assetId: 'NoDims', dimensionX: 0 },
          { assetId: 'Missing' },
        ],
      }),
    })
    const dims = await fetchDimensions(fetchImpl, () => {})
    expect(dims.get('Ground110')).toBeCloseTo(2.1, 6)
    expect(dims.has('NoDims')).toBe(false)
    expect(dims.has('Missing')).toBe(false)
  })

  it('pages until a short page comes back', async () => {
    let calls = 0
    const fetchImpl = async () => {
      calls++
      return calls === 1
        ? page([{ assetId: 'A1', dimensionX: 100 }])
        : { ok: true, json: async () => ({ foundAssets: [{ assetId: 'B1', dimensionX: 50 }] }) }
    }
    const dims = await fetchDimensions(fetchImpl, () => {})
    expect(calls).toBe(2)
    expect(dims.get('B1')).toBeCloseTo(0.5, 6)
  })

  it('degrades to the family table instead of failing the pack run', async () => {
    const dims = await fetchDimensions(
      async () => ({ ok: false, status: 503 }),
      () => {},
    )
    expect(dims.size).toBe(0)
  })
})

describe('tileSizeFor — a tile is never bigger than its map can cover', () => {
  const family = { category: 'floor', uvScale: [2.2, 2.2], interior: true }

  it('caps a family guess by the map resolution', () => {
    // 2.2 m of concrete from a 1K map is 465 px/m — soft. 2 m is the most a
    // 1024 px map covers at the target density.
    expect(tileSizeFor('Concrete001', family, new Map(), 1024)).toEqual({
      uvScale: [2, 2],
      uvScaleSource: 'density',
    })
  })

  it('leaves a guess alone when the map can cover it', () => {
    expect(tileSizeFor('Concrete001', family, new Map(), 4096).uvScaleSource).toBe('family')
  })

  it('lets a real scanned size stand even past the density cap', () => {
    // Reality beats sharpness — a 2.45 m scan really is 2.45 m.
    expect(tileSizeFor('Tiles087', family, new Map([['Tiles087', 2.45]]), 1024)).toEqual({
      uvScale: [2.45, 2.45],
      uvScaleSource: 'scan',
    })
  })
})
