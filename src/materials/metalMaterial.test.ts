import { MeshPhysicalMaterial, MeshStandardMaterial } from 'three'
import { beforeAll, describe, expect, it, vi } from 'vitest'

/**
 * MAT-004 — the brushed-metal upgrade in `getMetalMaterial` is gated behind
 * `pbrSurfaces`, the realism flag (the same gate as the other material
 * micro-normals). CLAUDE.md hard rule: any `pbrSurfaces`-gated behaviour is
 * tested in BOTH states — the physical+anisotropy+brush-maps look when on, the
 * legacy plain metalness/roughness (no maps) when off.
 *
 * `getBrushedMetalMaps` memoises its singleton, so each state runs in a freshly
 * reset module with `isFeatureEnabled` mocked. happy-dom has no real 2D canvas
 * context, so we stub a minimal `createImageData`/`putImageData` (as the
 * MAT-001 stone-drift test does) so `canvasFrom` runs.
 */
beforeAll(() => {
  const ctx = {
    createImageData: (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4) }),
    putImageData: () => {},
  }
  // biome-ignore lint/suspicious/noExplicitAny: minimal 2D-context stub for the test env.
  HTMLCanvasElement.prototype.getContext = (() => ctx) as any
})

async function loadWithFlag(pbrOn: boolean) {
  vi.resetModules()
  vi.doMock('../features/featureFlags', () => ({
    isFeatureEnabled: (flag: string) => (flag === 'pbrSurfaces' ? pbrOn : false),
  }))
  return import('./furnitureMaterials')
}

describe('getMetalMaterial brushed-metal gating (MAT-004, both modes)', () => {
  it('Pro/realism on (pbrSurfaces) → a physical material with brush maps + anisotropy', async () => {
    const { getMetalMaterial } = await loadWithFlag(true)
    const m = getMetalMaterial('#d8dade', 'stainless')
    expect(m).toBeInstanceOf(MeshPhysicalMaterial)
    expect(m.normalMap, 'expected a brushed-metal normal map under pbrSurfaces').not.toBeNull()
    expect(m.roughnessMap, 'expected a brushed roughness-streak map').not.toBeNull()
    expect((m as MeshPhysicalMaterial).anisotropy).toBeGreaterThan(0)
    expect((m as MeshPhysicalMaterial).anisotropyRotation).toBe(0)
    expect(m.metalness).toBeGreaterThan(0.8)
  })

  it('Simple/realism off → plain MeshStandardMaterial, no brush maps', async () => {
    const { getMetalMaterial } = await loadWithFlag(false)
    const m = getMetalMaterial('#d8dade', 'stainless')
    expect(m).toBeInstanceOf(MeshStandardMaterial)
    expect(m).not.toBeInstanceOf(MeshPhysicalMaterial)
    expect(m.normalMap, 'no brush normal map when pbrSurfaces is off').toBeNull()
    expect(m.roughnessMap, 'no brush roughness map when pbrSurfaces is off').toBeNull()
    // Still reads as metal: high metalness, low-ish roughness.
    expect(m.metalness).toBeGreaterThan(0.8)
  })

  it('caches per (finish, color, repeat) — same params return the same instance', async () => {
    const { getMetalMaterial } = await loadWithFlag(true)
    expect(getMetalMaterial('#cfd2d6', 'stainless')).toBe(getMetalMaterial('#cfd2d6', 'stainless'))
    // Different finish / colour / repeat → distinct instances.
    expect(getMetalMaterial('#cfd2d6', 'stainless')).not.toBe(
      getMetalMaterial('#cfd2d6', 'black-steel'),
    )
    expect(getMetalMaterial('#cfd2d6', 'stainless')).not.toBe(
      getMetalMaterial('#222426', 'stainless'),
    )
  })

  it('black-steel vs stainless differ in roughness/metalness preset (both physical)', async () => {
    const { getMetalMaterial } = await loadWithFlag(true)
    const stainless = getMetalMaterial('#d8dade', 'stainless')
    const black = getMetalMaterial('#26282b', 'black-steel')
    expect(stainless).toBeInstanceOf(MeshPhysicalMaterial)
    expect(black).toBeInstanceOf(MeshPhysicalMaterial)
    expect(black.roughness).toBeGreaterThan(stainless.roughness)
  })
})
