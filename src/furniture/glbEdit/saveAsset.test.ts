import { Group } from 'three'
import { describe, expect, it, vi } from 'vitest'
import type { UserGltfDef } from '../types'
import type { PersistOptions, PersistResult } from '../upload/persist'
import { addPart, createEmptySpec, updatePart } from './editSpec'
import { buildOverwriteDef, exportAndSaveAsset, placementFlags } from './saveAsset'
import { parseAssetSpec } from './specPersist'

// Mock the export + persist deps so we can exercise exportAndSaveAsset's spec
// plumbing without a GPU / IndexedDB.
const persistCalls: PersistOptions[] = []
vi.mock('../convert/toGlb', () => ({
  exportGlb: vi.fn(async () => new ArrayBuffer(8)),
}))
vi.mock('../upload/persist', () => ({
  persistUserGlb: vi.fn(async (_file: File, opts: PersistOptions): Promise<PersistResult> => {
    persistCalls.push(opts)
    const def: UserGltfDef = {
      id: 'user-fresh',
      name: opts.name,
      category: opts.category,
      kind: 'gltf',
      source: 'user',
      assetId: 'asset-fresh',
      uploadedAt: '2026-07-16T00:00:00.000Z',
      defaultFootprint: { w: 1, d: 1, h: 1 },
      runtimeUrl: 'blob:fresh',
      // Mirror persist.ts: the assetSpec option lands on the def.
      ...(opts.assetSpec ? { assetSpec: opts.assetSpec } : {}),
    }
    return { ok: true, def }
  }),
}))
vi.mock('../../state/store', () => ({
  useStore: { getState: () => ({ userFurniture: [] }) },
}))

describe('placementFlags', () => {
  it('floor → no special flags', () => {
    expect(placementFlags('floor')).toEqual({})
  })
  it('wall → mounted (skips wall-body collision)', () => {
    expect(placementFlags('wall')).toEqual({ mounted: true })
  })
  it('floor-covering → noClip (rug-style, never blocks)', () => {
    expect(placementFlags('floorCovering')).toEqual({ noClip: true })
  })
})

describe('buildOverwriteDef', () => {
  const fresh: UserGltfDef = {
    id: 'user-new-asset',
    name: 'fresh',
    category: 'others',
    kind: 'gltf',
    source: 'user',
    assetId: 'asset-new',
    uploadedAt: '2026-06-10T00:00:00.000Z',
    defaultFootprint: { w: 1, d: 2, h: 0.5 },
    runtimeUrl: 'blob:new',
  }

  it('re-homes the fresh def under the existing id, keeping its new blob/footprint', () => {
    const def = buildOverwriteDef(fresh, 'user-original', 'My chair', 'seating')
    // Placed instances reference the original id — it must be preserved.
    expect(def.id).toBe('user-original')
    // …but the geometry/blob is the freshly-exported one.
    expect(def.assetId).toBe('asset-new')
    expect(def.runtimeUrl).toBe('blob:new')
    expect(def.defaultFootprint).toEqual({ w: 1, d: 2, h: 0.5 })
    // …with the chosen name + category.
    expect(def.name).toBe('My chair')
    expect(def.category).toBe('seating')
  })

  it('falls back to a default name when blank', () => {
    expect(buildOverwriteDef(fresh, 'id', '   ', 'others').name).toBe('Custom asset')
  })
})

describe('exportAndSaveAsset — spec persistence round-trip (Asset Studio S0)', () => {
  it('embeds the edit spec so the saved def re-opens to an identical spec', async () => {
    persistCalls.length = 0
    let spec = createEmptySpec()
    spec = addPart(spec, 'box')
    spec = updatePart(spec, spec.parts[0].id, { size: [1, 0.5, 0.4], color: '#c0ffee' })

    const res = await exportAndSaveAsset(new Group(), 'Designed Box', 'others', {}, undefined, spec)
    expect(res.ok).toBe(true)

    // The spec travelled as a versioned JSON string through the persist option…
    expect(persistCalls).toHaveLength(1)
    const stored = persistCalls[0].assetSpec
    expect(typeof stored).toBe('string')
    // …onto the def's props, and reopening parses it back to the identical spec.
    const def = (res as { ok: true; def: UserGltfDef }).def
    expect(def.assetSpec).toBe(stored)
    expect(parseAssetSpec(def.assetSpec)).toEqual(spec)
  })

  it('stores no spec when none is supplied (legacy / non-designer saves unchanged)', async () => {
    persistCalls.length = 0
    const res = await exportAndSaveAsset(new Group(), 'Plain', 'others', {})
    expect(res.ok).toBe(true)
    expect(persistCalls[0].assetSpec).toBeUndefined()
    expect((res as { ok: true; def: UserGltfDef }).def.assetSpec).toBeUndefined()
  })
})
