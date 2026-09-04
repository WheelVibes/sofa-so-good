// @vitest-environment happy-dom
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { useStore } from '../state/store'
import { getFlutedRibMaterial, getSurfaceMaterial } from './furnitureMaterials'

/**
 * FLUTE-NORMAL (v0.31.8.97) — a painted fluted rib carries the profile normal
 * map; a WOOD one must not.
 *
 * A material has exactly ONE `normalMap` slot, so attaching the flute profile
 * REPLACES whatever the base finish had. For `wood` that would throw away
 * `getWoodMaterial`'s grain — and the grain is the entire reason a wood flute
 * already reads face-on (v0.31.8.80), while both shipped presets use tinted
 * wood. So the scoping is the load-bearing part of this feature, not an
 * optimisation.
 */
describe('fluted rib material', () => {
  // happy-dom has no real 2D canvas, so stub the minimum the shared
  // micro-normals need to bake — the same pattern as `catAMaterials.test.ts`.
  beforeAll(() => {
    const ctx = {
      createImageData: (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4) }),
      putImageData: () => {},
    }
    // biome-ignore lint/suspicious/noExplicitAny: minimal 2D-context stub for the test env.
    HTMLCanvasElement.prototype.getContext = (() => ctx) as any
  })

  beforeEach(() => {
    useStore.getState().setUiMode('pro')
    useStore.getState().reresolveFeatureFlags()
  })

  it('gives a painted rib its own material with a normal map', () => {
    const plain = getSurfaceMaterial('painted', '#d8d2c8', 2, 0)
    const rib = getFlutedRibMaterial('painted', '#d8d2c8', 2, 0)
    expect(rib).not.toBe(plain)
    expect(rib.normalMap).not.toBeNull()
    // Deliberately exaggerated past the real cylinder — see FLUTE_N_SCALE.
    expect(rib.normalScale.x).toBeGreaterThan(1)
  })

  it('gives a gloss rib the same treatment', () => {
    const rib = getFlutedRibMaterial('gloss', '#d8d2c8', 2, 0)
    expect(rib.normalMap).not.toBeNull()
  })

  it('leaves a WOOD rib on the shared material, grain intact', () => {
    const plain = getSurfaceMaterial('wood', '#8a6b48', 2, 0)
    const rib = getFlutedRibMaterial('wood', '#8a6b48', 2, 0)
    expect(rib).toBe(plain)
  })

  it('caches per finish+colour so 50 ribs share one material', () => {
    const a = getFlutedRibMaterial('painted', '#112233', 2, 0)
    const b = getFlutedRibMaterial('painted', '#112233', 2, 0)
    expect(a).toBe(b)
    const other = getFlutedRibMaterial('painted', '#445566', 2, 0)
    expect(other).not.toBe(a)
  })

  it('falls back to the plain finish when pbrSurfaces is off (Simple hides nothing here)', () => {
    // `pbrSurfaces` is the same gate as the shared paint micro-normal. With it
    // off, a rib must be the ordinary material rather than a second code path.
    useStore.getState().setUiMode('simple')
    useStore.getState().reresolveFeatureFlags()
    const on = useStore.getState().featureFlags.pbrSurfaces
    const rib = getFlutedRibMaterial('painted', '#a1b2c3', 2, 0)
    if (on) expect(rib.normalMap).not.toBeNull()
    else expect(rib).toBe(getSurfaceMaterial('painted', '#a1b2c3', 2, 0))
  })
})
