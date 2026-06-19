import { beforeEach, describe, expect, it, vi } from 'vitest'
import 'fake-indexeddb/auto'
import { useStore } from '../store'
import { hydrateUserAssets } from './hydrateAssets'
import { IdbAssetStore } from './IdbAssetStore'

/** Seed one user-material channel record into IDB. `meta` is spread last so a
 *  test can omit identity fields to simulate a legacy (pre-BUG-003) record. */
async function seedChannel(
  matId: string,
  role: 'albedo' | 'normal' | 'roughness' | 'ao',
  meta: Record<string, string | number | boolean | undefined>,
): Promise<void> {
  await IdbAssetStore.put({
    assetId: `${matId}-${role}`,
    kind: 'texture',
    mime: 'image/webp',
    name: `${role}.webp`,
    uploadedAt: '2026-06-19T00:00:00Z',
    blob: new Blob([new Uint8Array([1, 2, 3])], { type: 'image/webp' }),
    meta: { matId, role, ...meta },
  })
}

describe('hydrateUserAssets — material identity round-trip (BUG-003)', () => {
  beforeEach(async () => {
    for (const a of await IdbAssetStore.list()) await IdbAssetStore.delete(a.assetId)
    useStore.getState().setUserMaterials([])
    useStore.getState().setUserFurniture([])
    // fake-indexeddb returns a plain object after the structured-clone roundtrip,
    // so happy-dom's URL.createObjectURL would reject it. The URL value itself is
    // not asserted on here.
    vi.stubGlobal('URL', { ...URL, createObjectURL: () => 'blob:test' })
  })

  it('restores name/category/uvScale/swatch from persisted meta', async () => {
    const matId = 'user-abc'
    const identity = {
      name: 'Réclaimed Oak ™ <floor>',
      category: 'wall' as const,
      swatch: '#a0522d',
      uvScaleX: 2.5,
      uvScaleY: 0.75,
    }
    await seedChannel(matId, 'albedo', identity)
    await seedChannel(matId, 'normal', identity)

    await hydrateUserAssets()

    const mats = useStore.getState().userMaterials
    expect(mats).toHaveLength(1)
    const m = mats[0]
    expect(m.id).toBe(matId)
    expect(m.name).toBe('Réclaimed Oak ™ <floor>')
    expect(m.category).toBe('wall')
    expect(m.swatch).toBe('#a0522d')
    expect(m.uvScale).toEqual([2.5, 0.75])
    expect(m.textures.albedo).toBe(`${matId}-albedo`)
    expect(m.textures.normal).toBe(`${matId}-normal`)
  })

  it('falls back to sane defaults for a legacy record missing the new fields', async () => {
    const matId = 'user-legacy'
    // Pre-BUG-003 record: only matId + role were persisted.
    await seedChannel(matId, 'albedo', {})

    await expect(hydrateUserAssets()).resolves.not.toThrow()

    const mats = useStore.getState().userMaterials
    expect(mats).toHaveLength(1)
    const m = mats[0]
    expect(m.id).toBe(matId)
    expect(m.name).toBe(matId.slice(0, 8))
    expect(m.category).toBe('floor')
    expect(m.swatch).toBe('#cccccc')
    expect(m.uvScale).toEqual([1, 1])
  })

  it('handles a material with only an albedo channel (no swatch persisted)', async () => {
    const matId = 'user-albedo-only'
    await seedChannel(matId, 'albedo', {
      name: 'Bare',
      category: 'floor',
      uvScaleX: 1,
      uvScaleY: 1,
    })

    await hydrateUserAssets()

    const m = useStore.getState().userMaterials[0]
    expect(m.name).toBe('Bare')
    expect(m.swatch).toBe('#cccccc')
    expect(m.textures.normal).toBeUndefined()
  })

  it('ignores partial/garbage uvScale and uses default', async () => {
    const matId = 'user-bad-uv'
    // Only X persisted, Y missing → both should default rather than yield NaN.
    await seedChannel(matId, 'albedo', { name: 'Half', uvScaleX: 3 })

    await hydrateUserAssets()

    expect(useStore.getState().userMaterials[0].uvScale).toEqual([1, 1])
  })

  it('hydrates multiple uploaded materials independently', async () => {
    await seedChannel('user-1', 'albedo', { name: 'One', category: 'floor', swatch: '#111111' })
    await seedChannel('user-2', 'albedo', { name: 'Two', category: 'wall', swatch: '#222222' })

    await hydrateUserAssets()

    const byId = new Map(useStore.getState().userMaterials.map((m) => [m.id, m]))
    expect(byId.get('user-1')?.name).toBe('One')
    expect(byId.get('user-1')?.category).toBe('floor')
    expect(byId.get('user-2')?.name).toBe('Two')
    expect(byId.get('user-2')?.category).toBe('wall')
    expect(byId.get('user-2')?.swatch).toBe('#222222')
  })
})
