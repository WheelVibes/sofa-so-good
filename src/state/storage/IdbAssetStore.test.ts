/**
 * TEST-3: IdbAssetStore (`put`/`get`/`list`/`delete`/`usage`) — the foundation
 * of all user-asset persistence (GLBs, texture images). Previously untested.
 * fake-indexeddb is globally installed in setupTests.ts, so no per-file
 * environment pragma or import is needed here.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { IdbAssetStore } from './IdbAssetStore'

async function clearIdb(): Promise<void> {
  for (const a of await IdbAssetStore.list()) await IdbAssetStore.delete(a.assetId)
}

function makeBlob(bytes: number[], type: string): Blob {
  return new Blob([new Uint8Array(bytes)], { type })
}

describe('IdbAssetStore', () => {
  beforeEach(async () => {
    await clearIdb()
  })

  describe('put / get', () => {
    it('round-trips the blob + meta faithfully', async () => {
      const blob = makeBlob([1, 2, 3, 4], 'model/gltf-binary')
      await IdbAssetStore.put({
        assetId: 'asset-1',
        kind: 'gltf',
        mime: 'model/gltf-binary',
        name: 'Chair.glb',
        uploadedAt: '2026-06-19T00:00:00Z',
        blob,
        meta: { category: 'seating', price: 129.5, noClip: true },
      })

      const rec = await IdbAssetStore.get('asset-1')
      expect(rec).not.toBeNull()
      expect(rec?.assetId).toBe('asset-1')
      expect(rec?.kind).toBe('gltf')
      expect(rec?.mime).toBe('model/gltf-binary')
      expect(rec?.name).toBe('Chair.glb')
      expect(rec?.uploadedAt).toBe('2026-06-19T00:00:00Z')
      expect(rec?.meta).toEqual({ category: 'seating', price: 129.5, noClip: true })
      expect(rec?.blob.size).toBe(4)
      expect(rec?.blob.type).toBe('model/gltf-binary')
    })

    it('round-trips a record with no meta field', async () => {
      const blob = makeBlob([9, 9], 'image/webp')
      await IdbAssetStore.put({
        assetId: 'asset-nometa',
        kind: 'texture',
        mime: 'image/webp',
        name: 'tex.webp',
        uploadedAt: '2026-06-19T00:00:00Z',
        blob,
      })
      const rec = await IdbAssetStore.get('asset-nometa')
      expect(rec?.meta).toBeUndefined()
    })

    it('a second put with the same assetId overwrites (put semantics, not add)', async () => {
      await IdbAssetStore.put({
        assetId: 'asset-ovr',
        kind: 'gltf',
        mime: 'model/gltf-binary',
        name: 'v1',
        uploadedAt: '2026-06-19T00:00:00Z',
        blob: makeBlob([1], 'model/gltf-binary'),
      })
      await IdbAssetStore.put({
        assetId: 'asset-ovr',
        kind: 'gltf',
        mime: 'model/gltf-binary',
        name: 'v2',
        uploadedAt: '2026-06-20T00:00:00Z',
        blob: makeBlob([1, 2, 3], 'model/gltf-binary'),
      })
      const rec = await IdbAssetStore.get('asset-ovr')
      expect(rec?.name).toBe('v2')
      expect(rec?.blob.size).toBe(3)
      const all = await IdbAssetStore.list()
      expect(all).toHaveLength(1)
    })

    it('get of a missing id resolves to null', async () => {
      const rec = await IdbAssetStore.get('does-not-exist')
      expect(rec).toBeNull()
    })
  })

  describe('list', () => {
    it('returns meta for every record WITHOUT the blob payload', async () => {
      await IdbAssetStore.put({
        assetId: 'asset-a',
        kind: 'gltf',
        mime: 'model/gltf-binary',
        name: 'A',
        uploadedAt: '2026-06-19T00:00:00Z',
        blob: makeBlob([1, 2, 3], 'model/gltf-binary'),
        meta: { category: 'decor' },
      })
      await IdbAssetStore.put({
        assetId: 'asset-b',
        kind: 'texture',
        mime: 'image/webp',
        name: 'B',
        uploadedAt: '2026-06-20T00:00:00Z',
        blob: makeBlob([1, 2, 3, 4, 5], 'image/webp'),
      })

      const list = await IdbAssetStore.list()
      expect(list).toHaveLength(2)
      const a = list.find((m) => m.assetId === 'asset-a')
      const b = list.find((m) => m.assetId === 'asset-b')
      expect(a).toBeDefined()
      expect(b).toBeDefined()
      // Meta shape carries `size` derived from the blob, but not the blob itself.
      expect(a?.size).toBe(3)
      expect(b?.size).toBe(5)
      expect(a?.name).toBe('A')
      expect(a?.meta).toEqual({ category: 'decor' })
      for (const m of list) {
        expect(m).not.toHaveProperty('blob')
      }
    })

    it('returns an empty array when the store is empty', async () => {
      const list = await IdbAssetStore.list()
      expect(list).toEqual([])
    })
  })

  describe('delete', () => {
    it('removes only the target id, leaving others intact', async () => {
      await IdbAssetStore.put({
        assetId: 'keep-1',
        kind: 'gltf',
        mime: 'model/gltf-binary',
        name: 'Keep1',
        uploadedAt: '2026-06-19T00:00:00Z',
        blob: makeBlob([1], 'model/gltf-binary'),
      })
      await IdbAssetStore.put({
        assetId: 'remove-me',
        kind: 'gltf',
        mime: 'model/gltf-binary',
        name: 'Remove',
        uploadedAt: '2026-06-19T00:00:00Z',
        blob: makeBlob([1], 'model/gltf-binary'),
      })
      await IdbAssetStore.put({
        assetId: 'keep-2',
        kind: 'texture',
        mime: 'image/webp',
        name: 'Keep2',
        uploadedAt: '2026-06-19T00:00:00Z',
        blob: makeBlob([1], 'image/webp'),
      })

      await IdbAssetStore.delete('remove-me')

      expect(await IdbAssetStore.get('remove-me')).toBeNull()
      expect(await IdbAssetStore.get('keep-1')).not.toBeNull()
      expect(await IdbAssetStore.get('keep-2')).not.toBeNull()
      const ids = (await IdbAssetStore.list()).map((m) => m.assetId).sort()
      expect(ids).toEqual(['keep-1', 'keep-2'])
    })

    it('deleting a non-existent id is a no-op (does not throw)', async () => {
      await expect(IdbAssetStore.delete('never-existed')).resolves.toBeUndefined()
    })
  })

  describe('usage', () => {
    it('reports zero count/bytes on an empty store', async () => {
      expect(await IdbAssetStore.usage()).toEqual({ count: 0, bytes: 0 })
    })

    it('sums byte sizes + counts correctly across multiple puts', async () => {
      await IdbAssetStore.put({
        assetId: 'u1',
        kind: 'gltf',
        mime: 'model/gltf-binary',
        name: 'u1',
        uploadedAt: '2026-06-19T00:00:00Z',
        blob: makeBlob(new Array(10).fill(0), 'model/gltf-binary'),
      })
      await IdbAssetStore.put({
        assetId: 'u2',
        kind: 'texture',
        mime: 'image/webp',
        name: 'u2',
        uploadedAt: '2026-06-19T00:00:00Z',
        blob: makeBlob(new Array(25).fill(0), 'image/webp'),
      })
      await IdbAssetStore.put({
        assetId: 'u3',
        kind: 'gltf',
        mime: 'model/gltf-binary',
        name: 'u3',
        uploadedAt: '2026-06-19T00:00:00Z',
        blob: makeBlob(new Array(7).fill(0), 'model/gltf-binary'),
      })

      expect(await IdbAssetStore.usage()).toEqual({ count: 3, bytes: 10 + 25 + 7 })
    })

    it('reflects a delete in a later usage() call', async () => {
      await IdbAssetStore.put({
        assetId: 'ud1',
        kind: 'gltf',
        mime: 'model/gltf-binary',
        name: 'ud1',
        uploadedAt: '2026-06-19T00:00:00Z',
        blob: makeBlob(new Array(20).fill(0), 'model/gltf-binary'),
      })
      await IdbAssetStore.put({
        assetId: 'ud2',
        kind: 'gltf',
        mime: 'model/gltf-binary',
        name: 'ud2',
        uploadedAt: '2026-06-19T00:00:00Z',
        blob: makeBlob(new Array(5).fill(0), 'model/gltf-binary'),
      })
      await IdbAssetStore.delete('ud1')
      expect(await IdbAssetStore.usage()).toEqual({ count: 1, bytes: 5 })
    })
  })
})
