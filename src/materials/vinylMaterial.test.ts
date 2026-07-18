// @vitest-environment happy-dom
import { MeshPhysicalMaterial, MeshStandardMaterial } from 'three'
import { beforeAll, describe, expect, it, vi } from 'vitest'

/**
 * The `getVinylMaterial` PVC-laminate door finish (bifold door default,
 * `openingStyles`) is gated behind `pbrSurfaces` exactly like `getMetalMaterial`
 * (MAT-004) — CLAUDE.md hard rule: test BOTH states. happy-dom has no real 2D
 * canvas context, so we stub a minimal `createImageData`/`putImageData` (as the
 * MAT-004/MAT-001 tests do) so the shared paint micro-normal can bake.
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

describe('getVinylMaterial (bifold door default finish, both pbrSurfaces modes)', () => {
  it('Pro/realism on → a physical material with a thin clearcoat + micro-normal', async () => {
    const { getVinylMaterial } = await loadWithFlag(true)
    const m = getVinylMaterial('#e8e6df')
    expect(m).toBeInstanceOf(MeshPhysicalMaterial)
    expect(m.normalMap, 'expected the shared paint micro-normal').not.toBeNull()
    expect((m as MeshPhysicalMaterial).clearcoat).toBeGreaterThan(0)
  })

  it('Simple/realism off → plain MeshStandardMaterial, no maps/clearcoat', async () => {
    const { getVinylMaterial } = await loadWithFlag(false)
    const m = getVinylMaterial('#e8e6df')
    expect(m).toBeInstanceOf(MeshStandardMaterial)
    expect(m).not.toBeInstanceOf(MeshPhysicalMaterial)
    expect(m.normalMap).toBeNull()
  })

  it('reads as a smooth low-sheen plastic — rougher than lacquered gloss paint, glossier than matte paint', async () => {
    const { getVinylMaterial, getPaintedMaterial } = await loadWithFlag(true)
    const vinyl = getVinylMaterial('#e8e6df')
    const glossPaint = getPaintedMaterial('#e8e6df', true)
    const mattePaint = getPaintedMaterial('#e8e6df', false)
    expect(vinyl.roughness).toBeGreaterThan(glossPaint.roughness)
    expect(vinyl.roughness).toBeLessThan(mattePaint.roughness)
    // Vinyl's clearcoat reads less lacquered than gloss paint's own coat.
    expect((vinyl as MeshPhysicalMaterial).clearcoat).toBeLessThan(
      (glossPaint as MeshPhysicalMaterial).clearcoat,
    )
  })

  it('caches per colour — same colour returns the same instance, different colours differ', async () => {
    const { getVinylMaterial } = await loadWithFlag(true)
    expect(getVinylMaterial('#ffffff')).toBe(getVinylMaterial('#ffffff'))
    expect(getVinylMaterial('#ffffff')).not.toBe(getVinylMaterial('#222222'))
  })

  it('distinct roughness/metalness from wood and painted at the same colour (material axis reads distinctly)', async () => {
    const { getVinylMaterial, getWoodMaterial, getPaintedMaterial } = await loadWithFlag(true)
    const color = '#c9b28a'
    const vinyl = getVinylMaterial(color)
    const wood = getWoodMaterial(color)
    const painted = getPaintedMaterial(color)
    const roughnesses = new Set([vinyl.roughness, wood.roughness, painted.roughness])
    expect(roughnesses.size).toBeGreaterThan(1)
    // Wood carries grain texture maps; vinyl/painted don't.
    expect(wood.map).not.toBeNull()
    expect(vinyl.map).toBeNull()
  })
})
