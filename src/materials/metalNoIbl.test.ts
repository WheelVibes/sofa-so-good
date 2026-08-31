// @vitest-environment happy-dom
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { getMetalMaterial } from './furnitureMaterials'
import { isIblActive, setIblActive } from './iblSignal'

// happy-dom has no real 2D context; stub the minimum `canvasFrom` needs (the
// same shim the MAT-004 / MAT-001 material tests use).
beforeAll(() => {
  const ctx = {
    createImageData: (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4) }),
    putImageData: () => {},
  }
  // biome-ignore lint/suspicious/noExplicitAny: minimal 2D-context stub for the test env.
  HTMLCanvasElement.prototype.getContext = (() => ctx) as any
})

afterEach(() => setIblActive(true))

describe('metal materials without image-based lighting', () => {
  it('defaults to IBL-active so the physical presets are the baseline', () => {
    expect(isIblActive()).toBe(true)
  })

  it('keeps the physically-correct metalness when an environment exists', () => {
    setIblActive(true)
    expect(getMetalMaterial('#d8dade', 'stainless').metalness).toBeGreaterThan(0.8)
  })

  it('caps metalness when there is no environment to reflect', () => {
    // The Performance tier runs ibl:false, leaving scene.environment null. A
    // fully metallic surface has no diffuse term, so it rendered pure black —
    // the fridge/stove/hood turned the default kitchen into a grey box.
    setIblActive(false)
    const m = getMetalMaterial('#d8dade', 'stainless')
    expect(m.metalness).toBeLessThanOrEqual(0.25)
    expect(`#${m.color.getHexString()}`).toBe('#d8dade')
  })

  // IBL-CAP-LIVE: this used to assert the cache was KEYED on the IBL state, so a
  // switch handed back a second, differently-built material. That was only half a
  // fix — a mesh already mounted keeps the material it was given, so the cap
  // tracked the tier only for consumers that re-render on it. Measured on the
  // default flat at `performance`, the wardrobe frame panels were still at
  // metalness 0.75 while the (subscribing) door pull was correctly capped. The
  // contract is now stronger: ONE cached material whose metalness is re-derived
  // in place whenever the IBL state changes.
  it('re-derives ONE cached material in place across IBL changes', () => {
    setIblActive(true)
    const withIbl = getMetalMaterial('#cfd2d6', 'stainless')
    const full = withIbl.metalness
    setIblActive(false)
    const without = getMetalMaterial('#cfd2d6', 'stainless')
    // Same instance — the key no longer splits on IBL state.
    expect(without).toBe(withIbl)
    // ...and the already-held reference was updated, which is the point.
    expect(withIbl.metalness).toBeLessThan(full)
    expect(withIbl.metalness).toBeLessThanOrEqual(0.25)
    // Promoting back must LIFT the cap, or one demotion flattens metals forever.
    setIblActive(true)
    expect(withIbl.metalness).toBe(full)
  })

  it('never raises metalness above the preset', () => {
    setIblActive(false)
    for (const finish of ['stainless', 'satin', 'black-steel', 'brushed-brass'] as const) {
      const capped = getMetalMaterial('#c4c8ce', finish)
      setIblActive(true)
      const full = getMetalMaterial('#c4c8ce', finish)
      setIblActive(false)
      expect(capped.metalness).toBeLessThanOrEqual(full.metalness)
    }
  })
})
