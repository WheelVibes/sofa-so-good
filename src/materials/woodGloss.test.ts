// @vitest-environment happy-dom
import { beforeAll, describe, expect, it } from 'vitest'
import {
  FURNITURE_WOOD_WAVER,
  getPaintedMaterial,
  getWoodMaterial,
  WOOD_BASE_ROUGHNESS,
} from './furnitureMaterials'

// happy-dom has no real 2D context; stub the minimum the canvas bakes need (the
// same shim the MAT-004 / metalNoIbl material tests use).
beforeAll(() => {
  const ctx = {
    createImageData: (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4) }),
    putImageData: () => {},
  }
  // biome-ignore lint/suspicious/noExplicitAny: minimal 2D-context stub for the test env.
  HTMLCanvasElement.prototype.getContext = (() => ctx) as any
})

describe('furniture wood gloss (WOOD-GLOSS)', () => {
  it('is matte enough to read as oiled timber, not varnish', () => {
    // 0.85 is the value actually measured in the live sweep (0.5 / 0.7 / 0.85 over the
    // 90 wood-signature materials on the default flat): 0.5 and 0.7 both show mirror
    // ribbons on the dining table, 0.85 does not. Re-run
    // `scripts/dev-probes/walk-tour.mjs ROUGH=…` before moving it.
    expect(WOOD_BASE_ROUGHNESS).toBe(0.85)
    expect(getWoodMaterial('#a87f4f').roughness).toBe(WOOD_BASE_ROUGHNESS)
  })

  // The regression this guards. Wood used to sit at 0.5 while painted sat at 0.72, so the
  // app rendered timber SHINIER than paint — backwards, and the tight specular lobe turned
  // the grain normal's waviness into cling-film highlights.
  it('is never glossier than painted furniture', () => {
    const painted = getPaintedMaterial('#a87f4f', false)
    expect(getWoodMaterial('#a87f4f').roughness).toBeGreaterThanOrEqual(painted.roughness)
  })

  it('still lets a caller ask for a shinier wood explicitly', () => {
    // Doors deliberately pass their own value; the default must not override a caller.
    expect(getWoodMaterial('#a87f4f', 1, 0.45).roughness).toBe(0.45)
  })

  it('keeps roughness in the cache key so two finishes cannot collide', () => {
    const matte = getWoodMaterial('#a87f4f', 1, 0.85)
    const shiny = getWoodMaterial('#a87f4f', 1, 0.45)
    expect(matte).not.toBe(shiny)
    expect(matte.roughness).toBe(0.85)
    expect(shiny.roughness).toBe(0.45)
  })
})

describe('furniture wood grain shape (WOOD-BANDS)', () => {
  it('keeps the ring meander well under one half-cycle', () => {
    // `getWoodMaps` lays 7 rings across the tile as `(u + waver + phase) * PI * 7`, so a
    // waver of W shifts a ring by W * 7 half-cycles. At the old 0.12 that was ~0.84 — a
    // wide band snaking nearly a WHOLE band-width as it rose, which read as hard zigzag
    // chevrons ("zebra moiré", the artefact SNV-BOARDS warns about) on the default
    // main-bedroom wardrobe. A sawn board's rings run essentially parallel.
    const RINGS = 7
    expect(FURNITURE_WOOD_WAVER * RINGS).toBeLessThan(0.35)
    // ...but not zero: a perfectly ruled grid reads as printed paper, not timber.
    expect(FURNITURE_WOOD_WAVER).toBeGreaterThan(0)
  })

  it('ships the value that was measured', () => {
    expect(FURNITURE_WOOD_WAVER).toBe(0.04)
  })
})
