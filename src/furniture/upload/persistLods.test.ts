import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import 'fake-indexeddb/auto'
import { hydrateUserAssets } from '../../state/storage/hydrateAssets'
import { IdbAssetStore } from '../../state/storage/IdbAssetStore'
import { useStore } from '../../state/store'
import { __resetLodCacheForTest, lodAssetId, resolveLodUrlSync } from '../gltf/lod'
import { persistUserGlb } from './persist'

const duckBytes = readFileSync(
  resolve(__dirname, '../../../scripts/asset-pipeline/__tests__/fixtures/duck.glb'),
)

let seq = 0
function glbFile(name: string): File {
  // Unique trailing bytes so the content-hash dedupe never collapses fixtures.
  return new File([new Uint8Array(duckBytes), `#${seq++}`], name, { type: 'model/gltf-binary' })
}

describe('persistUserGlb with LOD variants', () => {
  beforeEach(async () => {
    for (const a of await IdbAssetStore.list()) await IdbAssetStore.delete(a.assetId)
    useStore.getState().setUserFurniture([])
    __resetLodCacheForTest()
    let urlSeq = 0
    vi.stubGlobal('URL', { ...URL, createObjectURL: () => `blob:test-${urlSeq++}` })
  })

  it('stores tier siblings under derived keys with role/tier/base meta', async () => {
    const r = await persistUserGlb(glbFile('sofa.glb'), {
      name: 'Sofa',
      category: 'seating',
      lods: { low: new Uint8Array([1, 2, 3]), medium: new Uint8Array([4, 5, 6, 7]) },
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const lowRec = await IdbAssetStore.get(lodAssetId(r.def.assetId, 'low'))
    const medRec = await IdbAssetStore.get(lodAssetId(r.def.assetId, 'medium'))
    expect(lowRec?.meta).toMatchObject({ role: 'lod', tier: 'low', baseAssetId: r.def.assetId })
    expect(medRec?.meta).toMatchObject({ role: 'lod', tier: 'medium', baseAssetId: r.def.assetId })
    // (fake-indexeddb structured-clones Blobs to plain objects, so size is not
    // assertable here — presence + meta is the contract under test.)
    expect(lowRec?.kind).toBe('gltf')
    expect(medRec?.kind).toBe('gltf')
  })

  it('registers runtime variant urls so tier selection routes to them', async () => {
    const r = await persistUserGlb(glbFile('lamp.glb'), {
      name: 'Lamp',
      category: 'lighting',
      lods: { low: new Uint8Array([9]) },
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const base = r.def.runtimeUrl
    expect(base).toBeTruthy()
    if (!base) return
    expect(resolveLodUrlSync(base, 'low')).not.toBe(base)
    expect(resolveLodUrlSync(base, 'medium')).toBe(base) // tier not generated
    expect(resolveLodUrlSync(base, 'high')).toBe(base)
  })

  it('persists without tiers when none are provided (lods optional)', async () => {
    const r = await persistUserGlb(glbFile('plain.glb'), { name: 'Plain', category: 'decor' })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(await IdbAssetStore.get(lodAssetId(r.def.assetId, 'low'))).toBeNull()
    const base = r.def.runtimeUrl
    if (base) expect(resolveLodUrlSync(base, 'low')).toBe(base)
  })

  it('hydration skips LOD records as defs and re-registers tier routing', async () => {
    const r = await persistUserGlb(glbFile('chair.glb'), {
      name: 'Chair',
      category: 'seating',
      lods: { low: new Uint8Array([1]), medium: new Uint8Array([2]) },
    })
    expect(r.ok).toBe(true)
    // Simulate a fresh boot: empty store + cleared (session-scoped) registry.
    useStore.getState().setUserFurniture([])
    __resetLodCacheForTest()
    await hydrateUserAssets()
    const defs = useStore.getState().userFurniture
    // The two tier records must NOT surface as their own catalog entries.
    expect(defs).toHaveLength(1)
    expect(defs[0].name).toBe('Chair')
    const base = defs[0].source === 'user' ? defs[0].runtimeUrl : undefined
    expect(base).toBeTruthy()
    if (!base) return
    expect(resolveLodUrlSync(base, 'low')).not.toBe(base)
    expect(resolveLodUrlSync(base, 'medium')).not.toBe(base)
  })

  it('removing the def deletes its tier siblings from IDB', async () => {
    const r = await persistUserGlb(glbFile('bin.glb'), {
      name: 'Bin',
      category: 'storage',
      lods: { low: new Uint8Array([1]) },
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    vi.stubGlobal('URL', { ...URL, revokeObjectURL: () => {} })
    useStore.getState().removeUserFurniture(r.def.id)
    // IDB deletes are fire-and-forget; flush them.
    await new Promise((res) => setTimeout(res, 50))
    expect(await IdbAssetStore.get(r.def.assetId)).toBeNull()
    expect(await IdbAssetStore.get(lodAssetId(r.def.assetId, 'low'))).toBeNull()
  })
})
