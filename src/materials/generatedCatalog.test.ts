import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import credits from '../../public/assets/CREDITS.json'
import { GENERATED_MATERIALS } from './generatedCatalog'

/**
 * Integrity tests for the bundled (auto-generated) CC0 PBR finishes catalog —
 * the Poly Haven / ambientCG sets fetched by `npm run fetch-assets` and indexed
 * into `generatedCatalog.ts`. Covers PHOTO-PBR-MAPS: every bundled entry must be
 * well-formed, licensed + credited, and back its texture URLs with real files on
 * disk. Also asserts the still-procedural-only tokens the PBR-MAPS extension set
 * out to cover (fabric / leather / metal + wood / tile / concrete variants) are
 * now bundled.
 */

const PUBLIC_ROOT = join(__dirname, '../../public')

// Convert a baked `${BASE_URL}assets/...` runtime URL back to a public/ path.
function toPublicPath(url: string): string {
  return join(PUBLIC_ROOT, url.replace(/^\/?/, '').replace(/^assets/, 'assets'))
}

describe('GENERATED_MATERIALS (bundled CC0 PBR finishes)', () => {
  it('is non-empty and every entry is a textured floor/wall finish', () => {
    expect(GENERATED_MATERIALS.length).toBeGreaterThan(0)
    for (const m of GENERATED_MATERIALS) {
      expect(m.kind).toBe('textured')
      expect(['floor', 'wall']).toContain(m.category)
      expect(m.id).toBeTruthy()
      expect(m.name).toBeTruthy()
      if (m.kind !== 'textured') continue
      expect(m.uvScale[0]).toBeGreaterThan(0)
      expect(m.uvScale[1]).toBeGreaterThan(0)
    }
  })

  it('has unique ids', () => {
    const ids = GENERATED_MATERIALS.map((m) => m.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('every entry has a parseable CC0 source URL', () => {
    for (const m of GENERATED_MATERIALS) {
      if (m.kind !== 'textured') continue
      expect(() => new URL(m.sourceUrl ?? '')).not.toThrow()
      expect(['polyhaven', 'ambientcg']).toContain(m.source)
    }
  })

  it('every entry has an albedo map, and its texture files exist on disk', () => {
    for (const m of GENERATED_MATERIALS) {
      if (m.kind !== 'textured') continue
      expect(m.textures.albedo).toBeTruthy()
      for (const url of [m.textures.albedo, m.textures.normal, m.textures.roughness]) {
        if (!url) continue
        expect(existsSync(toPublicPath(url)), `missing file for ${m.id}: ${url}`).toBe(true)
      }
    }
  })

  it('every bundled entry is licensed + credited in CREDITS.json', () => {
    const credited = new Map(credits.materials.map((c) => [c.id, c]))
    for (const m of GENERATED_MATERIALS) {
      const c = credited.get(m.id)
      expect(c, `${m.id} not in CREDITS.json`).toBeDefined()
      expect(c?.license).toBe('CC0')
      expect(c?.attribution).toBeTruthy()
    }
  })

  it('covers the PHOTO-PBR-MAPS extension tokens (fabric/leather/metal + wood/tile/concrete)', () => {
    const ids = new Set(GENERATED_MATERIALS.map((m) => m.id))
    // fabric / leather / metal — previously procedural-only (no bundled maps).
    expect(ids.has('wall-fabric-denim')).toBe(true)
    expect(ids.has('wall-leather-white')).toBe(true)
    expect(ids.has('wall-metal-plate')).toBe(true)
    // additional wood / tile / concrete variants.
    expect(ids.has('floor-wood-natural')).toBe(true)
    expect(ids.has('floor-tile-stone')).toBe(true)
    // floor-concrete overrides the procedural bare-concrete floor with a bundled set.
    expect(ids.has('floor-concrete')).toBe(true)
  })
})
