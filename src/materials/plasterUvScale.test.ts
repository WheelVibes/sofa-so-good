import { describe, expect, it } from 'vitest'
import { BUILTIN_MATERIALS, PLASTER_UV_SCALE } from './builtinCatalog'

/**
 * PLASTER-STRETCH (v0.31.5.56) — the orange-peel plaster normal shipped at
 * `uvScale: [2.5, 2.5]`, one 256-square tile stretched across 2.5 m of wall.
 * Walls are ~45% of the walk view, so that single number was what made the
 * flat's largest surface read as damp concrete rather than paint.
 *
 * These pin the SHAPE of the fix, not a taste: plaster tiles at a millimetre
 * scale, limewash deliberately does not.
 */
describe('plaster UV scale', () => {
  it('tiles the orange-peel plaster at well under a metre', () => {
    // A 256-square tile at 0.6 m puts one texel at ~2.3 mm — the size of a real
    // orange-peel bump. Anything approaching a metre stops reading as texture.
    expect(PLASTER_UV_SCALE[0]).toBeLessThanOrEqual(1)
    expect(PLASTER_UV_SCALE[0]).toBe(PLASTER_UV_SCALE[1])
    // 0.15 m measured a FALL in microcontrast (the Nyquist rolloff), so the
    // shipped value must keep clear of that edge as well.
    expect(PLASTER_UV_SCALE[0]).toBeGreaterThanOrEqual(0.3)
  })

  it('applies that scale to every plaster finish', () => {
    const plaster = Object.values(BUILTIN_MATERIALS).filter(
      (m) => 'pattern' in m && m.pattern === 'plaster',
    )
    expect(plaster.length).toBeGreaterThan(5)
    for (const m of plaster) {
      expect('uvScale' in m ? m.uvScale : null, `${m.id} should tile at the plaster scale`).toEqual(
        PLASTER_UV_SCALE,
      )
    }
  })

  it('leaves limewash broad, because limewash really is a cloudy finish', () => {
    const limewash = Object.values(BUILTIN_MATERIALS).filter(
      (m) => 'pattern' in m && m.pattern === 'limewash',
    )
    expect(limewash.length).toBeGreaterThan(0)
    for (const m of limewash) {
      expect('uvScale' in m ? m.uvScale?.[0] : 0, `${m.id} should stay broad`).toBeGreaterThan(1)
    }
  })
})

/**
 * PLASTER-SCALE (v0.31.5.57) — the composer's "Scale" slider was a dead control
 * on plaster: `cache.ts`'s plaster branch handed back the shared singleton and
 * ignored `def.uvScale`, so x0.5, x1 and x2 all drew identical tiling. These pin
 * the two halves of the fix that are pure logic.
 */
describe('composed plaster tiling', () => {
  it('derives its tile size from the catalog rather than restating it', async () => {
    const { COMPOSE_TEXTURES } = await import('./composeMaterial')
    const plaster = COMPOSE_TEXTURES.find((t) => t.pattern === 'plaster')
    // A stale copy here would put the old 2.5 m stretch back on every composed
    // plaster finish, now that the plaster branch honours `def.uvScale`.
    expect(plaster?.uvScale).toEqual(PLASTER_UV_SCALE)
  })

  it('scales that tile size by the slider, in both directions', async () => {
    const { composeMaterialId, composedMaterialDef } = await import('./composeMaterial')
    const at = (scale: number) => {
      const def = composedMaterialDef(composeMaterialId('plaster', '#f5f5f0', scale), 'wall')
      return def && 'uvScale' in def ? def.uvScale?.[0] : null
    }
    expect(at(1)).toBeCloseTo(PLASTER_UV_SCALE[0])
    expect(at(2)).toBeCloseTo(PLASTER_UV_SCALE[0] * 2)
    expect(at(0.5)).toBeCloseTo(PLASTER_UV_SCALE[0] * 0.5)
  })
})
