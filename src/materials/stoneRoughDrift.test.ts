// @vitest-environment happy-dom
import { beforeAll, describe, expect, it, vi } from 'vitest'

/**
 * MAT-001 — the polished roughness drift on the shared marble singleton
 * (`getStoneMaterial` → `getMarbleMaps`) is gated behind `pbrSurfaces`, the
 * realism flag (the same gate as the existing PR6 tonal cloud). CLAUDE.md hard
 * rule: any `pbrSurfaces`-gated behaviour is tested in BOTH states — present
 * when on, legacy (no rough map) when off.
 *
 * `getMarbleMaps` memoises its singleton, so each state runs in a freshly
 * reset module with `isFeatureEnabled` mocked. happy-dom has no real 2D canvas
 * context, so we stub a minimal `createImageData`/`putImageData` (as the
 * colour-space test does) so `canvasFrom` runs.
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
  const mod = await import('./furnitureMaterials')
  return mod
}

describe('marble polished roughness drift gating (MAT-001, both modes)', () => {
  it('Pro/realism on (pbrSurfaces) → the stone material carries a roughness drift map', async () => {
    const { getStoneMaterial } = await loadWithFlag(true)
    const m = getStoneMaterial('#e8e4dc')
    expect(
      m.roughnessMap,
      'expected a polished roughness drift map under pbrSurfaces',
    ).not.toBeNull()
  })

  it('Simple/realism off → legacy uniform polish (no roughness map)', async () => {
    const { getStoneMaterial } = await loadWithFlag(false)
    const m = getStoneMaterial('#e8e4dc')
    expect(m.roughnessMap, 'expected no roughness map when pbrSurfaces is off').toBeNull()
  })
})
