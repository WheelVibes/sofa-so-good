import { beforeEach, describe, expect, it, vi } from 'vitest'
import 'fake-indexeddb/auto'
import { hydrateUserAssets } from '../../state/storage/hydrateAssets'
import { IdbAssetStore } from '../../state/storage/IdbAssetStore'
import { useStore } from '../../state/store'

// Avoid real image decode/re-encode (createImageBitmap is unavailable in the
// test env). The validator + normalizer are exercised in their own tests; here
// we only care that persistUserMaterial writes the identity meta and that it
// round-trips through hydrateUserAssets (BUG-003).
vi.mock('../convert/reencode', () => ({
  normalizeTextureFile: async (f: File) => f,
}))
vi.mock('./validate', () => ({
  validateImageFile: async () => ({ ok: true, mime: 'image/webp', width: 8, height: 8 }),
}))

import { persistUserMaterial } from './persist'

function pngFile(name: string): File {
  return new File([new Uint8Array([1, 2, 3, 4])], name, { type: 'image/webp' })
}

describe('persistUserMaterial → hydrateUserAssets round-trip (BUG-003)', () => {
  beforeEach(async () => {
    for (const a of await IdbAssetStore.list()) await IdbAssetStore.delete(a.assetId)
    useStore.getState().setUserMaterials([])
    useStore.getState().setUserFurniture([])
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: () => 'blob:test',
      revokeObjectURL: () => {},
    })
  })

  it('persists all identity fields so they survive a re-hydrate', async () => {
    const res = await persistUserMaterial(
      { albedo: pngFile('a.webp'), normal: pngFile('n.webp') },
      { name: '  Walnut Plank  ', category: 'wall', uvScale: [3, 0.5], swatch: '#5b3a1a' },
    )
    expect(res.ok).toBe(true)

    // The in-memory def trims the name.
    if (res.ok) expect(res.def.name).toBe('Walnut Plank')

    // Drop the freshly-added def, then rebuild purely from IDB.
    useStore.getState().setUserMaterials([])
    await hydrateUserAssets()

    const mats = useStore.getState().userMaterials
    expect(mats).toHaveLength(1)
    const m = mats[0]
    expect(m.name).toBe('Walnut Plank')
    expect(m.category).toBe('wall')
    expect(m.swatch).toBe('#5b3a1a')
    expect(m.uvScale).toEqual([3, 0.5])
    expect(m.source).toBe('user')
    expect(m.textures.normal).toBeDefined()
  })
})
