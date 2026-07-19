// @vitest-environment happy-dom
import { MeshPhysicalMaterial, MeshStandardMaterial } from 'three'
import { beforeAll, describe, expect, it, vi } from 'vitest'

/**
 * CAT-A furniture-material additions:
 *  - `getBoucleMaterial` — nubby looped-wool "quiet luxury" upholstery
 *  - `getSurfaceMaterial('sintered')` — porcelain-slab worktop (satin stone)
 *  - `getSurfaceMaterial('brass')` / the `brushed-brass` MetalFinish — brushed gold hardware
 *
 * happy-dom has no real 2D canvas, so (as MAT-004 / vinylMaterial tests do) we
 * stub minimal `createImageData`/`putImageData` so the shared micro-normals bake.
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

describe('getBoucleMaterial (nubby bouclé upholstery)', () => {
  for (const pbr of [true, false]) {
    it(`is a physical cloth carrying the nub normal (pbrSurfaces=${pbr})`, async () => {
      const { getBoucleMaterial } = await loadWithFlag(pbr)
      const m = getBoucleMaterial('#d8d2c4')
      expect(m).toBeInstanceOf(MeshPhysicalMaterial)
      // The nub relief IS the material — the normal map is kept on ALL tiers.
      expect(m.normalMap, 'expected the nubby loop normal').not.toBeNull()
      expect(m.roughness).toBeGreaterThan(0.8) // matte wool
      expect(m.metalness).toBe(0)
    })
  }

  it('caches per (colour, rough, repeat)', async () => {
    const { getBoucleMaterial } = await loadWithFlag(true)
    expect(getBoucleMaterial('#d8d2c4')).toBe(getBoucleMaterial('#d8d2c4'))
    expect(getBoucleMaterial('#d8d2c4')).not.toBe(getBoucleMaterial('#333333'))
  })

  it('reads distinctly from plain fabric and velvet at the same colour', async () => {
    const { getBoucleMaterial, getFabricMaterial, getVelvetMaterial } = await loadWithFlag(true)
    const c = '#c9c2b2'
    const roughs = new Set([
      getBoucleMaterial(c).roughness,
      getFabricMaterial(c).roughness,
      getVelvetMaterial(c).roughness,
    ])
    expect(roughs.size).toBe(3)
  })

  it('is selectable via getUpholsteryMaterial("boucle")', async () => {
    const { getUpholsteryMaterial, getBoucleMaterial } = await loadWithFlag(true)
    expect(getUpholsteryMaterial('boucle', '#d8d2c4')).toBe(getBoucleMaterial('#d8d2c4'))
  })
})

describe('sintered-stone worktop (getSurfaceMaterial "sintered")', () => {
  it('is a satin stone slab — matter than mirror-marble, glossier than concrete', async () => {
    const { getSurfaceMaterial } = await loadWithFlag(true)
    const sintered = getSurfaceMaterial('sintered', '#2c2f34', 1.4)
    const marble = getSurfaceMaterial('marble', '#2c2f34', 1.4)
    const concrete = getSurfaceMaterial('concrete', '#2c2f34', 1.4)
    expect(sintered.map, 'expected the stone albedo').not.toBeNull()
    expect(sintered.roughness).toBeGreaterThan(marble.roughness)
    expect(sintered.roughness).toBeLessThan(concrete.roughness)
  })
})

describe('brushed-brass hardware (getMetalMaterial / getSurfaceMaterial "brass")', () => {
  it('brushed-brass preset is fully metallic with a satin brushed sheen', async () => {
    const { getMetalMaterial } = await loadWithFlag(true)
    const m = getMetalMaterial('#b8923f', 'brushed-brass')
    expect(m).toBeInstanceOf(MeshPhysicalMaterial)
    expect(m.metalness).toBeCloseTo(0.95, 2)
    expect((m as MeshPhysicalMaterial).anisotropy).toBeGreaterThan(0)
    expect(m.normalMap, 'expected the brush hairline normal').not.toBeNull()
  })

  it('flat tier → plain metal, no brush maps (both modes tested)', async () => {
    const { getMetalMaterial } = await loadWithFlag(false)
    const m = getMetalMaterial('#b8923f', 'brushed-brass')
    expect(m).toBeInstanceOf(MeshStandardMaterial)
    expect(m).not.toBeInstanceOf(MeshPhysicalMaterial)
    expect(m.metalness).toBeCloseTo(0.95, 2)
    expect(m.normalMap).toBeNull()
  })

  it('getSurfaceMaterial("brass") routes to a warm brushed-brass metal', async () => {
    const { getSurfaceMaterial, getMetalMaterial } = await loadWithFlag(true)
    // Canonical brass tint regardless of the passed colour (hardware convention).
    expect(getSurfaceMaterial('brass', '#ffffff', 1)).toBe(
      getMetalMaterial('#b8923f', 'brushed-brass', 1),
    )
  })
})
