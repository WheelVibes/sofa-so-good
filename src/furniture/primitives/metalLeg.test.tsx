import { MeshPhysicalMaterial, MeshStandardMaterial } from 'three'
import { beforeAll, describe, expect, it, vi } from 'vitest'

/**
 * METAL-LEGS — `shared.tsx:metalLeg` routes furniture metal legs / frames /
 * rails through the shared brushed-metal material (`getMetalMaterial`). Like the
 * appliance-body wiring, the behaviour is gated behind `pbrSurfaces`, so the
 * CLAUDE.md hard rule applies: test BOTH modes — a `MeshPhysicalMaterial` with
 * brush maps + anisotropy when on (Pro / HQ tiers), an identical-to-today plain
 * `MeshStandardMaterial` (no maps) when off (Simple / Performance tier).
 *
 * happy-dom has no real 2D context, so stub a minimal `createImageData`/
 * `putImageData` (as the appliance-body + material tests do) so the brushed-metal
 * map bake runs when pbrSurfaces is on.
 */
beforeAll(() => {
  const ctx = {
    createImageData: (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4) }),
    putImageData: () => {},
  }
  // biome-ignore lint/suspicious/noExplicitAny: minimal 2D-context stub for the test env.
  HTMLCanvasElement.prototype.getContext = (() => ctx) as any
})

async function load(pbrOn: boolean) {
  vi.resetModules()
  // Preserve the rest of the module (e.g. `resolveFlags`, pulled in transitively)
  // and override only `isFeatureEnabled`.
  vi.doMock('../../features/featureFlags', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../../features/featureFlags')>()
    return {
      ...actual,
      isFeatureEnabled: (flag: string) => (flag === 'pbrSurfaces' ? pbrOn : false),
    }
  })
  return import('./shared')
}

describe('metalLeg (METAL-LEGS shared brushed-metal helper, both modes)', () => {
  it('Pro/realism on (pbrSurfaces) → a physical material with brush maps + anisotropy', async () => {
    const { metalLeg } = await load(true)
    const m = metalLeg('#cfd2d6', 'stainless')
    expect(m).toBeInstanceOf(MeshPhysicalMaterial)
    expect(m.normalMap, 'expected a brushed-metal normal map under pbrSurfaces').not.toBeNull()
    expect(m.roughnessMap, 'expected a brushed roughness-streak map').not.toBeNull()
    expect((m as MeshPhysicalMaterial).anisotropy).toBeGreaterThan(0)
    expect((m as MeshPhysicalMaterial).anisotropyRotation).toBe(0)
    expect(m.metalness).toBeGreaterThan(0.8)
  })

  it('Simple/Performance off → plain MeshStandardMaterial, no brush maps (unchanged flat look)', async () => {
    const { metalLeg } = await load(false)
    const m = metalLeg('#cfd2d6', 'stainless')
    expect(m).toBeInstanceOf(MeshStandardMaterial)
    expect(m).not.toBeInstanceOf(MeshPhysicalMaterial)
    expect(m.normalMap, 'no brush normal map when pbrSurfaces is off').toBeNull()
    expect(m.roughnessMap, 'no brush roughness map when pbrSurfaces is off').toBeNull()
    // Still reads as metal: high metalness.
    expect(m.metalness).toBeGreaterThan(0.8)
  })

  it('defaults to a bright stainless chrome finish', async () => {
    const { metalLeg } = await load(true)
    expect(metalLeg()).toBe(metalLeg('#cfd2d6', 'stainless'))
  })

  it('shares one cached instance per (finish, color); finishes differ', async () => {
    const { metalLeg } = await load(true)
    // Same params → same shared GPU material (so every leg/frame reuses one).
    expect(metalLeg('#2b2b2b', 'black-steel')).toBe(metalLeg('#2b2b2b', 'black-steel'))
    // Different finish / colour → distinct instances.
    expect(metalLeg('#2b2b2b', 'black-steel')).not.toBe(metalLeg('#2b2b2b', 'satin'))
    expect(metalLeg('#2b2b2b', 'black-steel')).not.toBe(metalLeg('#cfd2d6', 'black-steel'))
  })

  it('black-steel is matter than stainless (preset carried through, both physical)', async () => {
    const { metalLeg } = await load(true)
    const stainless = metalLeg('#cfd2d6', 'stainless')
    const black = metalLeg('#26282b', 'black-steel')
    expect(stainless).toBeInstanceOf(MeshPhysicalMaterial)
    expect(black).toBeInstanceOf(MeshPhysicalMaterial)
    expect(black.roughness).toBeGreaterThan(stainless.roughness)
  })
})
