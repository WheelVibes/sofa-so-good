/**
 * PHOTO-POM extension to scanned finishes. The procedural path can synthesise a
 * height field from its pattern label; a photo scan cannot, so an actual
 * displacement map is a hard requirement — that is the whole reason shipping
 * ambientCG's Displacement channel is worth the bytes.
 */
import { describe, expect, it } from 'vitest'
import { POM_PHOTO_HEIGHT_SCALE, pomPhotoFloorEligible } from './pomFloor'
import type { TexturedMaterialDef } from './types'

function def(textures: Partial<TexturedMaterialDef['textures']> = {}): TexturedMaterialDef {
  return {
    id: 'ambientcg:Tiles102:1k',
    name: 'Tiles 102',
    category: 'floor',
    kind: 'textured',
    source: 'ambientcg',
    swatch: '#c3c3e1',
    textures: { albedo: 'albedo.webp', ...textures },
    uvScale: [0.6, 0.6],
  }
}

describe('pomPhotoFloorEligible', () => {
  it('needs a displacement map — a scan without one has no relief to march', () => {
    expect(pomPhotoFloorEligible(def(), 'realistic', true)).toBe(false)
    expect(pomPhotoFloorEligible(def({ displacement: 'height.webp' }), 'realistic', true)).toBe(
      true,
    )
  })

  it('is gated to High / Maximum, matching the procedural path', () => {
    const d = def({ displacement: 'height.webp' })
    expect(pomPhotoFloorEligible(d, 'performance', true)).toBe(false)
    expect(pomPhotoFloorEligible(d, 'performance', true)).toBe(false)
    expect(pomPhotoFloorEligible(d, 'realistic', true)).toBe(true)
    expect(pomPhotoFloorEligible(d, 'realistic', true)).toBe(true)
  })

  it('respects the pomFloors flag', () => {
    expect(pomPhotoFloorEligible(def({ displacement: 'h.webp' }), 'realistic', false)).toBe(false)
  })

  it('reads runtimeUrls when present (hydrated user/remote material)', () => {
    // A rehydrated remote material carries blob URLs in runtimeUrls; the
    // persisted `textures` may still hold the original https paths.
    const d: TexturedMaterialDef = {
      ...def(),
      runtimeUrls: { albedo: 'blob:a', displacement: 'blob:h' },
    }
    expect(pomPhotoFloorEligible(d, 'realistic', true)).toBe(true)
  })

  it('does not fall back to a procedural height scale', () => {
    // A scan carries no pattern label, so the depth is a single conservative
    // constant rather than the per-pattern table.
    expect(POM_PHOTO_HEIGHT_SCALE).toBeGreaterThan(0)
    expect(POM_PHOTO_HEIGHT_SCALE).toBeLessThan(0.04)
  })
})
