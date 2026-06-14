import { NoColorSpace, SRGBColorSpace } from 'three'
import { beforeAll, describe, expect, it } from 'vitest'

/**
 * PHOTO-COLORSPACE regression guard: the procedural furniture materials must tag
 * their **albedo** (colour) maps `SRGBColorSpace` and leave their **data** maps
 * (normal / roughness) at the linear `NoColorSpace` default. Getting this wrong
 * is the #1 cause of a "flat / off vs reference" render (see PHOTOREALISM.md).
 *
 * happy-dom returns no real 2D canvas context, so the generators can't rasterise
 * here — we stub a minimal `createImageData`/`putImageData` so `canvasFrom` runs
 * and the `colorSpace` assignments (the thing under test) take effect.
 */
beforeAll(() => {
  const ctx = {
    createImageData: (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4) }),
    putImageData: () => {},
  }
  // biome-ignore lint/suspicious/noExplicitAny: minimal 2D-context stub for the test env.
  HTMLCanvasElement.prototype.getContext = (() => ctx) as any
})

describe('furniture material colour-management (PHOTO-COLORSPACE)', () => {
  it('tags albedo maps sRGB and data maps linear', async () => {
    const { getWoodMaterial, getStoneMaterial, getConcreteMaterial, getVelvetMaterial } =
      await import('./furnitureMaterials')

    for (const m of [
      getWoodMaterial('#a87f4f'),
      getStoneMaterial('#e8e4dc'),
      getConcreteMaterial('#9a9a96'),
      getVelvetMaterial('#3b5161'),
    ]) {
      // Albedo (colour) map → sRGB.
      expect(m.map?.colorSpace).toBe(SRGBColorSpace)
      // Normal map (data) → linear.
      if (m.normalMap) expect(m.normalMap.colorSpace).toBe(NoColorSpace)
      // Roughness map (data, when present) → linear.
      if (m.roughnessMap) expect(m.roughnessMap.colorSpace).toBe(NoColorSpace)
    }
  })
})
