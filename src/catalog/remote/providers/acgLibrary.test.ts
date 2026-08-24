import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AcgManifestItem } from './acgLibrary'
import { __resetAcgLibraryCache, acgLibrary, entryForItem, normaliseManifest } from './acgLibrary'

// The provider is inert without a backend, so give the module a base to build
// URLs from. `API_BASE` is read at import time from `import.meta.env`.
vi.mock('../../../features/api/client', () => ({
  API_BASE: '/api',
  hasBackend: () => true,
}))

const ITEM: AcgManifestItem = {
  id: 'Wood065',
  name: 'Wood 065',
  family: 'Wood',
  category: 'floor',
  interior: true,
  swatch: '#816043',
  uvScale: [1.2, 1.2],
  files: { albedo: 'albedo.webp', normal: 'normal.webp', rough: 'rough.webp' },
  bytes: 1234,
}

describe('normaliseManifest', () => {
  it('drops items with no albedo — bundleToMaterialDef throws on those', () => {
    const m = normaliseManifest({
      version: 1,
      items: [ITEM, { ...ITEM, id: 'Broken', files: {} }],
    })
    expect(m?.items.map((i) => i.id)).toEqual(['Wood065'])
  })

  it('rejects a malformed manifest rather than surfacing an empty grid', () => {
    expect(normaliseManifest(null)).toBeNull()
    expect(normaliseManifest({ version: 1 })).toBeNull()
  })
})

describe('entryForItem', () => {
  it('keeps the ambientcg provider id so finish ids stay round-trippable', () => {
    // `parseRemoteFinishId` accepts `ambientcg:<slug>:<res>` — a different
    // provider id here would orphan every persisted ambientCG finish.
    const e = entryForItem(ITEM)
    expect(e.provider).toBe('ambientcg')
    expect(e.slug).toBe('Wood065')
    expect(e.attribution).toBe('ambientCG (CC0)')
  })

  it('points the thumbnail at the packed 256px chip, not the full albedo', () => {
    expect(entryForItem(ITEM).thumbUrl).toBe('/api/assets/acg/Wood065/thumb.webp')
  })

  it('tags exterior-only families so an interior tool can filter them out', () => {
    expect(entryForItem(ITEM).tags).toContain('interior')
    expect(entryForItem({ ...ITEM, interior: false }).tags).toContain('exterior')
  })
})

describe('acgLibrary.fetchAsset', () => {
  beforeEach(() => {
    __resetAcgLibraryCache()
    vi.restoreAllMocks()
  })

  const mockFetch = (missing: string[] = []) =>
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.endsWith('acg-index.json')) {
          return { ok: true, json: async () => ({ version: 1, items: [ITEM] }) } as Response
        }
        const bad = missing.some((m) => url.endsWith(m))
        return {
          ok: !bad,
          status: bad ? 404 : 200,
          blob: async () => new Blob(['x']),
        } as unknown as Response
      }),
    )

  it('fetches only the maps the manifest declares', async () => {
    mockFetch()
    const bundle = await acgLibrary.fetchAsset(entryForItem(ITEM), '1k')
    expect(bundle.kind).toBe('material')
    if (bundle.kind !== 'material') return
    // ITEM declares no AO, so no `ao` channel — and no wasted 404 request.
    expect(Object.keys(bundle.channels).sort()).toEqual(['albedo', 'normal', 'roughness'])
  })

  it('loads the manifest on demand when a persisted finish resolves cold', async () => {
    mockFetch()
    // No fetchIndex() call first — this is the reload-rehydration path.
    const bundle = await acgLibrary.fetchAsset(entryForItem(ITEM), '1k')
    expect(bundle.kind).toBe('material')
  })

  it('tolerates a missing optional map but fails loudly on a missing albedo', async () => {
    // Concrete001 / WoodSiding011 genuinely ship with no roughness map.
    mockFetch(['rough.webp'])
    const ok = await acgLibrary.fetchAsset(entryForItem(ITEM), '1k')
    if (ok.kind !== 'material') throw new Error('expected material')
    expect(Object.keys(ok.channels).sort()).toEqual(['albedo', 'normal'])

    __resetAcgLibraryCache()
    mockFetch(['albedo.webp'])
    await expect(acgLibrary.fetchAsset(entryForItem(ITEM), '1k')).rejects.toThrow(/albedo/)
  })
})
