import { beforeEach, describe, expect, it, vi } from 'vitest'
import { resolveFlags } from '../../features/featureFlags'

// Mock the heavy export + persistence so the test asserts the WIRING (composed
// footprint / price / finishTargets reach persistUserGlb), not GLTFExport bytes.
const { persistSpy } = vi.hoisted(() => ({
  persistSpy: vi.fn(async () => ({ ok: true as const, def: { id: 'user-x' } as never })),
}))
vi.mock('../convert/toGlb', () => ({ exportGlb: async () => new ArrayBuffer(8) }))
vi.mock('../upload/persist', () => ({ persistUserGlb: persistSpy }))
// getSurfaceMaterial builds a CanvasTexture (needs a real 2D context) — stub it
// so the object builder runs headless; this test asserts wiring, not pixels.
vi.mock('../../materials/furnitureMaterials', () => ({
  getSurfaceMaterial: () => ({
    clone() {
      return { name: '', dispose() {} }
    },
  }),
}))
// Mock only the GLB loader (SLOT-203) so the bake test is deterministic + offline:
// return a tiny real three Group with one named material, exercising the per-slot
// finish-target namespacing (→ a 'lamp::…' target) + reparent + dispose path
// without a network fetch. The pure helpers stay real (importOriginal).
vi.mock('./gltfSlot', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./gltfSlot')>()
  const { Group, Mesh, BoxGeometry, MeshStandardMaterial } = await import('three')
  return {
    ...actual,
    loadSlotGltfScene: vi.fn(async () => {
      const g = new Group()
      const mat = new MeshStandardMaterial()
      mat.name = 'desk_lamp_arm_01'
      g.add(new Mesh(new BoxGeometry(0.2, 0.9, 0.6), mat))
      return g
    }),
  }
})

import { getConfigurableProduct } from './products'
import { saveConfiguredAsset } from './saveConfigured'

const mattress = getConfigurableProduct('mattress-frame')!

describe('saveConfiguredAsset (SLOT-103)', () => {
  beforeEach(() => persistSpy.mockClear())

  it('persists with the composed footprint, summed price, and finish targets', async () => {
    const res = await saveConfiguredAsset(mattress, { productId: 'mattress-frame', selections: {} })
    expect(res.ok).toBe(true)
    expect(persistSpy).toHaveBeenCalledTimes(1)
    const [file, opts] = persistSpy.mock.calls[0] as unknown as [File, Record<string, unknown>]
    expect(file).toBeInstanceOf(File)
    expect(opts.category).toBe('beds')
    expect(opts.price).toBe(220 + 260 + 150 + 85) // + bedside lamp (SLOT-203, default on)
    const fp = opts.footprint as { w: number; d: number; h: number }
    expect(fp.w).toBeGreaterThan(1.6) // lamp stands to the left of the head
    expect(fp.d).toBeGreaterThanOrEqual(2.1)
    // Procedural groups + the per-slot-namespaced GLB group (SLOT-203).
    expect((opts.finishTargets as { key: string }[]).map((t) => t.key).sort()).toEqual([
      'base:frame',
      'headboard:face',
      'lamp::desk_lamp_arm_01',
      'mattress:cover',
    ])
    // SLOT-204: the recipe rides on the def for later re-editing.
    const recipe = JSON.parse(opts.slotSpec as string)
    expect(recipe.productId).toBe('mattress-frame')
    expect(recipe.selections.mattress).toBe('m-foam')
  })

  it('omitting the headboard drops its finish target + lowers the price', async () => {
    await saveConfiguredAsset(mattress, {
      productId: 'mattress-frame',
      selections: { headboard: null },
    })
    const [, opts] = persistSpy.mock.calls[0] as unknown as [File, Record<string, unknown>]
    expect(opts.price).toBe(220 + 260 + 85) // + bedside lamp (default on)
    expect((opts.finishTargets as { key: string }[]).some((t) => t.key === 'headboard:face')).toBe(
      false,
    )
  })
})

describe('productConfigurator flag (SLOT-104)', () => {
  it('is ON in both Simple and Pro, and not devOnly', () => {
    expect(resolveFlags(false, {}, false, 'simple').productConfigurator).toBe(true)
    expect(resolveFlags(false, {}, false, 'pro').productConfigurator).toBe(true)
    // Prod (isDev=false) keeps it on → prod-safe (not devOnly).
    expect(resolveFlags(false, {}, true, 'pro').productConfigurator).toBe(true)
  })
})
